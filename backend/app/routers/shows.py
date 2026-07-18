from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Header
from sqlmodel import text

from app.db import engine, LIKE_OP
from app.auth_util import get_user_id_from_token
from app.text_normalize import normalize_name
from app.non_music import NON_MUSIC_TITLE_KEYWORDS

router = APIRouter()


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

    # 已经过去的演出不应该再出现在列表里(之前一直没做这个过滤，抓过的演出会一直
    # 留在数据库里、也一直会被查出来，导致列表里能刷到早就办完的演出)。
    # show_dt 解析失败的记录(NULL)还是放行——没法确定它是不是已经过去，
    # 保守起见继续展示，跟其他地方对"解析失败"的宽松处理方式一致
    today_cn = datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()
    where.append("(s.show_dt IS NULL OR s.show_dt >= :today)")
    params["today"] = today_cn

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

    normalized_followed: list[str] = []
    with engine.connect() as conn:
        if scope == "followed" and user_id:
            artist_rows = conn.execute(
                text("SELECT artist_name FROM followed_artists WHERE user_id = :uid"),
                {"uid": user_id},
            ).all()
            followed_names = [r[0] for r in artist_rows]
            if not followed_names:
                return {"page": page, "page_size": page_size, "total": 0, "results": []}
            # 关注艺人的名字是用户自己打的，跟秀动官方名字可能有空格/简繁体差异，
            # 这种归一化没法直接翻成 SQL LIKE，所以这一步匹配挪到 Python 里做，
            # 数据库这边只按其他筛选条件(城市/星期/价格等)查，艺人过滤在下面统一处理
            normalized_followed = [normalize_name(n) for n in followed_names]

        where_sql = " AND ".join(where)
        rows = conn.execute(
            text(
                f"""
                SELECT s.id, s.title, s.performers, s.price, s.price_min, s.show_time,
                       s.show_dt, s.weekday, s.site_name, s.city_name, s.sold_out, s.poster_url, s.venue_id
                FROM shows s
                WHERE {where_sql}
                """
            ),
            params,
        ).mappings().all()

    results = [dict(r) for r in rows]

    if normalized_followed:
        results = [
            r for r in results
            if any(nf in normalize_name(r["performers"]) for nf in normalized_followed)
        ]

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


@router.get("/artists")
def search_artists(q: str = "", limit: int = 20):
    """
    艺人名搜索候选，给关注艺人的输入框用。名单来自 shows.performers 拆出来的所有艺人名，
    覆盖"抓到过至少一场演出"的艺人（不管这场演出是不是已经过去了），不是秀动网的完整艺人库
    （没有单独的艺人库接口，只能从已抓到的演出数据里反推）
    """
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT DISTINCT performers FROM shows WHERE performers IS NOT NULL AND performers != ''")
        ).all()

    names: set[str] = set()
    for (performers,) in rows:
        for name in performers.split("/"):
            name = name.strip()
            if name:
                names.add(name)

    q_norm = normalize_name(q)
    matches = [n for n in names if q_norm in normalize_name(n)] if q_norm else sorted(names)
    if q_norm:
        matches.sort(key=lambda n: (not normalize_name(n).startswith(q_norm), n))
    return {"results": matches[:limit]}
