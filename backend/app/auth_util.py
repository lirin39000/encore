from datetime import datetime
from typing import Optional

from sqlmodel import text

from app.db import engine


def get_user_id_from_token(authorization_header: Optional[str]) -> Optional[int]:
    """从 `Authorization: Bearer <token>` 里查出对应的 user_id，查不到/过期返回 None（当匿名用户处理）"""
    if not authorization_header or not authorization_header.startswith("Bearer "):
        return None
    token = authorization_header.removeprefix("Bearer ").strip()
    if not token:
        return None

    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT user_id FROM sessions WHERE token = :token AND expires_at > :now"),
            {"token": token, "now": datetime.now().isoformat()},
        ).first()
    return row[0] if row else None
