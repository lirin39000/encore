"""
"关注的艺人有新演出"这件事的判断逻辑，被两个地方共用：
- 用户刚验证完邮箱时(routers/email.py)：把当前已经匹配上的演出静默写进 notify_log，
  这样第一次推送不会把库里几百场存量演出一次性轰给人
- 每天的推送任务(scraper/notify_new_shows.py)：算出还没通知过的那些

匹配口径跟 routers/shows.py 里 scope=followed 完全一致——归一化后的关注名是不是
出现在归一化后的 performers 里。艺人名是用户自己手打的，跟秀动官方写法可能差空格或
简繁体，所以这一步没法翻成 SQL，只能查出来在 Python 里过。
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import text

from app.text_normalize import normalize_name

# 一封邮件里最多列几场，超出的折叠成一句"还有 N 场"。真按 20 场全列出来邮件会长到没人看，
# 而且容易被邮件服务商判成营销邮件
MAX_SHOWS_PER_EMAIL = 8


def fetch_upcoming_shows(conn) -> list[dict]:
    """未来的、有艺人信息的演出。所有订阅用户共用这一份，不用每个人查一次库"""
    today_cn = datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()
    rows = conn.execute(
        text(
            """
            SELECT id, title, performers, price, show_time, show_dt, weekday,
                   site_name, city_name, poster_url
            FROM shows
            WHERE performers IS NOT NULL AND performers != ''
              AND (show_dt IS NULL OR show_dt >= :today)
            """
        ),
        {"today": today_cn},
    ).mappings().all()
    return [dict(r) for r in rows]


def match_shows_for_user(conn, user_id: int, shows: list[dict]) -> list[dict]:
    """这个用户关注的艺人对应的所有未来演出(不管通知过没有)，按演出时间排序"""
    rows = conn.execute(
        text("SELECT artist_name FROM followed_artists WHERE user_id = :uid"),
        {"uid": user_id},
    ).all()
    normalized = [(normalize_name(r[0]), r[0]) for r in rows]
    normalized = [(n, raw) for n, raw in normalized if n]
    if not normalized:
        return []

    matched = []
    for show in shows:
        performers = normalize_name(show["performers"])
        hits = [raw for n, raw in normalized if n in performers]
        if hits:
            # 邮件里要说清"是因为你关注了谁才推给你的"，把命中的关注名带上
            matched.append({**show, "matched_artists": hits})
    matched.sort(key=lambda s: (s["show_dt"] is None, s["show_dt"] or ""))
    return matched


def filter_unnotified(conn, user_id: int, shows: list[dict]) -> list[dict]:
    if not shows:
        return []
    rows = conn.execute(
        text("SELECT show_id FROM email_notify_log WHERE user_id = :uid"),
        {"uid": user_id},
    ).all()
    already = {r[0] for r in rows}
    return [s for s in shows if s["id"] not in already]


def record_notified(conn, user_id: int, shows: list[dict]) -> None:
    """把这批演出记成"已通知"。注意即使邮件里只列了前 8 场，剩下的也要一起记进来——
    它们已经在"还有 N 场"里被提到过了，下次不该再当成新的"""
    if not shows:
        return
    now = datetime.now().isoformat()
    conn.execute(
        text(
            "INSERT INTO email_notify_log (user_id, show_id, sent_at) "
            "VALUES (:uid, :sid, :now)"
        ),
        [{"uid": user_id, "sid": s["id"], "now": now} for s in shows],
    )


def seed_notify_log(conn, user_id: int) -> int:
    """
    用户刚开启订阅时调用：把当下已经匹配的演出全部标成"已通知"但不真的发信。
    没有这一步的话，一个关注了 20 个艺人的老用户刚订阅就会收到一封列着上百场
    存量演出的邮件——那不是"上新提醒"，是骚扰。
    """
    shows = fetch_upcoming_shows(conn)
    matched = match_shows_for_user(conn, user_id, shows)
    fresh = filter_unnotified(conn, user_id, matched)
    record_notified(conn, user_id, fresh)
    return len(fresh)
