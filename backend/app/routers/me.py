import re
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from sqlmodel import text

from app.db import engine
from app.auth_util import get_user_id_from_token
from app.services import aliyun_dm
from app.services.email_content import verify_email_html

router = APIRouter(prefix="/me")

# 邮箱格式只做最基本的形状校验。真正能不能收信要靠后面那封验证邮件来证明，
# 在这里写一套复杂正则既拦不住假地址，又容易误伤合法的奇怪域名
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")

VERIFY_TOKEN_VALID_HOURS = 24
RESEND_COOLDOWN_SECONDS = 60


def require_user(authorization: str | None = Header(default=None)) -> int:
    user_id = get_user_id_from_token(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="请先登录")
    return user_id


class FollowArtistBody(BaseModel):
    artist_name: str


class ReviewBody(BaseModel):
    rating: int
    text: str = ""


# ---------- 关注艺人 ----------

@router.get("/followed-artists")
def list_followed_artists(user_id: int = Depends(require_user)):
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, artist_name FROM followed_artists WHERE user_id = :uid ORDER BY created_at DESC"),
            {"uid": user_id},
        ).mappings().all()
    return {"results": [dict(r) for r in rows]}


@router.post("/followed-artists")
def add_followed_artist(body: FollowArtistBody, user_id: int = Depends(require_user)):
    name = body.artist_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="艺人名不能为空")
    with engine.connect() as conn:
        existing = conn.execute(
            text("SELECT id FROM followed_artists WHERE user_id = :uid AND artist_name = :name"),
            {"uid": user_id, "name": name},
        ).first()
        if not existing:
            conn.execute(
                text(
                    "INSERT INTO followed_artists (user_id, artist_name, created_at) "
                    "VALUES (:uid, :name, :now)"
                ),
                {"uid": user_id, "name": name, "now": datetime.now().isoformat()},
            )
            conn.commit()
    return {"success": True}


@router.delete("/followed-artists/{artist_name}")
def remove_followed_artist(artist_name: str, user_id: int = Depends(require_user)):
    with engine.connect() as conn:
        conn.execute(
            text("DELETE FROM followed_artists WHERE user_id = :uid AND artist_name = :name"),
            {"uid": user_id, "name": artist_name},
        )
        conn.commit()
    return {"success": True}


# ---------- 收藏 ----------

