from typing import Optional

from fastapi import APIRouter, Header
from sqlmodel import text

from app.db import engine, LIKE_OP
from app.auth_util import get_user_id_from_token

router = APIRouter()

# 秀动网接口本身不返回演出类型分类，只能靠标题关键词排除脱口秀/话剧/舞剧/古典音乐会这类内容，
# 这个网站只想保留音乐节/livehouse/演唱会。这几个词命中率高、跟真实想保留的标题基本不会撞车
# （用真实数据核对过）。"剧"单字/"沉浸式"/"演奏会"这种更宽泛的词会误伤真实的巡演/livehouse演出
# （比如很多歌手巡演办在"XX保利剧院"这类场馆，标题会带"剧"字），所以没放进来
NON_MUSIC_TITLE_KEYWORDS = [
    "话剧", "脱口秀", "喜剧", "舞剧", "音乐会", "音乐剧",
    "芭蕾", "戏剧", "越剧", "昆曲", "木偶剧", "舞台剧",
]


@router.get("/shows")
def list_shows(
    page: int = 1,
    page_size: int = 30,
    scope: str = "all",
    cities: Optional[str] = None,  # 逗号分隔的城市名，比如 "北京,上海"
    weekdays: Optional[str] = None,  # 逗号分隔的 0-6，比如 "0,5,6"
    max_price: Optional[int] = None,
    q: Optional[str] = None,
    sort: str = "time",  # time / price
    authorization: Optional[str] = Header(default=None),
):
    user_id = get_user_id_from_token(authorization)
    if scope == "followed" and not user_id:
        scope = "all"

    # 没有艺人信息的一般是脱口秀/话剧/展览这类非音乐演出，这个网站只关心有艺人的音乐现场
    where = ["s.performers IS NOT NULL", "s.performers != ''"]
    params: dict = {}

    for i, kw in enumerate(NON_MUSIC_TITLE_KEYWORDS):
        where.append(f"s.title NOT LIKE :nk{i}")
        params[f"nk{i}"] = f"%{kw}%"

    if cities:
        city_list = [c.strip() for c in cities.split(",") if c.strip()]
        if city_list:
            placeholders = ",".join(f":city{i}" for i in range(len(city_list)))
            where.append(f"s.city_name IN ({placeholders})")
            for i, c in enumerate(city_list):
                params[f"city{i}"] = c

    if q:
        where.append(f"(s.title {LIKE_OP} :q OR s.performers {LIKE_OP} :q OR s.site_name {LIKE_OP} :q)")
        params["q"] = f"%{q}%"

    if max_price is not None:
        where.append("(s.price_min IS NOT NULL AND s.price_min <= :max_price)")
        params["max_price"] = max_price

    if weekdays:
        day_list = [int(d) for d in weekdays.split(",") if d.strip() != ""]
        if day_list:
            placeholders = ",".join(f":wd{i}" for i in range(len(day_list)))
            where.append(f"s.weekday IN ({placeholders})")
            for i, d in enumerate(day_list):
                params[f"wd{i}"] = d

    with engine.connect() as conn:
        if scope == "followed" and user_id:
            artist_rows = conn.execute(
                text("SELECT artist_name FROM followed_artists WHERE user_id = :uid"),
                {"uid": user_id},
            ).all()
            followed_names = [r[0] for r in artist_rows]
            if not followed_names:
                return {"page": page, "page_size": page_size, "total": 0, "results": []}
            like_clauses = " OR ".join(f"s.performers {LIKE_OP} :fa{i}" for i in range(len(followed_names)))
            where.append(f"({like_clauses})")
            for i, name in enumerate(followed_names):
                params[f"fa{i}"] = f"%{name}%"

        where_sql = " AND ".join(where)
        rows = conn.execute(
            text(
                f"""
                SELECT s.id, s.title, s.performers, s.price, s.price_min, s.show_time,
                       s.show_dt, s.site_name, s.city_name, s.sold_out, s.poster_url, s.venue_id
                FROM shows s
                WHERE {where_sql}
                """
            ),
            params,
        ).mappings().all()

    results = [dict(r) for r in rows]

    if sort == "price":
        results.sort(key=lambda r: (r["price_min"] is None, r["price_min"]))
    else:
        results.sort(key=lambda r: (r["show_dt"] is None, r["show_dt"]))

    total = len(results)
    offset = (page - 1) * page_size
    page_results = results[offset: offset + page_size]

    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "results": page_results,
    }
