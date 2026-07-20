"""
邮件正文模板。用内联 style 而不是 <style> 标签——大部分邮件客户端(尤其是 Gmail 和
QQ 邮箱)会把 head 里的样式表整段丢掉，只有内联样式活得下来。同理不用 flex/grid，
用 table 布局，这是邮件 HTML 至今还得这么写的原因。

配色跟网页版 frontend/src/theme/theme.ts 保持一致，但底色改成浅色：深色背景的邮件
在不少客户端的浅色模式下会被强行反色，反而更难看。
"""
from app.config import SITE_BASE_URL

ACCENT = "#C4472E"
GOLD = "#B8862E"
TEXT = "#2A2320"
TEXT_SEC = "#8A8078"
BORDER = "#E8E1D7"

_WRAPPER = """\
<div style="background:#F7F3EC;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans SC','Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid {border};border-radius:14px;overflow:hidden;">
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
    return _WRAPPER.format(border=BORDER, accent=ACCENT, text_sec=TEXT_SEC, body=body, footer=footer)


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


def _show_row(show: dict) -> str:
    """一场演出在邮件里的样子。字段可能是 NULL(秀动的数据本来就不齐)，统一兜底"""
    title = show.get("title") or "未命名演出"
    performers = show.get("performers") or ""
    when = show.get("show_time") or "时间待定"
    where = " · ".join(x for x in [show.get("city_name"), show.get("site_name")] if x) or "场地待定"
    price = show.get("price") or ""
    reason = "、".join(show.get("matched_artists") or [])

    price_html = (
        f'<span style="color:{GOLD};font-size:13px;font-weight:700;">{price}</span>'
        if price else ""
    )
    return f"""\
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 12px;border:1px solid {BORDER};border-radius:10px;">
        <tr><td style="padding:14px 16px;">
          <div style="font-size:15px;font-weight:700;color:{TEXT};line-height:1.5;">{title}</div>
          <div style="font-size:13px;color:{TEXT_SEC};margin-top:5px;line-height:1.6;">{performers}</div>
          <div style="font-size:13px;color:{TEXT};margin-top:9px;line-height:1.6;">{when}<br>{where}</div>
          <div style="margin-top:9px;">{price_html}</div>
          <div style="font-size:12px;color:{TEXT_SEC};margin-top:9px;">因为你关注了 {reason}</div>
        </td></tr>
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