@router.get("/favorites")
def list_favorites(user_id: int = Depends(require_user)):
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT s.id, s.title, s.performers, s.price, s.show_time, s.weekday, s.site_name,
                       s.city_name, s.sold_out, s.poster_url
                FROM favorites f JOIN shows s ON s.id = f.show_id
                WHERE f.user_id = :uid ORDER BY f.created_at DESC
                """
            ),
            {"uid": user_id},
        ).mappings().all()
    return {"results": [dict(r) for r in rows]}


@router.post("/favorites/{show_id}")
def add_favorite(show_id: int, user_id: int = Depends(require_user)):
    with engine.connect() as conn:
        existing = conn.execute(
            text("SELECT id FROM favorites WHERE user_id = :uid AND show_id = :sid"),
            {"uid": user_id, "sid": show_id},
        ).first()
        if not existing:
            conn.execute(
                text(
                    "INSERT INTO favorites (user_id, show_id, created_at) "
                    "VALUES (:uid, :sid, :now)"
                ),
                {"uid": user_id, "sid": show_id, "now": datetime.now().isoformat()},
            )
            conn.commit()
    return {"success": True}


@router.delete("/favorites/{show_id}")
def remove_favorite(show_id: int, user_id: int = Depends(require_user)):
    with engine.connect() as conn:
        conn.execute(
            text("DELETE FROM favorites WHERE user_id = :uid AND show_id = :sid"),
            {"uid": user_id, "sid": show_id},
        )
        conn.commit()
    return {"success": True}


# ---------- 邮件订阅 ----------

def _load_subscription(conn, user_id: int):
    return conn.execute(
        text(
            "SELECT email, verified, active, verify_sent_at, verify_token "
            "FROM email_subscriptions WHERE user_id = :uid"
        ),
        {"uid": user_id},
    ).mappings().first()


def _send_verify_mail(conn, user_id: int, email: str) -> None:
    """生成新的验证 token 存库并发信。发信失败要把异常抛出去，不能让前端以为已经发了"""
    token = secrets.token_urlsafe(32)
    now = datetime.now()
    conn.execute(
        text(
            "UPDATE email_subscriptions SET verify_token = :t, verify_token_expires_at = :exp, "
            "verify_sent_at = :now WHERE user_id = :uid"
        ),
        {
            "t": token,
            "exp": (now + timedelta(hours=VERIFY_TOKEN_VALID_HOURS)).isoformat(),
            "now": now.isoformat(),
            "uid": user_id,
        },
    )
    conn.commit()
    try:
        aliyun_dm.send_email(email, "确认订阅 LiveFlow 的演出提醒", verify_email_html(token))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"验证邮件发送失败，稍后再试（{e}）")


@router.get("/email-subscription")
def get_email_subscription(user_id: int = Depends(require_user)):
    with engine.connect() as conn:
        row = _load_subscription(conn, user_id)
    if not row:
        return {"subscription": None}
    return {
        "subscription": {
            "email": row["email"],
            "verified": bool(row["verified"]),
            "active": bool(row["active"]),
        }
    }


class EmailSubscriptionBody(BaseModel):
    email: str


@router.put("/email-subscription")
def set_email_subscription(body: EmailSubscriptionBody, user_id: int = Depends(require_user)):
    email = body.email.strip()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="邮箱格式看起来不对")

    with engine.connect() as conn:
        existing = _load_subscription(conn, user_id)
        if existing and existing["email"] == email and existing["verified"]:
            # 已经验证过的同一个邮箱，重新提交只当成"重新开启订阅"，不用再验一次
            conn.execute(
                text("UPDATE email_subscriptions SET active = :t WHERE user_id = :uid"),
                {"t": True, "uid": user_id},
            )
            conn.commit()
            return {"email": email, "verified": True, "active": True}

        now = datetime.now().isoformat()
        if existing:
            # 换邮箱等于换了个收件人，verified 必须清掉重新验证；退订 token 也一起换，
            # 免得旧邮箱里那些历史邮件的退订链接还能操作新邮箱的订阅
            conn.execute(
                text(
                    "UPDATE email_subscriptions SET email = :e, verified = :f, active = :t, "
                    "unsubscribe_token = :u, verified_at = NULL WHERE user_id = :uid"
                ),
                {"e": email, "f": False, "t": True, "u": secrets.token_urlsafe(32), "uid": user_id},
            )
        else:
            conn.execute(
                text(
                    "INSERT INTO email_subscriptions "
                    "(user_id, email, verified, active, unsubscribe_token, created_at) "
                    "VALUES (:uid, :e, :f, :t, :u, :now)"
                ),
                {
                    "uid": user_id, "e": email, "f": False, "t": True,
                    "u": secrets.token_urlsafe(32), "now": now,
                },
            )
        conn.commit()
        _send_verify_mail(conn, user_id, email)

    return {"email": email, "verified": False, "active": True}


@router.post("/email-subscription/resend")
def resend_verify_email(user_id: int = Depends(require_user)):
    with engine.connect() as conn:
        row = _load_subscription(conn, user_id)
        if not row:
            raise HTTPException(status_code=404, detail="还没有填写邮箱")
        if row["verified"]:
            raise HTTPException(status_code=400, detail="这个邮箱已经验证过了")
        if row["verify_sent_at"]:
            elapsed = (datetime.now() - datetime.fromisoformat(row["verify_sent_at"])).total_seconds()
            if elapsed < RESEND_COOLDOWN_SECONDS:
                raise HTTPException(
                    status_code=429,
                    detail=f"发得太频繁了，{int(RESEND_COOLDOWN_SECONDS - elapsed)} 秒后再试",
                )
        _send_verify_mail(conn, user_id, row["email"])
    return {"success": True}


@router.delete("/email-subscription")
def delete_email_subscription(user_id: int = Depends(require_user)):
    with engine.connect() as conn:
        conn.execute(
            text("DELETE FROM email_subscriptions WHERE user_id = :uid"),
            {"uid": user_id},
        )
        # notify_log 一起删掉：邮箱都不留了，"给这个人的哪些演出通知过"就是没主的死数据。
        # 以后重新订阅时会重新 seed 一遍，不依赖这份旧记录
        conn.execute(
            text("DELETE FROM email_notify_log WHERE user_id = :uid"),
            {"uid": user_id},
        )
        conn.commit()
    return {"success": True}


