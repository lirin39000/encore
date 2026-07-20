from datetime import datetime
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import SQLModel, Field


class Venue(SQLModel, table=True):
    __tablename__ = "venues"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    city_name: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    formatted_address: Optional[str] = None
    geocode_level: Optional[str] = None
    geocode_status: Optional[str] = None
    last_geocoded_at: Optional[str] = None


class User(SQLModel, table=True):
    """
    一个用户要么是网页版注册的(有 phone，短信登录)，要么是小程序来的(有 openid，
    微信隐式身份)，两者互斥。没做账号打通——同一个人在两边就是两条记录，
    邮件推送那边靠邮箱地址去重，不靠身份识别。
    """
    __tablename__ = "users"
    id: Optional[int] = Field(default=None, primary_key=True)
    # 小程序用户没有手机号，所以这两列都可空。Postgres 的 UNIQUE 允许多行 NULL，
    # 不会因为一堆 phone 为空的小程序用户互相冲突
    phone: Optional[str] = Field(default=None, unique=True, index=True)
    openid: Optional[str] = Field(default=None, unique=True, index=True)
    nickname: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class Session(SQLModel, table=True):
    __tablename__ = "sessions"
    token: str = Field(primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    expires_at: str


class SmsSendLog(SQLModel, table=True):
    __tablename__ = "sms_send_log"
    id: Optional[int] = Field(default=None, primary_key=True)
    phone: str = Field(index=True)
    sent_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    ip: Optional[str] = None


class FollowedArtist(SQLModel, table=True):
    __tablename__ = "followed_artists"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    artist_name: str
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class Favorite(SQLModel, table=True):
    __tablename__ = "favorites"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    show_id: int
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class EmailSubscription(SQLModel, table=True):
    """
    邮件订阅。没有直接给 users 表加字段，是因为线上 Postgres 的表结构靠
    SQLModel.metadata.create_all 维护，它只建缺失的表、不会给已存在的表补列，
    users 表早就建好了，加字段得手写 ALTER 迁移。单独一张表就没这个问题。
    """
    __tablename__ = "email_subscriptions"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", unique=True, index=True)
    email: str
    # 邮箱换了要重新验证，所以 verified 跟着 email 走，不是跟着用户走
    verified: bool = False
    # 残留字段，现在恒为 True。原本是"暂停推送但保留邮箱"，后来取消了这个状态——
    # 网页上看着像订阅着实际收不到信，而且暂停期间演出会积压、重开时一次性轰一封。
    # 现在退订就是删除整条订阅。不直接删这个字段是因为生产库里它是 NOT NULL 且没有
    # server_default，代码一旦不再写入，INSERT 就会失败
    active: bool = True
    verify_token: Optional[str] = Field(default=None, index=True)
    verify_token_expires_at: Optional[str] = None
    # 用来给"重发验证信"做频率限制，不然按钮可以被一直点、拿我们的发信额度去轰别人邮箱
    verify_sent_at: Optional[str] = None
    # 退订链接每封邮件都带，token 不过期，换邮箱时才重新生成
    unsubscribe_token: str = Field(index=True)
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    verified_at: Optional[str] = None
    last_notified_at: Optional[str] = None


class EmailNotifyLog(SQLModel, table=True):
    """
    每个用户已经就哪些演出发过通知。判断"上新"靠的是这张表而不是 shows 表的时间字段——
    shows 只有 last_seen_at(每次抓取都会刷新)，没有"首次出现"的概念；而且用户中途新关注
    一个艺人时，那个艺人的存量演出对这个用户来说也算新的，按用户记录才对得上。
    """
    __tablename__ = "email_notify_log"
    __table_args__ = (UniqueConstraint("user_id", "show_id", name="uq_email_notify_user_show"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    show_id: int
    sent_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class VenueReview(SQLModel, table=True):
    __tablename__ = "venue_reviews"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    venue_id: int = Field(foreign_key="venues.id", index=True)
    rating: int
    text: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
