"""
每天定时任务的入口：抓新数据 -> 解析价格/时间字段 -> 同步到 Supabase 云端数据库。
每步依次执行，前一步失败就不再往下走(避免用不完整的数据覆盖云端)。

场馆经纬度回填(geocode_venues.py)不在这个流程里——现在没有任何界面在用这个数据
(地图选点筛选被简化成了城市名单选，场馆详情页也没有入口了)，跑一次要好几分钟，
纯粹浪费时间。以后真要做"交通预估"之类需要坐标的功能，再把它加回来。

运行：
    python daily_pipeline.py
"""
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PYTHON = sys.executable

STEPS = [
    ("准备本地数据库表结构", "migrate_schema.py"),
    ("抓取最新演出数据", "xiudong_sync.py"),
    ("清理非音乐类演出", "clean_non_music_shows.py"),
    ("解析价格/时间字段", "normalize_shows.py"),
    ("同步到 Supabase 云端", "migrate_to_postgres.py"),
]


def main():
    for label, script in STEPS:
        print(f"\n=== {label} ({script}) ===", flush=True)
        result = subprocess.run([PYTHON, str(SCRIPT_DIR / script)])
        if result.returncode != 0:
            print(f"!!! {script} 失败(退出码 {result.returncode})，后面的步骤不再执行", flush=True)
            sys.exit(result.returncode)
    print("\n全部完成", flush=True)


if __name__ == "__main__":
    main()
