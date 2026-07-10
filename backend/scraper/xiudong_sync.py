"""
把秀动网的演出数据同步到本地数据库文件 xiudong.db（SQLite）。

- 每次运行会自动获取所有城市，逐个城市抓取演出列表；
- 已经存过的演出（按 id 判断）会更新价格/是否售罄等信息，不会重复插入；
- 请求之间会等待几秒钟，避免对秀动服务器造成压力；
- 可以重复运行这个脚本（比如每天跑一次），数据库会越来越完整、越来越新。

直接运行：
    python xiudong_sync.py

跑完之后，数据在同目录下的 xiudong.db 文件里，可以用支持 SQLite 的
工具打开查看（比如 DB Browser for SQLite），也可以用 Python 读出来
再导出成 Excel/CSV。
"""
import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path

from xiudong_client import XiudongClient

SCRIPT_DIR = Path(__file__).resolve().parent
DB_PATH = SCRIPT_DIR / "xiudong.db"          # 用绝对路径，不管定时任务从哪个目录启动都能找到
REQUEST_DELAY_SECONDS = 3       # 每次请求之间等待的秒数，保持保守频率
MAX_PAGES_PER_CITY = 20         # 每个城市最多翻多少页（每页20条），避免无限翻页


def init_db(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS shows (
            id INTEGER PRIMARY KEY,
            title TEXT,
            performers TEXT,
            price TEXT,
            show_time TEXT,
            site_name TEXT,
            city_name TEXT,
            city_code TEXT,
            sold_out INTEGER,
            last_seen_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    """)
    conn.commit()


def upsert_show(conn, city_code, item):
    conn.execute("""
        INSERT INTO shows (id, title, performers, price, show_time, site_name,
                            city_name, city_code, sold_out, poster_url,
                            is_exclusive, is_group, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        ON CONFLICT(id) DO UPDATE SET
            title=excluded.title, performers=excluded.performers,
            price=excluded.price, show_time=excluded.show_time,
            site_name=excluded.site_name, city_name=excluded.city_name,
            sold_out=excluded.sold_out, poster_url=excluded.poster_url,
            is_exclusive=excluded.is_exclusive, is_group=excluded.is_group,
            last_seen_at=excluded.last_seen_at
    """, (
        item.get("id"), item.get("title"), item.get("performers"),
        item.get("price"), item.get("showTime"), item.get("siteName"),
        item.get("cityName"), city_code, item.get("soldOut"),
        item.get("poster"), item.get("isExclusive"), item.get("isGroup"),
    ))


def sync_city(client, conn, city_code, city_name):
    print(f"正在抓取城市: {city_name}({city_code}) ...")
    new_count = 0
    total_pages = None
    page_no = 1
    while page_no <= MAX_PAGES_PER_CITY:
        resp = client.fetch_activity_list(city_code=city_code, page_no=page_no, page_size=20)
        data = resp.json()
        if data.get("state") != "1":
            print(f"  第{page_no}页请求失败: {data}")
            break

        result = data.get("result", {})
        items = result.get("result", [])
        total_pages = result.get("totalPage", 0)

        for item in items:
            upsert_show(conn, city_code, item)
            new_count += 1
        conn.commit()

        print(f"  第{page_no}/{total_pages}页，本页{len(items)}条")

        if page_no >= total_pages or not items:
            break
        page_no += 1
        time.sleep(REQUEST_DELAY_SECONDS)

    return new_count


def main():
    print(f"===== 开始同步: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} =====")
    sys.stdout.flush()

    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    client = XiudongClient()
    client.ensure_token()

    resp = client._request("/web/activity/list/params", None, "https://www.showstart.com/event/list")
    cities = resp.json().get("result", [])
    print(f"共发现 {len(cities)} 个城市")

    total = 0
    for city in cities:
        city_code = city.get("cityCode")
        city_name = city.get("cityName")
        if not city_code:
            continue
        try:
            total += sync_city(client, conn, city_code, city_name)
        except Exception as e:
            print(f"  城市 {city_name} 抓取出错，跳过: {e}")
        time.sleep(REQUEST_DELAY_SECONDS)

    conn.close()
    print(f"本次同步完成，共写入/更新 {total} 条演出记录，数据库文件: {DB_PATH}")


if __name__ == "__main__":
    main()
