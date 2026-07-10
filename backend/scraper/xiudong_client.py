"""
秀动 web 端 /api/web/activity/list 接口 请求脚本（已用真实网络请求验证通过）

运行前需要安装依赖：
    pip install requests

直接运行：
    python xiudong_client.py

调试过程中确认的几个关键点（对照 d46ea68.js / 0579cb9.js 源码 + 真实抓包核对过）：
1. CDEVICENO（设备号）必须是 32 位小写字母数字串，对应 JS 里
   `token: uuid(32).toLowerCase()`，随便传长度/大小写不对的字符串会被判定无效。
2. 匿名浏览也需要一个非空的 accessToken，来自 `GET /waf/gettoken` 接口
   （返回 result.accessToken.access_token），不是像最初以为的那样全程留空。
   必须先调用一次这个接口拿到 accessToken，再带着它去请求 activity/list。
3. 必须带上一整套浏览器才会自动发的头（Sec-Ch-Ua / Sec-Fetch-* / Priority /
   Accept-Encoding / Accept-Language 等），以及一个基本的 Cookie 头，
   否则网关会返回看似正常的业务错误（"参数不全"/"登录过期了"）来误导调试，
   实际上请求根本没通过校验。
4. pageNo/pageSize 在真实请求里是字符串（"1"/"20"），不是数字。
"""
import hashlib
import json
import random
import string
import time
import requests


def md5(data: str) -> str:
    return hashlib.md5(data.encode("utf-8")).hexdigest()


def gen_random_str(length: int) -> str:
    """对应JS里的 uuid(n)：从大小写字母+数字里随机取"""
    chars = string.digits + string.ascii_uppercase + string.ascii_lowercase
    return "".join(random.choice(chars) for _ in range(length))


def gen_crtraceid() -> str:
    """对应 JS: y = Gt.a.uuid(32) + (new Date).getTime()"""
    return gen_random_str(32) + str(int(time.time() * 1000))


def gen_cdeviceno() -> str:
    """对应 JS: token: uuid(32).toLowerCase()"""
    return gen_random_str(32).lower()


def build_crpsign(access_token, sign, id_token, user_id,
                   cdeviceno, payload_json_str, url_path, crtraceid):
    """
    对应JS: w = o + l + f + h + "web" + m + _ + r.url + "999web" + y
    注意：这里的 url_path 一定不能带 /api 前缀！
    （原JS里是算完签名之后才拼接/api前缀的）
    """
    w = (access_token + sign + id_token + user_id + "web"
         + cdeviceno + payload_json_str + url_path + "999web" + crtraceid)
    return md5(w)


DEVICE_INFO = {
    "vendorName": "", "deviceMode": "", "deviceName": "", "systemName": "",
    "systemVersion": "", "cpuMode": " ", "cpuCores": "", "cpuArch": "",
    "memerySize": "", "diskSize": "", "network": "",
    "resolution": "1920*1080", "pixelResolution": "",
}

BASE_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
    "Content-Type": "application/json",
    "Origin": "https://www.showstart.com",
    "Priority": "u=1, i",
    "Sec-Ch-Ua": '"Not;A=Brand";v="8", "Chromium";v="150", "Microsoft Edge";v="150"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0"),
    "Csappid": "web",
    "Cterminal": "web",
    "Cusname": "",
    "Cversion": "999",
}


class XiudongClient:
    """
    一个"设备"对应一个 client 实例：CDEVICENO 生成一次后固定复用，
    accessToken/idToken 通过 /waf/gettoken 拿一次后缓存复用，
    跟真实浏览器一个会话内的行为保持一致。
    """

    def __init__(self):
        self.cdeviceno = gen_cdeviceno()
        self.access_token = ""
        self.id_token = ""
        self.sign = ""
        self.user_id = ""
        self.session = requests.Session()

    def _request(self, url_path, payload_obj, referer):
        real_url = "https://www.showstart.com/api" + url_path
        crtraceid = gen_crtraceid()
        payload_str = (json.dumps(payload_obj, ensure_ascii=False, separators=(",", ":"))
                        if payload_obj else "")
        crpsign = build_crpsign(self.access_token, self.sign, self.id_token, self.user_id,
                                 self.cdeviceno, payload_str, url_path, crtraceid)

        cookie = f"token={self.cdeviceno}; idToken={self.id_token}"
        if self.access_token:
            cookie += f"; accessToken={self.access_token}"

        headers = dict(BASE_HEADERS)
        headers.update({
            "Referer": referer,
            "Cookie": cookie,
            "Cdeviceno": self.cdeviceno,
            "Cdeviceinfo": requests.utils.quote(
                json.dumps(DEVICE_INFO, ensure_ascii=False, separators=(",", ":"))),
            "Crtraceid": crtraceid,
            "Crpsign": crpsign,
            "Cusat": self.access_token,
            "Cusut": self.sign,
            "Cusit": self.id_token,
            "Cusid": self.user_id,
        })

        resp = self.session.post(real_url, headers=headers, data=payload_str.encode("utf-8"))
        return resp

    def ensure_token(self):
        """先拿一个访客级 accessToken/idToken，匿名浏览也需要它，不能一直留空。"""
        if self.access_token:
            return
        resp = self._request("/waf/gettoken", None, "https://www.showstart.com/event/list")
        data = resp.json()
        if data.get("state") != "1":
            raise RuntimeError(f"gettoken 失败: {data}")
        self.access_token = data["result"]["accessToken"]["access_token"]
        self.id_token = data["result"]["idToken"].get("id_token", "")

    def fetch_activity_list(self, keyword="", city_code="", page_no=1, page_size=20):
        self.ensure_token()
        payload = {
            "pageNo": str(page_no), "pageSize": str(page_size), "cityCode": city_code,
            "activityIds": "", "coupon": "", "keyword": keyword, "organizerId": "",
            "performerId": "", "showStyle": "", "showTime": "", "showType": "",
            "siteId": "", "sortType": "", "themeId": "", "timeRange": "",
            "tourId": "", "type": "", "tag": "",
        }
        referer = (f"https://www.showstart.com/event/list?cityCode={city_code}"
                   f"&keyword={requests.utils.quote(keyword)}")
        resp = self._request("/web/activity/list", payload, referer)
        return resp


if __name__ == "__main__":
    client = XiudongClient()
    resp = client.fetch_activity_list(keyword="", city_code="110100", page_no=1, page_size=20)
    print("HTTP状态码:", resp.status_code)
    data = resp.json()
    print("state:", data.get("state"), "totalCount:", data.get("result", {}).get("totalCount"))
    for item in data.get("result", {}).get("result", [])[:5]:
        print("-", item.get("title"), item.get("cityName"), item.get("showTime"), item.get("price"))
