from sqlmodel import create_engine, Session

from app.config import DB_PATH, DATABASE_URL

IS_POSTGRES = bool(DATABASE_URL)

engine = create_engine(DATABASE_URL, echo=False) if DATABASE_URL else create_engine(f"sqlite:///{DB_PATH}", echo=False)

# SQLite 的 LIKE 默认不区分大小写，Postgres 的 LIKE 区分大小写、要用 ILIKE 才是同样效果
# (艺人名很多是英文，"chinese football" 搜不到 "Chinese Football" 会是个真实的回归)
LIKE_OP = "ILIKE" if IS_POSTGRES else "LIKE"


def get_session():
    with Session(engine) as session:
        yield session
