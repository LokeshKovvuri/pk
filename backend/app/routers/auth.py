import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user
from ..models import Block, User
from ..schemas import AuthOut, LoginIn, MeOut, MeUpdate, RegisterIn, ResetIn, UserOut
from ..security import hash_secret, make_token, new_recovery_key, normalize_recovery_key, verify_secret

router = APIRouter(tags=["auth"])
_fails: dict[str, list[float]] = {}


def _throttle(key: str) -> None:
    now = time.time()
    recent = [t for t in _fails.get(key, []) if now - t < 900]
    _fails[key] = recent
    if len(recent) >= 5:
        raise HTTPException(429, "Too many attempts. Try again in a few minutes.")


def _fail(key: str) -> None:
    _fails.setdefault(key, []).append(time.time())


@router.post("/auth/register", response_model=AuthOut, status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "That email already has an account.")
    if db.scalar(select(User).where(User.username == data.username)):
        raise HTTPException(409, "That username is taken.")
    key = new_recovery_key()
    user = User(email=email, username=data.username, name=data.name.strip(),
                password_hash=hash_secret(data.password), recovery_hash=hash_secret(normalize_recovery_key(key)))
    db.add(user)
    db.commit()
    return AuthOut(token=make_token(user.id), user=UserOut.model_validate(user), recovery_key=key)


@router.post("/auth/login", response_model=AuthOut)
def login(data: LoginIn, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    _throttle(email)
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_secret(data.password, user.password_hash):
        _fail(email)
        raise HTTPException(401, "Wrong email or password.")
    return AuthOut(token=make_token(user.id), user=UserOut.model_validate(user))


@router.post("/auth/reset", response_model=AuthOut)
def reset(data: ResetIn, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    _throttle(email)
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_secret(normalize_recovery_key(data.recovery_key), user.recovery_hash):
        _fail(email)
        raise HTTPException(400, "Email or recovery key is not correct.")
    key = new_recovery_key()  # rotate so a used key cannot be replayed
    user.password_hash = hash_secret(data.new_password)
    user.recovery_hash = hash_secret(normalize_recovery_key(key))
    db.commit()
    return AuthOut(token=make_token(user.id), user=UserOut.model_validate(user), recovery_key=key)


def _me(db: Session, user: User) -> MeOut:
    n = db.scalar(select(func.count()).select_from(Block).where(Block.blocker_id == user.id)) or 0
    return MeOut(id=user.id, username=user.username, name=user.name, status=user.status, email=user.email, blocked_count=n)


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _me(db, user)


@router.patch("/me", response_model=MeOut)
def update_me(data: MeUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if data.name is not None:
        user.name = data.name.strip()
    if data.status is not None:
        user.status = data.status.strip()
    db.commit()
    return _me(db, user)
