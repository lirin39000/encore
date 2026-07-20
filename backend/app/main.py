from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel

from app.config import ALLOWED_ORIGINS
from app.db import engine
from app.routers import shows, venues, auth, me, email
from app import models  # noqa: F401  (import 触发表定义注册到 SQLModel.metadata)

app = FastAPI(title="Encore API")

# 启动时补建缺失的表。线上 Postgres 的表结构本来是靠 migrate_to_postgres.py 建的，
# 但那个脚本按说明"只在部署那天跑一次"，之后加的新表(比如邮件订阅这两张)就没人建了。
# create_all 只建不存在的表，不会动已有表的数据，重复执行是安全的
SQLModel.metadata.create_all(engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(shows.router)
app.include_router(venues.router)
app.include_router(auth.router)
app.include_router(me.router)
app.include_router(email.router)


@app.get("/health")
def health():
    return {"status": "ok"}
