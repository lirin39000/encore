"""
给开启了邮件订阅的用户发"关注的艺人有新演出"提醒。daily_pipeline 的最后一步。

必须跑在"同步到 Supabase"之后：用户、关注艺人、订阅信息只存在线上 Postgres
(网页版的 API 直接读写那边)，本地 xiudong.db 里的 users 是部署那天搬过去之后就
再没更新过的旧数据。所以这个脚本用 app.db.engine——有 DATABASE_URL 时它指向线上库，
演出数据这时候也已经同步过去了，两边对得上。

"新演出"的判定见 app/services/show_matching.py 里的说明。

单独运行(不发信，只打印每个人会收到什么)：
    python notify_new_shows.py --dry-run
"""
import argparse
import sys
import time
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR.parent))

from sqlalchemy import text  # noqa: E402

from app.db import engine, IS_POSTGRES  # noqa: E402
from app.services import aliyun_dm  # noqa: E402
from app.services.email_content import new_shows_html  # noqa: E402
from app.services.show_matching import (  # noqa: E402
    MAX_SHOWS_PER_EMAIL,
    fetch_upcoming_shows,
    filter_unnotified,
    match_shows_for_user,
    record_notified,
)

# 连续发信之间歇一下。阿里云对触发邮件有每秒发送量限制，订阅用户多起来之后
# 一口气发完容易撞限流，慢一点无所谓——这是每天跑一次的后台任务
SEND_INTERVAL_SECONDS = 1


def load_subscribers(conn):
    return conn.execute(
        text(
            "SELECT user_id, email, unsubscribe_token FROM email_subscriptions "
            "WHERE verified = :t AND active = :t"
        ),
        {"t": True},
    ).mappings().all()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="只打印不发信")
    args = parser.parse_args()

    if not IS_POSTGRES:
        print("提醒：当前连的是本地 SQLite，不是线上库。本地这份 users/订阅数据是旧的，"
              "跑出来的结果不代表线上情况", flush=True)
    if not args.dry_run and not aliyun_dm.is_configured():
        print("没有配置 ALIYUN_DM_ACCOUNT_NAME，跳过邮件推送", flush=True)
        return

    with engine.connect() as conn:
        subscribers = load_subscribers(conn)
        if not subscribers:
            print("没有已验证且开启订阅的用户", flush=True)
            return

        # 所有人共用同一份演出快照，不用每个人查一次库
        shows = fetch_upcoming_shows(conn)
        print(f"订阅用户 {len(subscribers)} 人，未来演出 {len(shows)} 场", flush=True)

        sent = 0
        for sub in subscribers:
            user_id = sub["user_id"]
            matched = match_shows_for_user(conn, user_id, shows)
            fresh = filter_unnotified(conn, user_id, matched)
            if not fresh:
                continue

            shown = fresh[:MAX_SHOWS_PER_EMAIL]
            if args.dry_run:
                print(f"  [dry-run] {sub['email']}: {len(fresh)} 场新演出 "
                      f"({', '.join(s['title'] or '?' for s in shown)})", flush=True)
                continue

            html = new_shows_html(fresh, shown, sub["unsubscribe_token"])
            subject = f"你关注的艺人新增了 {len(fresh)} 场演出"
            try:
                aliyun_dm.send_email(sub["email"], subject, html)
            except Exception as e:
                # 一个人发失败不该拖垮整批。这次不写 notify_log，明天会重试这批演出
                print(f"  发给 {sub['email']} 失败，跳过: {e}", flush=True)
                continue

            # 注意记的是 fresh 全部而不是 shown——没列出来的那些已经算在"还有 N 场"里了，
            # 不记的话明天会被当成新的再发一遍
            record_notified(conn, user_id, fresh)
            conn.execute(
                text("UPDATE email_subscriptions SET last_notified_at = :now WHERE user_id = :uid"),
                {"now": datetime.now().isoformat(), "uid": user_id},
            )
            conn.commit()
            sent += 1
            print(f"  已发送 {sub['email']}: {len(fresh)} 场", flush=True)
            time.sleep(SEND_INTERVAL_SECONDS)

    print(f"完成，共发出 {sent} 封" if not args.dry_run else "dry-run 结束", flush=True)


if __name__ == "__main__":
    main()
