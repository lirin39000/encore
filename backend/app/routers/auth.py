import re
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from sqlmodel import text

from app.db import engine
from app.auth_util import get_user_id_from_token
from app.services import aliyun_sms

router = APIRouter(prefix="/auth")

PHONE_RE = re.compile(r"^1[3-9]\d{9}$")
SEND_INTERVAL_SECONDS = 60
SESSION_TTL_DAYS = 30


class SendCodeBody(BaseModel):
    phone: str


class VerifyCodeBody(BaseModel):
    phone: str
    code: str


@router.post("/send-code")
def send_code(body: SendCodeBody):
    if not PHONE_RE.match(body.phone):
        raise HTTPException(status_code=400, detail="手机号格式不对")

    with engine.connect() as conn:
        recent = conn.execute(
            text(
                "SELECT sent_at FROM sms_send_log WHERE phone = :phone "
                "ORDER BY sent_at DESC LIMIT 1"
            ),
            {"phone": body.phone},
        ).first()
        if recent:
            last_sent = datetime.fromisoformat(recent[0])
            if (datetime.now() - last_sent).total_seconds() < SEND_INTERVAL_SECONDS:
                raise HTTPException(status_code=429, detail="发送太频繁，请稍后再试")

        try:
            aliyun_sms.send_verify_code(body.phone)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"短信发送失败: {e}")

        conn.execute(
            text("INSERT INTO sms_send_log (phone, sent_at) VALUES (:phone, :now)"),
            {"phone": body.phone, "now": datetime.now().isoformat()},
        )
        conn.commit()

    return {"success": True}


@router.post("/verify-code")
def verify_code(body: VerifyCodeBody):
    if not aliyun_sms.check_verify_code(body.phone, body.code):
        raise HTTPException(status_code=400, detail="验证码不对或已过期")

    with engine.connect() as conn:
        user = conn.execute(
            text("SELECT id FROM users WHERE phone = :phone"), {"phone": body.phone}
        ).first()
        if user:
            user_id = user[0]
        else:
            result = conn.execute(
                text(
                    "INSERT INTO users (phone, nickname, created_at) VALUES (:phone, '', :now) RETURNING id"
                ),
                {"phone": body.phone, "now": datetime.now().isoformat()},
            )
            conn.commit()
            user_id = result.first()[0]

        token = secrets.token_urlsafe(32)
        expires_at = (datetime.now() + timedelta(days=SESSION_TTL_DAYS)).isoformat()
        conn.execute(
            text(
                "INSERT INTO sessions (token, user_id, created_at, expires_at) "
                "VALUES (:token, :user_id, :now, :expires_at)"
            ),
            {"token": token, "user_id": user_id, "now": datetime.now().isoformat(), "expires_at": expires_at},
        )
        conn.commit()

    return {"token": token}


@router.get("/me")
def get_me(authorization: str | None = Header(default=None)):
    user_id = get_user_id_from_token(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="未登录")

    with engine.connect() as conn:
        user = conn.execute(
            text("SELECT id, phone, nickname FROM users WHERE id = :id"), {"id": user_id}
        ).mappings().first()

    if not user:
        raise HTTPException(status_code=401, detail="未登录")

    return dict(user)


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        with engine.connect() as conn:
            conn.execute(text("DELETE FROM sessions WHERE token = :token"), {"token": token})
            conn.commit()
    return {"success": True}
