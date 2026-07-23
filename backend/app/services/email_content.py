"""
邮件正文模板。用内联 style 而不是 <style> 标签——大部分邮件客户端(尤其是 Gmail 和
QQ 邮箱)会把 head 里的样式表整段丢掉，只有内联样式活得下来。同理不用 flex/grid，
用 table 布局，这是邮件 HTML 至今还得这么写的原因。

浅色主题：邮箱本身多是白底，深色邮件跟它不搭，所以用浅底。版式(海报在右、★艺人、
橙色价格、查看详情链接)不变，只是配色走浅色。
"""
from app.config import SITE_BASE_URL

ACCENT = "#C4472E"
GOLD = "#B8862E"
TEXT = "#2A2320"       # 深文字(浅底上)
TEXT_SEC = "#8A8078"   # 次要文字
BORDER = "#E8E1D7"
BG = "#F7F3EC"         # 外层浅底
INNER_BG = "#FFFFFF"   # 外壳内层白

_WRAPPER = """\
<div style="background:{bg};padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans SC','Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:{inner_bg};border:1px solid {border};border-radius:14px;overflow:hidden;">
    <div style="padding:20px 24px;border-bottom:1px solid {border};">
      <span style="font-size:17px;font-weight:700;color:{accent};letter-spacing:0.5px;">LiveFlow</span>
    </div>
    <div style="padding:24px;">
{body}
    </div>
    <div style="padding:16px 24px;border-top:1px solid {border};font-size:12px;color:{text_sec};line-height:1.7;">
{footer}
    </div>
  </div>
</div>
"""


def _wrap(body: str, footer: str) -> str:
    return _WRAPPER.format(
        bg=BG, inner_bg=INNER_BG, border=BORDER, accent=ACCENT, text_sec=TEXT_SEC,
        body=body, footer=footer,
    )


def verify_email_html(verify_token: str) -> str:
    link = f"{SITE_BASE_URL}/email/verify?token={verify_token}"
    body = f"""\
      <p style="margin:0 0 14px;font-size:15px;color:{TEXT};line-height:1.7;">
        点下面的按钮确认这个邮箱，之后你关注的艺人有新演出，我们就会发邮件告诉你。
      </p>
      <p style="margin:0 0 22px;">
        <a href="{link}" style="display:inline-block;background:{ACCENT};color:#FFFFFF;text-decoration:none;padding:11px 26px;border-radius:100px;font-size:14px;font-weight:700;">
          确认订阅
        </a>
      </p>
      <p style="margin:0;font-size:12px;color:{TEXT_SEC};line-height:1.7;">
        按钮点不动的话，把这个地址复制到浏览器打开：<br>
        <span style="color:{TEXT_SEC};word-break:break-all;">{link}</span>
      </p>"""
    footer = "链接 24 小时内有效。如果这封邮件不是你要的，忽略即可，我们不会再发信给这个地址。"
    return _wrap(body, footer)


# 演出卡的配色（浅色）。版式照网页版 ShowCard，但配色走浅底：白色外壳上用极浅暖色卡 + 边框
# 区分层次
CARD_BG = "#FAF6EF"
CARD_TEXT = "#2A2320"
CARD_TEXT_SEC = "#6B615A"
CARD_TEXT_MUTED = "#9A9089"
PRICE = "#D0532E"  # 价格橙，浅底上比网页版那个 #E0664A 稍深一点更清楚


def _poster_thumb(url: str) -> str:
    """
    邮件里内嵌显示用的缩略图。原图可能上 MB(见过 9MB 一张)，直接内嵌会下几百 MB、加载
    卡死。showstart CDN 是七牛云，加 ?imageView2/2/w/360 按宽缩到 360px(卡里显示 ~112px，
    高清屏 3 倍够清晰)，一张 ~40KB。点击看大图走的是未压缩原图(见 _show_row 里的外链)。
    """
    if not url:
        return url
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}imageView2/2/w/360"


def _show_row(show: dict) -> str:
    """
    一场演出的卡片，照网页版 ShowCard 的样式：深色卡、海报在右、★艺人、橙色价格、
    "查看详情"链接。字段可能是 NULL(秀动数据本来就不齐)，统一兜底。
    海报内嵌用缩略图(快)，外面套一个指向原图的链接——点一下就看未压缩大图。
    """
    show_id = show.get("id")
    title = show.get("title") or "未命名演出"
    performers = show.get("performers") or "艺人待定"
    when = show.get("show_time") or "时间待定"
    where = " · ".join(x for x in [show.get("site_name"), show.get("city_name")] if x) or "场地待定"
    price = show.get("price") or ""
    reason = "、".join(show.get("matched_artists") or [])
    full_poster = show.get("poster_url") or ""
    thumb = _poster_thumb(full_poster)

    price_html = (
        f'<div style="margin-top:9px;"><span style="font-size:18px;font-weight:700;color:{PRICE};">{price}</span></div>'
        if price else ""
    )
    detail_link = (
        f'<div style="margin-top:9px;"><a href="https://www.showstart.com/event/{show_id}" '
        f'style="font-size:13px;font-weight:700;color:{GOLD};text-decoration:none;">查看详情 →</a></div>'
        if show_id else ""
    )
    info = f"""\
          <div style="font-family:'Noto Serif SC',serif;font-size:16px;font-weight:600;color:{CARD_TEXT};line-height:1.4;">{title}</div>
          <div style="font-size:13px;color:{CARD_TEXT_SEC};margin-top:6px;line-height:1.5;"><span style="color:{GOLD};">★</span> {performers}</div>
          <div style="font-size:13px;color:{CARD_TEXT_SEC};margin-top:5px;line-height:1.5;">{when}<br>{where}</div>
{price_html}
{detail_link}
          <div style="font-size:12px;color:{CARD_TEXT_MUTED};margin-top:9px;">因为你关注了 {reason}</div>"""

    poster_cell = (
        f"""\
          <td width="128" valign="top" style="padding:14px 16px 14px 0;">
            <a href="{full_poster}" style="text-decoration:none;">
              <img src="{thumb}" width="112" alt="" style="width:112px;border-radius:8px;display:block;border:0;" />
            </a>
          </td>"""
        if thumb else ""
    )
    return f"""\
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 14px;background:{CARD_BG};border:1px solid {BORDER};border-radius:12px;overflow:hidden;">
        <tr>
          <td valign="top" style="padding:14px 12px 16px 16px;">
{info}
          </td>
{poster_cell}
        </tr>
      </table>"""


