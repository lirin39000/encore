"""
拿秀动网真实的城市列表（cityCode + cityName），按拼音首字母分组，
生成 frontend/src/data/cities.json，供前端"城市选择"用，替代设计稿里手写的假城市列表。

运行：
    python fetch_cities.py
"""
import json
import sys
from pathlib import Path

from pypinyin import lazy_pinyin

SCRIPT_DIR = Path(__file__).resolve().parent
OUT_PATH = SCRIPT_DIR.parent.parent / "frontend" / "src" / "data" / "cities.json"

sys.path.insert(0, str(SCRIPT_DIR))
from xiudong_client import XiudongClient  # noqa: E402

HOT_CITY_NAMES = ["北京", "上海", "广州", "深圳", "成都", "杭州"]


def main():
    client = XiudongClient()
    client.ensure_token()
    resp = client._request("/web/activity/list/params", None, "https://www.showstart.com/event/list")
    data = resp.json()
    if data.get("state") != "1":
        raise RuntimeError(f"请求城市列表失败: {data}")
    cities = data.get("result", [])
    print(f"共 {len(cities)} 个城市")

    groups = {}
    for c in cities:
        name = c.get("cityName")
        code = c.get("cityCode")
        if not name or not code:
            continue
        letter = lazy_pinyin(name)[0][0].upper()
        groups.setdefault(letter, []).append({"code": str(code), "name": name})

    city_directory = [
        {"letter": letter, "cities": sorted(groups[letter], key=lambda c: c["name"])}
        for letter in sorted(groups.keys())
    ]

    name_to_code = {c.get("cityName"): str(c.get("cityCode")) for c in cities if c.get("cityName")}
    hot_cities = [
        {"code": name_to_code[name], "name": name}
        for name in HOT_CITY_NAMES
        if name in name_to_code
    ]

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump({"hotCities": hot_cities, "cityDirectory": city_directory}, f, ensure_ascii=False, indent=2)

    print(f"已写入 {OUT_PATH}")


if __name__ == "__main__":
    main()
