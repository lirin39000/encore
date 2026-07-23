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
from datetime import datetime, timedelta
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR.parent))

from sqlalchemy import bindparam, text  # noqa: E402

from app.config import ADMIN_ALERT_EMAIL, EMAIL_NOTIFY_MODE  # noqa: E402
from app.db import engine, IS_POSTGRES  # noqa: E402
from app.services import aliyun_dm  # noqa: E402
from app.services.email_content import new_shows_html, new_shows_text  # noqa: E402
from app.services.show_matching import (  # noqa: E402
    MAX_SHOWS_PER_EMAIL,
    fetch_upcoming_shows,
    filter_unnotified_for_users,
    match_shows_for_users,
    record_notified_for_users,
)

# 连续发信之间歇一下。阿里云对触发邮件有每秒发送量限制，订阅用户多起来之后
# 一口气发完容易撞限流，慢一点无所谓——这是每天跑一次的后台任务
SEND_INTERVAL_SECONDS = 1


def load_subscribers(conn):
    """
    按邮箱聚合，而不是按用户。同一个人在网页版(手机号身份)和小程序(openid 身份)
    各订阅一次、填的是同一个邮箱时，是两条 users 记录、两条订阅记录，但只该收到一封信——
    否则两封内容高度重叠的邮件同时到，看起来就像系统出了 bug。

    聚合之后一个邮箱对应多个 user_id：匹配演出时要把这些身份的关注艺人并起来，
    写 notify_log 时也要每个 user_id 都写，不然下次跑另一个身份那边又会当成新的。
    """
    rows = conn.execute(
        text(
            "SELECT user_id, email, unsubscribe_token FROM email_subscriptions "
            "WHERE verified = :t AND active = :t ORDER BY user_id"
        ),
        {"t": True},
    ).mappings().all()

    by_email: dict[str, dict] = {}
    for r in rows:
        # 邮箱大小写不敏感，Foo@x.com 和 foo@x.com 是同一个信箱
        key = r["email"].strip().lower()
        if key in by_email:
            by_email[key]["user_ids"].append(r["user_id"])
        else:
            by_email[key] = {
                "email": r["email"],
                "user_ids": [r["user_id"]],
                # 退订链接用第一条订阅的 token。点了之后只退掉那一条，另一条还在——
                # 邮件底部的说明会让人再点一次，虽然啰嗦但不会误删用户没打算退的订阅
                "unsubscribe_token": r["unsubscribe_token"],
            }
    return list(by_email.values())


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

        # 只推"今天才上新的"演出：first_seen 在最近 26 小时内(pipeline 每天跑一次，26h 给点缓冲)。
        # 加上"售罄不推"。这样用户新关注艺人时不会补发历史演出，也不会推早已售罄的
        new_since = (datetime.now() - timedelta(hours=26)).isoformat()
        shows = fetch_upcoming_shows(conn, new_since=new_since, exclude_sold_out=True)
        print(f"订阅用户 {len(subscribers)} 人，最近 26h 新上演出 {len(shows)} 场", flush=True)

        sent = 0
        failures = []  # [(email, 错误信息)]，跑完统一发一封预警给管理员
        for sub in subscribers:
            user_ids = sub["user_ids"]
            matched = match_shows_for_users(conn, user_ids, shows)
            fresh = filter_unnotified_for_users(conn, user_ids, matched)
            if not fresh:
                continue

            shown = fresh[:MAX_SHOWS_PER_EMAIL]
            if args.dry_run:
                where = f"(合并 {len(user_ids)} 个身份)" if len(user_ids) > 1 else ""
                print(f"  [dry-run] {sub['email']}{where}: {len(fresh)} 场新演出 "
                      f"({', '.join(s['title'] or '?' for s in shown)})", flush=True)
                continue

            subject = "你关注的艺人有新演出"
            try:
                if EMAIL_NOTIFY_MODE == "html":
                    aliyun_dm.send_email(
                        sub["email"], subject, new_shows_html(fresh, shown, sub["unsubscribe_token"])
                    )
                else:
                    # 极简纯文本，救急用(HTML 版被反垃圾拦了)。自己内部截到前 6 场
                    aliyun_dm.send_text(
                        sub["email"], subject, new_shows_text(fresh, sub["unsubscribe_token"])
                    )
            except Exception as e:
                # 一个人发失败不该拖垮整批。这次不写 notify_log，明天会重试这批演出
                print(f"  发给 {sub['email']} 失败，跳过: {e}", flush=True)
                failures.append((sub["email"], str(e)))
                continue

            # 注意记的是 fresh 全部而不是 shown——没列出来的那些已经算在"还有 N 场"里了，
            # 不记的话明天会被当成新的再发一遍
            record_notified_for_users(conn, user_ids, fresh)
            conn.execute(
                text(
                    "UPDATE email_subscriptions SET last_notified_at = :now "
                    "WHERE user_id IN :uids"
                ).bindparams(bindparam("uids", expanding=True)),
                {"now": datetime.now().isoformat(), "uids": user_ids},
            )
            conn.commit()
            sent += 1
            print(f"  已发送 {sub['email']}: {len(fresh)} 场", flush=True)
            time.sleep(SEND_INTERVAL_SECONDS)

    if not args.dry_run and failures:
        alert_admin(failures, sent)

    print(f"完成，共发出 {sent} 封" if not args.dry_run else "dry-run 结束", flush=True)


def alert_admin(failures, sent):
    """
    有邮件没发出去时，给管理员发一封纯文本预警。这个流程跑在 GitHub Actions 里，
    日志没人盯，不主动报警的话，出问题只能等用户来问"怎么没收到"。

    用纯文本发：如果失败原因正是"通知邮件被反垃圾拦了"，富文本的预警多半也会被
    同样拦掉，纯文本没有外链、特征简单，能穿过去。
    """
    if not ADMIN_ALERT_EMAIL:
        print(f"  {len(failures)} 封失败，但没配 ADMIN_ALERT_EMAIL，不发预警", flush=True)
        return
    lines = [
        f"LiveFlow 演出提醒推送：{len(failures)} 封失败，{sent} 封成功。",
        "",
        "失败明细：",
    ]
    for email, err in failures:
        lines.append(f"- {email}: {err}")
    lines += ["", "这些用户的 notify_log 没有写入，下次推送会自动重试，不会漏。"]
    try:
        aliyun_dm.send_text(ADMIN_ALERT_EMAIL, "【LiveFlow】演出提醒推送有失败", "\n".join(lines))
        print(f"  已发预警邮件到 {ADMIN_ALERT_EMAIL}", flush=True)
    except Exception as e:
        # 连预警都发不出去，就只能靠日志了。至少把这件事明确打出来
        print(f"  预警邮件也发送失败: {e}", flush=True)


if __name__ == "__main__":
    main()
