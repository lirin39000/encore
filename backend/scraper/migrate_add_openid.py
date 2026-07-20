"""
给 users 表加 openid 列，并放开 phone 的 NOT NULL 约束。

为什么要单独写这个脚本：项目其他地方的表结构靠 SQLModel.metadata.create_all 维护，
但它只建缺失的表，既不会给已存在的表加列，也改不了约束。users 表早就建好了，
所以这次必须手写 DDL。

改动本身是"放宽"性质的：加一个可空列、把一个 NOT NULL 改成可空，不动任何已有数据，
现有的手机号用户完全不受影响。脚本可重复执行。

运行(会连 .env 里 DATABASE_URL 指向的库，也就是线上 Supabase)：
    python migrate_add_openid.py
"""
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR.parent))

from sqlalchemy import text  # noqa: E402

from app.db import engine, IS_POSTGRES  # noqa: E402


def main():
    print(f"目标数据库: {'线上 Postgres' if IS_POSTGRES else '本地 SQLite'}")

    with engine.begin() as conn:
        cols = {c["name"] for c in _columns(conn)}

        if "openid" in cols:
            print("  users.openid 已存在，跳过")
        else:
            conn.execute(text("ALTER TABLE users ADD COLUMN openid TEXT"))
            print("  已新增 users.openid")

        # 唯一索引单独建：小程序用户按 openid 找人，不能出现重复
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_openid ON users (openid)"))
        print("  users.openid 唯一索引就绪")

        if IS_POSTGRES:
            # SQLite 改不了已有列的约束(要整表重建)，但本地那份 sqlite 只是抓取过程的
            # 中转文件，users 表在那边是空的、也没人读，不值得为它折腾
            conn.execute(text("ALTER TABLE users ALTER COLUMN phone DROP NOT NULL"))
            print("  users.phone 已改为可空")

    print("迁移完成。现有用户数据未受影响。")


def _columns(conn):
    from sqlalchemy import inspect
    return inspect(conn).get_columns("users")


if __name__ == "__main__":
    main()
