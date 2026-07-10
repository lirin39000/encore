"""
把 shows 表里出现过的场馆（site_name + city_name）批量转换成经纬度，
存进 venues 表，并回填 shows.venue_id。

只处理还没查过 / 上次查询失败的场馆，可以重复运行、增量执行。

高德只有场馆名+城市，没有详细街道地址，重名场馆可能定位不准，
用 geocode_level 记录匹配精度（兴趣点/道路/城市 等），方便以后排查。

请求间隔保持保守，避免触发高德的频率限制。

运行：
    python geocode_venues.py
"""
import sqlite3
import sys
import time
from pathlib import Path

import requests

SCRIPT_DIR = Path(__file__).resolve().parent
DB_PATH = SCRIPT_DIR / "xiudong.db"
REQUEST_DELAY_SECONDS = 1.5

sys.path.insert(0, str(SCRIPT_DIR.parent))
from app.config import AMAP_WEB_SERVICE_KEY  # noqa: E402

GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo"


def geocode(address, city):
    # 网络偶尔会被重置（跟之前抓秀动网数据时遇到的情况一样），失败重试一次，
    # 还不行就当作这个场馆查询失败处理，不要让整个批处理脚本崩掉。
    for attempt in range(2):
        try:
            resp = requests.get(
                GEOCODE_URL,
                params={"address": address, "city": city, "key": AMAP_WEB_SERVICE_KEY},
                timeout=10,
            )
            data = resp.json()
            break
        except requests.exceptions.RequestException as e:
            if attempt == 0:
                time.sleep(2)
                continue
            print(f"  网络请求失败，跳过: {address}（{e}）")
            return None

    if data.get("status") != "1" or not data.get("geocodes"):
        return None

    g = data["geocodes"][0]
    lng_str, lat_str = g["location"].split(",")
    return {
        "lat": float(lat_str),
        "lng": float(lng_str),
        "formatted_address": g.get("formatted_address"),
        "geocode_level": g.get("level"),
    }


def find_pending_venues(conn):
    return conn.execute(
        """
        SELECT DISTINCT s.site_name, s.city_name
        FROM shows s
        WHERE s.site_name IS NOT NULL AND s.site_name != ''
          AND NOT EXISTS (
              SELECT 1 FROM venues v
              WHERE v.name = s.site_name AND v.city_name = s.city_name
                AND v.geocode_status = 'ok'
          )
        """
    ).fetchall()


def upsert_venue(conn, name, city_name, geo_result):
    existing = conn.execute(
        "SELECT id FROM venues WHERE name = ? AND city_name = ?", (name, city_name)
    ).fetchone()

    if geo_result:
        values = (
            geo_result["lat"], geo_result["lng"], geo_result["formatted_address"],
            geo_result["geocode_level"], "ok",
        )
    else:
        values = (None, None, None, None, "failed")

    if existing:
        conn.execute(
            """UPDATE venues SET lat=?, lng=?, formatted_address=?, geocode_level=?,
               geocode_status=?, last_geocoded_at=datetime('now','localtime')
               WHERE id=?""",
            values + (existing[0],),
        )
        return existing[0]
    else:
        cur = conn.execute(
            """INSERT INTO venues (name, city_name, lat, lng, formatted_address,
               geocode_level, geocode_status, last_geocoded_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))""",
            (name, city_name) + values,
        )
        return cur.lastrowid


def backfill_show_venue_ids(conn):
    conn.execute(
        """
        UPDATE shows
        SET venue_id = (
            SELECT v.id FROM venues v
            WHERE v.name = shows.site_name AND v.city_name = shows.city_name
        )
        WHERE venue_id IS NULL AND site_name IS NOT NULL AND site_name != ''
        """
    )


def main():
    conn = sqlite3.connect(DB_PATH)
    pending = find_pending_venues(conn)
    print(f"待处理场馆数: {len(pending)}")

    ok_count, failed_count = 0, 0
    for i, (site_name, city_name) in enumerate(pending, 1):
        geo = geocode(site_name, city_name)
        upsert_venue(conn, site_name, city_name, geo)
        conn.commit()
        if geo:
            ok_count += 1
        else:
            failed_count += 1
        if i % 20 == 0:
            print(f"  进度 {i}/{len(pending)}（成功{ok_count} 失败{failed_count}）")
        time.sleep(REQUEST_DELAY_SECONDS)

    print("回填 shows.venue_id ...")
    backfill_show_venue_ids(conn)
    conn.commit()
    conn.close()

    print(f"完成。本次处理 {len(pending)} 个场馆，成功 {ok_count}，失败 {failed_count}。")


if __name__ == "__main__":
    main()
