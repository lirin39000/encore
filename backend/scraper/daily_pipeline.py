"""
每天定时任务的入口：抓新数据 -> 解析价格/时间字段 -> 场馆经纬度回填 -> 同步到 Supabase 云端数据库。
四步依次执行，前一步失败就不再往下走(避免用不完整的数据覆盖云端)。

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
    ("解析价格/时间字段", "normalize_shows.py"),
    ("场馆经纬度回填", "geocode_venues.py"),
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
