"""
数据库结构迁移脚本，可重复运行。
1. 给现有 shows 表新增字段（不影响已有数据）
2. 创建新表（venues / users / sessions / sms_send_log / followed_artists / favorites / purchased / venue_reviews）

运行：
    python migrate_schema.py
"""
import sqlite3
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DB_PATH = SCRIPT_DIR / "xiudong.db"

# 把 backend/ 目录加进 sys.path，这样才能 import app.xxx
sys.path.insert(0, str(SCRIPT_DIR.parent))

from sqlmodel import SQLModel  # noqa: E402
from app.db import engine  # noqa: E402
from app import models  # noqa: E402  (import 触发表定义注册到 SQLModel.metadata)

NEW_SHOW_COLUMNS = [
    ("poster_url", "TEXT"),
    ("is_exclusive", "INTEGER"),
    ("is_group", "INTEGER"),
    ("venue_id", "INTEGER"),
    ("price_min", "INTEGER"),
    ("show_dt", "TEXT"),
    ("weekday", "INTEGER"),
]

NEW_SHOW_INDICES = [
    ("idx_shows_city_name", "shows(city_name)"),
    ("idx_shows_show_dt", "shows(show_dt)"),
    ("idx_shows_price_min", "shows(price_min)"),
    ("idx_shows_venue_id", "shows(venue_id)"),
]


def add_show_columns(conn):
    for col, coltype in NEW_SHOW_COLUMNS:
        try:
            conn.execute(f"ALTER TABLE shows ADD COLUMN {col} {coltype}")
            print(f"  已新增字段: shows.{col}")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print(f"  字段已存在，跳过: shows.{col}")
            else:
                raise

    for idx_name, idx_target in NEW_SHOW_INDICES:
        conn.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {idx_target}")
    conn.commit()


def main():
    print(f"数据库: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    add_show_columns(conn)
    conn.close()

    print("创建新表（venues/users/sessions/sms_send_log/followed_artists/favorites/purchased/venue_reviews）...")
    SQLModel.metadata.create_all(engine)
    print("迁移完成。")


if __name__ == "__main__":
    main()
