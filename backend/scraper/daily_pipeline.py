"""
每天定时任务的入口：抓新数据 -> 解析价格/时间字段 -> 同步到 Supabase 云端(网页版用)
-> 导出+同步到微信云数据库(小程序版用)。每步依次执行，前一步失败就不再往下走
(避免用不完整的数据覆盖云端)。

场馆经纬度回填(geocode_venues.py)不在这个流程里——现在没有任何界面在用这个数据
(地图选点筛选被简化成了城市名单选，场馆详情页也没有入口了)，跑一次要好几分钟，
纯粹浪费时间。以后真要做"交通预估"之类需要坐标的功能，再把它加回来。

最后一步"发演出上新提醒"读的是线上 Postgres(用户和订阅信息只在那边)，所以必须排在
"同步到 Supabase"之后，不然算出来的"新演出"是拿旧数据比的。没配 ALIYUN_DM_ACCOUNT_NAME
时这步会自己跳过，不报错。

微信云数据库那两步(导出 JSON + Node 脚本同步)需要环境变量
WX_CLOUD_ENV / TENCENT_SECRET_ID / TENCENT_SECRET_KEY，本地没配的话
这两步会失败但不影响前面 Supabase 那条已经成功同步的线。

运行：
    python daily_pipeline.py
"""
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PYTHON = sys.executable
NODE = "node"

STEPS = [
    ("准备本地数据库表结构", [PYTHON, str(SCRIPT_DIR / "migrate_schema.py")], None),
    ("抓取最新演出数据", [PYTHON, str(SCRIPT_DIR / "xiudong_sync.py")], None),
    ("清理非音乐类演出", [PYTHON, str(SCRIPT_DIR / "clean_non_music_shows.py")], None),
    ("解析价格/时间字段", [PYTHON, str(SCRIPT_DIR / "normalize_shows.py")], None),
    ("同步到 Supabase 云端(网页版)", [PYTHON, str(SCRIPT_DIR / "migrate_to_postgres.py")], None),
    ("导出演出数据 JSON(小程序版)", [PYTHON, str(SCRIPT_DIR / "export_shows_json.py")], None),
    ("同步到微信云数据库(小程序版)", [NODE, "index.js"], SCRIPT_DIR / "sync_to_wx_cloud"),
    ("给订阅用户发演出上新提醒", [PYTHON, str(SCRIPT_DIR / "notify_new_shows.py")], None),
]


def main():
    for label, cmd, cwd in STEPS:
        print(f"\n=== {label} ===", flush=True)
        result = subprocess.run(cmd, cwd=cwd)
        if result.returncode != 0:
            print(f"!!! {label} 失败(退出码 {result.returncode})，后面的步骤不再执行", flush=True)
            sys.exit(result.returncode)
    print("\n全部完成", flush=True)


if __name__ == "__main__":
    main()
