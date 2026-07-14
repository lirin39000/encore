"""
把 shows 表里标题命中"非音乐现场"关键词的记录删掉(话剧/脱口秀/音乐剧那些)。
这些记录本来就已经在 /shows 接口里被同一份关键词过滤掉、用户从来看不到，
这一步是把它们从数据库本身删掉——本地暂存文件和线上 Postgres 都删，
不然"关注艺人"搜索建议之类别的功能（没做同样的标题过滤）会从这些记录里
带出些不相关的人名。

可重复运行，删过一次之后重跑不会再删到东西。

运行：
    python clean_non_music_shows.py
"""
import sqlite3
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DB_PATH = SCRIPT_DIR / "xiudong.db"

sys.path.insert(0, str(SCRIPT_DIR.parent))

from sqlalchemy import create_engine, text  # noqa: E402
from app.config import DATABASE_URL  # noqa: E402
from app.non_music import NON_MUSIC_TITLE_KEYWORDS  # noqa: E402


def delete_from_sqlite():
    conn = sqlite3.connect(DB_PATH)
    where_clause = " OR ".join("title LIKE ?" for _ in NON_MUSIC_TITLE_KEYWORDS)
    params = [f"%{kw}%" for kw in NON_MUSIC_TITLE_KEYWORDS]
    cur = conn.execute(f"DELETE FROM shows WHERE {where_clause}", params)
    conn.commit()
    conn.close()
    print(f"本地数据库：删除 {cur.rowcount} 条命中关键词的记录")


def delete_from_postgres():
    if not DATABASE_URL:
        print("没有配置 DATABASE_URL，跳过线上数据库清理")
        return
    engine = create_engine(DATABASE_URL)
    where_clause = " OR ".join(f"title ILIKE :kw{i}" for i in range(len(NON_MUSIC_TITLE_KEYWORDS)))
    params = {f"kw{i}": f"%{kw}%" for i, kw in enumerate(NON_MUSIC_TITLE_KEYWORDS)}
    with engine.begin() as conn:
        result = conn.execute(text(f"DELETE FROM shows WHERE {where_clause}"), params)
    print(f"线上数据库：删除 {result.rowcount} 条命中关键词的记录")


def main():
    delete_from_sqlite()
    delete_from_postgres()


if __name__ == "__main__":
    main()
