"""
把 shows 表里的文本字段（price 形如"¥90起"，show_time 形如"2025/02/28 19:30"）
解析成结构化字段（price_min / show_dt / weekday），供筛选/排序使用。
解析不出来的留空，不影响其他字段正常显示，只是不会出现在"按星期几筛选"里。

可重复运行，每次全量重新解析。

运行：
    python normalize_shows.py
"""
import re
import sqlite3
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DB_PATH = SCRIPT_DIR / "xiudong.db"

PRICE_RE = re.compile(r"(\d+(?:\.\d+)?)")
SHOW_TIME_RE = re.compile(r"(\d{4})/(\d{1,2})/(\d{1,2})\s+(\d{1,2}):(\d{2})")


def parse_price(price_text):
    if not price_text:
        return None
    m = PRICE_RE.search(price_text)
    if not m:
        return None
    return int(float(m.group(1)))


def parse_show_time(show_time_text):
    if not show_time_text:
        return None, None
    m = SHOW_TIME_RE.search(show_time_text)
    if not m:
        return None, None
    year, month, day, hour, minute = map(int, m.groups())
    try:
        dt = datetime(year, month, day, hour, minute)
    except ValueError:
        return None, None
    return dt.isoformat(), dt.weekday()


def main():
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("SELECT id, price, show_time FROM shows").fetchall()
    print(f"共 {len(rows)} 条记录，开始解析...")

    updated = 0
    for show_id, price_text, show_time_text in rows:
        price_min = parse_price(price_text)
        show_dt, weekday = parse_show_time(show_time_text)
        conn.execute(
            "UPDATE shows SET price_min = ?, show_dt = ?, weekday = ? WHERE id = ?",
            (price_min, show_dt, weekday, show_id),
        )
        updated += 1

    conn.commit()

    unparsed_time = conn.execute(
        "SELECT COUNT(*) FROM shows WHERE show_time IS NOT NULL AND show_time != '' AND show_dt IS NULL"
    ).fetchone()[0]
    unparsed_price = conn.execute(
        "SELECT COUNT(*) FROM shows WHERE price IS NOT NULL AND price != '' AND price_min IS NULL"
    ).fetchone()[0]
    conn.close()

    print(f"处理完成，共更新 {updated} 条。")
    print(f"其中 show_time 解析失败: {unparsed_time} 条，price 解析失败: {unparsed_price} 条（这些记录会从对应筛选结果里被自然排除，不影响其他字段）")


if __name__ == "__main__":
    main()
