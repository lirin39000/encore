import re
import unicodedata

from zhconv import convert


def normalize_name(s: str) -> str:
    """
    艺人名模糊匹配用的归一化：全角转半角(NFKC)、去掉所有空格、繁体转简体、转小写。
    只用于"匹配要不要算相等"这个判断，展示给用户看的名字还是原始字符串，不受影响。
    """
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"\s+", "", s)
    s = convert(s, "zh-cn")
    return s.lower()