def new_shows_html(shows: list[dict], shown: list[dict], unsubscribe_token: str) -> str:
    """shows 是这次全部的新增演出，shown 是实际列出来的前几场"""
    rest = len(shows) - len(shown)
    rows = "".join(_show_row(s) for s in shown)
    more = (
        f'<p style="margin:4px 0 0;font-size:13px;color:{TEXT_SEC};">'
        f'另外还有 {rest} 场，去 LiveFlow 看完整列表。</p>'
        if rest > 0 else ""
    )
    body = f"""\
      <p style="margin:0 0 18px;font-size:15px;color:{TEXT};line-height:1.7;">
        你关注的艺人新增了 <strong style="color:{ACCENT};">{len(shows)}</strong> 场演出：
      </p>
{rows}{more}"""

    unsub = f"{SITE_BASE_URL}/email/unsubscribe?token={unsubscribe_token}"
    footer = (
        f'你收到这封邮件是因为在 LiveFlow 开启了演出上新提醒。'
        f'<a href="{unsub}" style="color:{TEXT_SEC};">退订</a>'
    )
    return _wrap(body, footer)


# 纯文本版每封最多列几场。实测阿里云反垃圾对这封的判定跟"体量+营销感"强相关：
# 极简格式 8 场能过、15 场被拦，6 场稳过。留 6 是给临界点一点余量。
# HTML 版(加白后用)不受这个限制，另有 MAX_SHOWS_PER_EMAIL=100
TEXT_MAX_SHOWS = 6


def new_shows_text(shows: list[dict], unsubscribe_token: str) -> str:
    """
    演出通知的纯文本极简版。

    存在的理由：HTML 富文本版被阿里云反垃圾拦了(InvalidSendMail.Spam)。逐项实测发现，
    拦截跟格式(纯文本/HTML)关系不大，跟"营销特征+体量"强相关——带价格、"因为你关注"、
    多条卡片堆在一起就被判垃圾。这个版本是实测能稳定通过的最简形态：
    只有"标题（日期，城市）"一行，不带价格、不带推荐理由，每封最多 6 场。

    加白成功后把 config 里 EMAIL_NOTIFY_MODE 改回 html 就换回好看的版本，不用动这里。
    """
    shown = shows[:TEXT_MAX_SHOWS]
    lines = ["你关注的艺人最近有新演出：", ""]
    for s in shown:
        # 只取日期的月/日，时间和场馆都省掉——越简单越不容易被判营销
        raw = (s.get("show_time") or "").split()
        when = raw[0] if raw else "待定"
        if "/" in when:
            parts = when.split("/")
            when = f"{parts[1]}/{parts[2]}" if len(parts) >= 3 else when
        title = s.get("title") or "未命名演出"
        city = s.get("city_name") or ""
        lines.append(f"{title}（{when}，{city}）" if city else f"{title}（{when}）")

    rest = len(shows) - len(shown)
    if rest > 0:
        lines += ["", f"还有 {rest} 场，登录 LiveFlow 查看。"]

    lines += ["", f"退订：{SITE_BASE_URL}/email/unsubscribe?token={unsubscribe_token}"]
    return "\n".join(lines)


def simple_page(title: str, message: str) -> str:
    """验证/退订链接点开后看到的落地页，纯静态一屏，不值得为它单独起个前端路由"""
    return f"""\
<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} · LiveFlow</title></head>
<body style="margin:0;background:#1B1512;color:#F2ECE1;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans SC',Arial,sans-serif;">
  <div style="max-width:420px;margin:0 auto;padding:80px 24px;text-align:center;">
    <div style="font-size:15px;font-weight:700;color:{ACCENT};letter-spacing:0.5px;margin-bottom:28px;">LiveFlow</div>
    <div style="font-size:20px;font-weight:700;margin-bottom:12px;">{title}</div>
    <div style="font-size:14px;color:rgba(242,236,225,0.62);line-height:1.8;">{message}</div>
  </div>
</body></html>"""
