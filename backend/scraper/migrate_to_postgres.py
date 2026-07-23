"""
把本地 xiudong.db (SQLite) 里的全部数据一次性搬到 Supabase 的 Postgres。
只需要在部署那天跑一次；之后正式环境直接读写 Postgres，这个脚本不用再用了。

运行前提：
1. backend/.env 里加一行 DATABASE_URL=postgresql://... (从 Supabase 项目设置里复制)
2. 已经跑过 migrate_schema.py，确认本地 SQLite 的表结构是最新的

运行：
    python migrate_to_postgres.py
"""
import sqlite3
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SQLITE_PATH = SCRIPT_DIR / "xiudong.db"

sys.path.insert(0, str(SCRIPT_DIR.parent))

from sqlalchemy import create_engine, text  # noqa: E402
from app.config import DATABASE_URL  # noqa: E402

if not DATABASE_URL:
    raise SystemExit("backend/.env 里还没设置 DATABASE_URL，先去 Supabase 项目设置里复制连接串加进去")

SHOWS_COLUMNS = [
    "id", "title", "performers", "price", "show_time", "site_name", "city_name",
    "city_code", "sold_out", "last_seen_at", "poster_url", "is_exclusive", "is_group",
    "venue_id", "price_min", "show_dt", "weekday",
]

TABLES_IN_ORDER = [
    # (表名, 列名列表) —— 顺序很重要：venues/users 要先于引用它们的表插入
    ("venues", ["id", "name", "city_name", "lat", "lng", "formatted_address", "geocode_level", "geocode_status", "last_geocoded_at"]),
    ("shows", SHOWS_COLUMNS),
    ("users", ["id", "phone", "nickname", "created_at"]),
    ("sessions", ["token", "user_id", "created_at", "expires_at"]),
    ("sms_send_log", ["id", "phone", "sent_at", "ip"]),
    ("followed_artists", ["id", "user_id", "artist_name", "created_at"]),
    ("favorites", ["id", "user_id", "show_id", "created_at"]),
    ("venue_reviews", ["id", "user_id", "venue_id", "rating", "text", "created_at"]),
]


def create_postgres_schema(pg_engine):
    """在 Postgres 里建好 shows 表(SQLModel 管的那几张表用 create_all 建，shows 是手写的旧表要单独建)"""
    from sqlmodel import SQLModel
    from app import models  # noqa: F401  触发表注册

    SQLModel.metadata.create_all(pg_engine)

    with pg_engine.begin() as conn:
        conn.execute(text("""
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
                last_seen_at TEXT,
                poster_url TEXT,
                is_exclusive INTEGER,
                is_group INTEGER,
                venue_id INTEGER,
                price_min INTEGER,
                show_dt TEXT,
                weekday INTEGER
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_shows_city_name ON shows(city_name)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_shows_show_dt ON shows(show_dt)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_shows_price_min ON shows(price_min)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_shows_venue_id ON shows(venue_id)"))

        # first_seen = 这场演出第一次进 Postgres 的时间，用来判断"今天才上新的"。
        # 只在 Postgres 里维护(本地 SQLite 每次都从零重建，追踪不了)：
        #   - 新演出 INSERT 时靠 DEFAULT now() 自动填当前时间(copy_table 的 INSERT 不带这列)
        #   - 已存在的演出 UPDATE 时不动它(set_clause 里也没有这列)
        # 关键安全点：加列时存量的几千场必须回填成很老的日期，否则会被当成"刚上新"给全员狂发。
        # 三步都幂等，每次跑无害：ADD 只第一次生效，UPDATE 之后没有 NULL 行了影响 0 行，SET DEFAULT 重复设无妨
        conn.execute(text("ALTER TABLE shows ADD COLUMN IF NOT EXISTS first_seen TIMESTAMP"))
        conn.execute(text("UPDATE shows SET first_seen = '2000-01-01' WHERE first_seen IS NULL"))
        conn.execute(text("ALTER TABLE shows ALTER COLUMN first_seen SET DEFAULT now()"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_shows_first_seen ON shows(first_seen)"))
    print("Postgres 表结构就绪")


def copy_table(sqlite_conn, pg_engine, table, columns):
    rows = sqlite_conn.execute(f"SELECT {', '.join(columns)} FROM {table}").fetchall()
    if not rows:
        print(f"  {table}: 0 行，跳过")
        return
    placeholders = ", ".join(f":{c}" for c in columns)
    col_list = ", ".join(columns)
    if table == "shows":
        # shows 表会反复重新导入(本地爬虫每天更新)，用 upsert 而不是"已存在就跳过"，
        # 这样重复跑这个脚本也能把最新数据同步过去
        pk = "id"
        update_cols = [c for c in columns if c != pk]
        set_clause = ", ".join(f"{c}=EXCLUDED.{c}" for c in update_cols)
        sql = text(f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT ({pk}) DO UPDATE SET {set_clause}")
    else:
        sql = text(f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING")
    # 挨行 execute() 对数据库来说是一行一次网络往返，shows 表几千行就是几千次往返，
    # Supabase 又在印度、延迟本来就不低。传一整个列表进去让驱动走批量执行，能差很多
    params = [dict(zip(columns, row)) for row in rows]
    with pg_engine.begin() as conn:
        conn.execute(sql, params)
    print(f"  {table}: 已搬 {len(rows)} 行")


def main():
    print(f"读取本地数据库: {SQLITE_PATH}")
    sqlite_conn = sqlite3.connect(SQLITE_PATH)

    pg_engine = create_engine(DATABASE_URL)
    create_postgres_schema(pg_engine)

    print("开始搬数据...")
    for table, columns in TABLES_IN_ORDER:
        copy_table(sqlite_conn, pg_engine, table, columns)

    sqlite_conn.close()
    print("全部搬完了")


if __name__ == "__main__":
    main()
