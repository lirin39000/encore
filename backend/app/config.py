from pathlib import Path

from dotenv import load_dotenv
import os

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

ALIYUN_ACCESS_KEY_ID = os.environ["ALIYUN_ACCESS_KEY_ID"]
ALIYUN_ACCESS_KEY_SECRET = os.environ["ALIYUN_ACCESS_KEY_SECRET"]
AMAP_WEB_SERVICE_KEY = os.environ["AMAP_WEB_SERVICE_KEY"]

DB_PATH = (BACKEND_DIR / "scraper" / "xiudong.db").resolve()

# 本地开发默认用同一个 SQLite 文件；部署到云端时设置 DATABASE_URL(Supabase 的 Postgres 连接串)
# 就会自动切过去，不用改代码。Supabase 给的连接串是 postgresql://，SQLAlchemy 默认拿这个去找
# psycopg2(没装)，改成 postgresql+psycopg:// 让它用装好的 psycopg(v3) 驱动
DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

# 逗号分隔的允许跨域来源，比如 "https://xxx.vercel.app,https://your-domain.com"
# 本地开发默认只放行 vite 的 5173
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()
]
