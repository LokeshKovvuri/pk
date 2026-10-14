from datetime import date, datetime
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer


def _iso(d: Optional[datetime]) -> Optional[str]:
    return d.isoformat() + "Z" if d else None


UTC = Annotated[Optional[datetime], PlainSerializer(_iso, return_type=Optional[str])]
EMAIL = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- auth / users
class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    username: str = Field(pattern=r"^[a-z0-9_]{3,20}$")
    email: str = Field(pattern=EMAIL, max_length=120)
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: str = Field(max_length=120)
    password: str = Field(max_length=128)


class ResetIn(BaseModel):
    email: str = Field(max_length=120)
    recovery_key: str = Field(max_length=40)
    new_password: str = Field(min_length=8, max_length=128)


class UserOut(ORM):
    id: int
    username: str
    name: str
    status: str


class AuthOut(BaseModel):
    token: str
    user: UserOut
    recovery_key: Optional[str] = None


class MeOut(UserOut):
    email: str
    blocked_count: int = 0
    status_until: UTC = None


class MeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=40)
    status: Optional[str] = Field(default=None, max_length=100)
    status_hours: Optional[int] = Field(default=None, ge=0, le=168)  # 0 or missing = never clears


# ---- promises
Direction = Literal["mine", "theirs"]
Repeat = Literal["", "daily", "weekly", "monthly"]


class PromiseIn(BaseModel):
    direction: Direction
    text: str = Field(min_length=1, max_length=120)
    person: str = Field(min_length=1, max_length=40)
    note: str = Field(default="", max_length=140)
    due: Optional[date] = None
    repeat: Repeat = ""


class PromiseUpdate(BaseModel):
    direction: Optional[Direction] = None
    text: Optional[str] = Field(default=None, min_length=1, max_length=120)
    person: Optional[str] = Field(default=None, min_length=1, max_length=40)
    note: Optional[str] = Field(default=None, max_length=140)
    due: Optional[date] = None
    repeat: Optional[Repeat] = None


class CloseIn(BaseModel):
    status: Literal["kept", "broken"]


class PromiseOut(ORM):
    id: int
    direction: str
    text: str
    person: str
    note: str
    due: Optional[date]
    repeat: str
    status: str
    late: bool
    closed_at: UTC
    created_at: UTC


# ---- social
class UsernameIn(BaseModel):
    username: str = Field(max_length=20)


class FriendOut(BaseModel):
    friendship_id: int
    user: UserOut


class RequestOut(BaseModel):
    id: int
    user: UserOut


class RequestsOut(BaseModel):
    incoming: list[RequestOut]
    outgoing: list[RequestOut]


class BlockIn(BaseModel):
    user_id: int


class ReportIn(BaseModel):
    kind: Literal["post", "user", "message"]
    target_id: int


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class MessageOut(ORM):
    id: int
    friendship_id: int
    sender_id: int
    text: str
    created_at: UTC


StoryBg = Literal["", "teal", "violet", "amber", "coral", "blue", "dark"]


class PostIn(BaseModel):
    kind: Literal["post", "story"] = "post"
    bg: StoryBg = ""
    text: str = Field(min_length=1, max_length=500)


class PostOut(BaseModel):
    id: int
    kind: str
    text: str
    bg: str = ""
    created_at: UTC
    expires_at: UTC
    author: UserOut
    likes: int
    liked: bool
    mine: bool
    views: int = 0      # how many friends saw it (only filled in for your own stories)
    viewed: bool = False


class FeedOut(BaseModel):
    stories: list[PostOut]
    posts: list[PostOut]


class SharedIn(BaseModel):
    friendship_id: int
    text: str = Field(min_length=1, max_length=120)
    due: Optional[date] = None


class SharedOut(BaseModel):
    id: int
    friendship_id: int
    text: str
    due: Optional[date]
    status: str
    created_at: UTC
    closed_at: UTC
    from_user: UserOut
    to_user: UserOut
