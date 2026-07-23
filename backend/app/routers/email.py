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
        # 不再 seed 存量演出：推送只发"最近才上新的"(靠 first_seen 判断)，不会把库里旧演出
        # 补发出去，所以不需要预先标记；而且 seed 会连刚上新的也标掉，反而让新用户漏收
        conn.commit()

    message = (
        f"以后你关注的艺人有新演出，我们会发到 {row['email']}。"
        "已经在售的演出可以直接去网站或小程序里看。"
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
        # 退订直接删掉订阅，而不是留一个"已暂停"的状态。留暂停状态有两个毛病：网页上
        # 看到邮箱还在、像是订阅着的，实际却收不到信；而且暂停期间演出会一直积压，
        # 重新打开时会收到一封列着几十上百场的邮件。想再订阅就重新填邮箱、重新验证一次
        conn.execute(
            text("DELETE FROM email_subscriptions WHERE user_id = :uid"),
            {"uid": row["user_id"]},
        )
        conn.execute(
            text("DELETE FROM email_notify_log WHERE user_id = :uid"),
            {"uid": row["user_id"]},
        )
        conn.commit()

    return HTMLResponse(
        simple_page("已退订", f"不会再往 {row['email']} 发演出提醒了。想恢复的话，去 LiveFlow 的「我的」页面重新填一次邮箱。")
    )
