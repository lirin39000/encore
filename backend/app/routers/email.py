"""
邮件里那两个链接的落地接口。跟 /me 下面的接口不一样，这两个是免登录的——用户是在
邮件客户端里点开的，不可能带着我们的登录态。身份完全靠 URL 里的随机 token 证明，
所以 token 用 secrets 生成、且验证 token 用一次就作废。

返回的是 HTML 而不是 JSON，因为点开就是一个浏览器页面。
"""
from datetime import datetime

from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from sqlmodel import text

from app.db import engine
from app.services.email_content import simple_page
from app.services.show_matching import seed_notify_log

router = APIRouter(prefix="/email")


@router.get("/verify", response_class=HTMLResponse)
def verify_email(token: str = ""):
    if not token:
        return HTMLResponse(simple_page("链接不完整", "请直接点击邮件里的按钮，或者把完整地址复制到浏览器。"), status_code=400)

    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT user_id, email, verified, verify_token_expires_at "
                "FROM email_subscriptions WHERE verify_token = :t"
            ),
            {"t": token},
        ).mappings().first()

        if not row:
            # token 对不上有两种情况：从没存在过，或者已经被用掉/被换掉了。
            # 后者最常见的场景是用户点了两次链接，所以话别说得像出了错
            return HTMLResponse(
                simple_page("链接已失效", "这个链接可能已经用过了。如果订阅没生效，回 LiveFlow 重新发一封验证邮件。"),
                status_code=400,
            )

        expires_at = row["verify_token_expires_at"]
        if expires_at and datetime.fromisoformat(expires_at) < datetime.now():
            return HTMLResponse(
                simple_page("链接已过期", "验证链接超过 24 小时就失效了，回 LiveFlow 重新发一封。"),
                status_code=400,
            )

        user_id = row["user_id"]
        conn.execute(
            text(
                "UPDATE email_subscriptions SET verified = :t, active = :t, verified_at = :now, "
                "verify_token = NULL, verify_token_expires_at = NULL WHERE user_id = :uid"
            ),
            {"t": True, "now": datetime.now().isoformat(), "uid": user_id},
        )
        # 把此刻已经匹配上的存量演出标成"已通知"，否则明天第一封提醒会把库里
        # 几十上百场旧演出当成"上新"一次性发过去
        seeded = seed_notify_log(conn, user_id)
        conn.commit()

    message = (
        f"以后你关注的艺人有新演出，我们会发到 {row['email']}。<br>"
        f"当前已关注艺人对应的 {seeded} 场演出不会重复提醒，可以直接去网站里看。"
        if seeded
        else f"以后你关注的艺人有新演出，我们会发到 {row['email']}。"
    )
    return HTMLResponse(simple_page("订阅成功", message))


@router.get("/unsubscribe", response_class=HTMLResponse)
def unsubscribe(token: str = ""):
    if not token:
        return HTMLResponse(simple_page("链接不完整", "请直接点击邮件底部的退订链接。"), status_code=400)

    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT user_id, email FROM email_subscriptions WHERE unsubscribe_token = :t"),
            {"t": token},
        ).mappings().first()
        if not row:
            return HTMLResponse(
                simple_page("链接已失效", "这个退订链接对应的订阅已经不存在了，你不会再收到提醒邮件。"),
                status_code=400,
            )
        # 退订只关推送、保留邮箱和验证状态，用户改主意时在网站上一键就能打开
        conn.execute(
            text("UPDATE email_subscriptions SET active = :f WHERE user_id = :uid"),
            {"f": False, "uid": row["user_id"]},
        )
        conn.commit()

    return HTMLResponse(
        simple_page("已退订", f"不会再往 {row['email']} 发演出提醒了。想恢复的话，去 LiveFlow 的「我的」页面重新打开。")
    )
