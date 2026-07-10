from datetime import datetime
from typing import Optional

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
    __tablename__ = "users"
    id: Optional[int] = Field(default=None, primary_key=True)
    phone: str = Field(unique=True, index=True)
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


class VenueReview(SQLModel, table=True):
    __tablename__ = "venue_reviews"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    venue_id: int = Field(foreign_key="venues.id", index=True)
    rating: int
    text: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
