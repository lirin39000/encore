"""
把本地暂存数据库里"真正会被网站展示"的演出记录导出成一份 JSON，
给 sync_to_wx_cloud 这个 Node 脚本读，同步进小程序用的微信云数据库。

只导出有艺人信息的记录(跟 /shows 接口的过滤逻辑一致——没有艺人信息的
一般是脱口秀/话剧/展览之类的非音乐内容；真正的"非音乐类演出"关键词过滤
已经在 clean_non_music_shows.py 这一步把对应记录从数据库里删掉了，
这里不用再重复判断)。

运行：
    python export_shows_json.py
"""
import json
import sqlite3
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DB_PATH = SCRIPT_DIR / "xiudong.db"
OUTPUT_PATH = SCRIPT_DIR / "shows_export.json"

COLUMNS = [
    "id", "title", "performers", "price", "price_min", "show_time",
    "show_dt", "weekday", "site_name", "city_name", "sold_out", "poster_url", "venue_id",
]


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        f"SELECT {', '.join(COLUMNS)} FROM shows WHERE performers IS NOT NULL AND performers != ''"
    ).fetchall()
    conn.close()

    records = [dict(row) for row in rows]
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False)

    print(f"导出 {len(records)} 条记录到 {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
