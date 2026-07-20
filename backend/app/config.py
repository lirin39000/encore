from pathlib import Path

from dotenv import load_dotenv
import os

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

ALIYUN_ACCESS_KEY_ID = os.environ["ALIYUN_ACCESS_KEY_ID"]
ALIYUN_ACCESS_KEY_SECRET = os.environ["ALIYUN_ACCESS_KEY_SECRET"]
AMAP_WEB_SERVICE_KEY = os.environ["AMAP_WEB_SERVICE_KEY"]

# 阿里云邮件推送(DirectMail)。跟短信共用上面那套 AccessKey，只是多一个在控制台配好并做过
# DNS 验证的发信地址。没配这几项时不报错，等到真的要发信了再抛(见 aliyun_dm.py)，
# 这样本地只跑网页/抓取的人不用被迫先去申请域名
ALIYUN_DM_ACCOUNT_NAME = os.environ.get("ALIYUN_DM_ACCOUNT_NAME", "")
ALIYUN_DM_FROM_ALIAS = os.environ.get("ALIYUN_DM_FROM_ALIAS", "LiveFlow")

# 小程序通过 apiProxy 云函数访问后端时用的共享密钥。云函数那边能拿到微信验证过的
# openid，把它放在请求头里传过来——但请求头谁都能伪造，所以必须同时带上这个密钥证明
# "这个请求确实来自我们自己的云函数"。没设置时 openid 那条身份路径直接关闭(而不是
# 放行)，避免忘配的时候变成任何人都能冒充任意用户
WX_PROXY_SECRET = os.environ.get("WX_PROXY_SECRET", "")

# 邮件里的验证/退订链接指向哪，比如 https://api.your-domain.com。这两个链接是用户在
# 邮件客户端里点的，必须是外网能访问的后端地址，不能用 localhost
SITE_BASE_URL = os.environ.get("SITE_BASE_URL", "http://localhost:8000").rstrip("/")

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
