from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlmodel import text

from app.db import engine
from app.routers.me import require_user

router = APIRouter()


class VenueReviewBody(BaseModel):
    rating: int
    text: str = ""


@router.get("/venues/{venue_id}")
def get_venue(venue_id: int):
    with engine.connect() as conn:
        venue = conn.execute(
            text("SELECT id, name, city_name, lat, lng, formatted_address FROM venues WHERE id = :id"),
            {"id": venue_id},
        ).mappings().first()

        if not venue:
            raise HTTPException(status_code=404, detail="场馆不存在")

        rating_row = conn.execute(
            text(
                "SELECT AVG(rating) AS rating_avg, COUNT(*) AS review_count "
                "FROM venue_reviews WHERE venue_id = :id"
            ),
            {"id": venue_id},
        ).mappings().first()

        upcoming_shows = conn.execute(
            text(
                """
                SELECT id, title, performers, price, show_time, city_name, sold_out, poster_url
                FROM shows
                WHERE venue_id = :id
                ORDER BY show_dt IS NULL, show_dt ASC
                LIMIT 10
                """
            ),
            {"id": venue_id},
        ).mappings().all()

    result = dict(venue)
    result["rating_avg"] = rating_row["rating_avg"]
    result["review_count"] = rating_row["review_count"] or 0
    result["upcoming_shows"] = [dict(r) for r in upcoming_shows]
    return result


@router.get("/venues/{venue_id}/reviews")
def list_venue_reviews(venue_id: int):
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT vr.id, vr.rating, vr.text, vr.created_at,
                       CASE WHEN u.nickname != '' THEN u.nickname
                            ELSE '听众' || substr(u.phone, length(u.phone) - 3) END AS nickname
                FROM venue_reviews vr
                JOIN users u ON u.id = vr.user_id
                WHERE vr.venue_id = :id
                ORDER BY vr.created_at DESC
                """
            ),
            {"id": venue_id},
        ).mappings().all()
    return {"results": [dict(r) for r in rows]}


@router.post("/venues/{venue_id}/reviews")
def submit_venue_review(venue_id: int, body: VenueReviewBody, user_id: int = Depends(require_user)):
    if not (1 <= body.rating <= 5):
        raise HTTPException(status_code=400, detail="评分必须是1到5")
    with engine.connect() as conn:
        venue = conn.execute(text("SELECT id FROM venues WHERE id = :id"), {"id": venue_id}).first()
        if not venue:
            raise HTTPException(status_code=404, detail="场馆不存在")
        conn.execute(
            text(
                "INSERT INTO venue_reviews (user_id, venue_id, rating, text, created_at) "
                "VALUES (:uid, :vid, :rating, :text, :now)"
            ),
            {"uid": user_id, "vid": venue_id, "rating": body.rating, "text": body.text, "now": datetime.now().isoformat()},
        )
        conn.commit()
    return {"success": True}
