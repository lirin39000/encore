import hmac
from datetime import datetime
from typing import Optional

from sqlmodel import text

from app.config import WX_PROXY_SECRET
from app.db import engine


def get_user_id_from_openid(openid: Optional[str], proxy_secret: Optional[str]) -> Optional[int]:
    """
    小程序的身份路径：apiProxy 云函数把微信验证过的 openid 放在请求头里转发过来。

    请求头是客户端可以随便写的，光有 openid 不能证明任何事——所以必须同时带上只有
    云函数知道的共享密钥。密钥没配置时这条路径整个关闭，宁可小程序用不了，
    也不能变成"填个 openid 就能冒充别人"。

    比对用 compare_digest 而不是 ==：普通字符串比较会在第一个不同的字符处提前返回，
    通过测量响应时间可以一个字符一个字符地把密钥试出来。
    """
    if not WX_PROXY_SECRET or not openid or not proxy_secret:
        return None
    if not hmac.compare_digest(proxy_secret, WX_PROXY_SECRET):
        return None

    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT id FROM users WHERE openid = :openid"), {"openid": openid}
        ).first()
        if row:
            return row[0]
        # 小程序用户没有注册这一步，第一次调到需要身份的接口时顺手建号
        conn.execute(
            text("INSERT INTO users (openid, nickname, created_at) VALUES (:openid, '', :now)"),
            {"openid": openid, "now": datetime.now().isoformat()},
        )
        conn.commit()
        row = conn.execute(
            text("SELECT id FROM users WHERE openid = :openid"), {"openid": openid}
        ).first()
    return row[0] if row else None


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
