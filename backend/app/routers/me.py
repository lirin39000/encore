from datetime import datetime

from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from sqlmodel import text

from app.db import engine
from app.auth_util import get_user_id_from_token

router = APIRouter(prefix="/me")


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
                SELECT s.id, s.title, s.performers, s.price, s.show_time, s.site_name,
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


