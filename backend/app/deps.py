from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Block, Friendship, User
from .security import decode_token

bearer = HTTPBearer(auto_error=False)


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    uid = decode_token(creds.credentials) if creds else None
    user = db.get(User, uid) if uid else None
    if not user:
        raise HTTPException(401, "Please sign in again.")
    return user


def pair_ids(a: int, b: int) -> tuple[int, int]:
    return (a, b) if a < b else (b, a)


def friendship_between(db: Session, a: int, b: int) -> Friendship | None:
    x, y = pair_ids(a, b)
    return db.scalar(select(Friendship).where(Friendship.user_a_id == x, Friendship.user_b_id == y))


def friend_ids(db: Session, uid: int) -> set[int]:
    rows = db.scalars(select(Friendship).where(or_(Friendship.user_a_id == uid, Friendship.user_b_id == uid))).all()
    return {f.user_b_id if f.user_a_id == uid else f.user_a_id for f in rows}


def blocked_between(db: Session, a: int, b: int) -> bool:
    return db.scalar(
        select(Block.id).where(
            or_(
                (Block.blocker_id == a) & (Block.blocked_id == b),
                (Block.blocker_id == b) & (Block.blocked_id == a),
            )
        )
    ) is not None


def membership(db: Session, user: User, friendship_id: int) -> Friendship:
    f = db.get(Friendship, friendship_id)
    if not f or user.id not in (f.user_a_id, f.user_b_id):
        raise HTTPException(404, "Not found")
    return f
