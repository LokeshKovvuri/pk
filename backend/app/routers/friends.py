from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import blocked_between, current_user, friendship_between, membership, pair_ids
from ..models import Block, Friendship, FriendRequest, Message, Report, SharedPromise, User
from ..schemas import BlockIn, FriendOut, ReportIn, RequestOut, RequestsOut, UserOut, UsernameIn

router = APIRouter(tags=["friends"])


def _users(db: Session, ids: set[int]) -> dict[int, User]:
    return {u.id: u for u in db.scalars(select(User).where(User.id.in_(ids))).all()} if ids else {}


def _drop_friendship(db: Session, f: Friendship) -> None:
    db.execute(delete(Message).where(Message.friendship_id == f.id))
    db.execute(delete(SharedPromise).where(SharedPromise.friendship_id == f.id))
    db.delete(f)


@router.get("/users/search", response_model=UserOut)
def search(username: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    found = db.scalar(select(User).where(User.username == username.strip().lower()))
    if not found or found.id == user.id or blocked_between(db, user.id, found.id):
        raise HTTPException(404, "No one has that username.")
    return found


@router.get("/friends", response_model=list[FriendOut])
def friends(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Friendship).where(or_(Friendship.user_a_id == user.id, Friendship.user_b_id == user.id))).all()
    others = {f.id: (f.user_b_id if f.user_a_id == user.id else f.user_a_id) for f in rows}
    users = _users(db, set(others.values()))
    return [FriendOut(friendship_id=f.id, user=UserOut.model_validate(users[others[f.id]])) for f in rows]


@router.get("/friends/requests", response_model=RequestsOut)
def requests(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(FriendRequest).where(or_(FriendRequest.from_id == user.id, FriendRequest.to_id == user.id))).all()
    users = _users(db, {r.from_id for r in rows} | {r.to_id for r in rows})
    incoming = [RequestOut(id=r.id, user=UserOut.model_validate(users[r.from_id])) for r in rows
                if r.to_id == user.id and not blocked_between(db, user.id, r.from_id)]
    outgoing = [RequestOut(id=r.id, user=UserOut.model_validate(users[r.to_id])) for r in rows if r.from_id == user.id]
    return RequestsOut(incoming=incoming, outgoing=outgoing)


@router.post("/friends/requests", status_code=201)
def send_request(data: UsernameIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    other = db.scalar(select(User).where(User.username == data.username.strip().lower()))
    if not other or other.id == user.id or blocked_between(db, user.id, other.id):
        raise HTTPException(404, "No one has that username.")
    if friendship_between(db, user.id, other.id):
        raise HTTPException(409, "You are already friends.")
    if db.scalar(select(FriendRequest.id).where(FriendRequest.from_id == other.id, FriendRequest.to_id == user.id)):
        raise HTTPException(409, "They already sent you a request. Accept it in Friends.")
    if db.scalar(select(FriendRequest.id).where(FriendRequest.from_id == user.id, FriendRequest.to_id == other.id)):
        raise HTTPException(409, "Request already sent.")
    db.add(FriendRequest(from_id=user.id, to_id=other.id))
    db.commit()
    return {"ok": True}


@router.post("/friends/requests/{rid}/accept", response_model=FriendOut)
def accept(rid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = db.get(FriendRequest, rid)
    if not r or r.to_id != user.id or blocked_between(db, user.id, r.from_id):
        raise HTTPException(404, "Request not found")
    a, b = pair_ids(r.from_id, r.to_id)
    f = friendship_between(db, a, b) or Friendship(user_a_id=a, user_b_id=b)
    db.add(f)
    db.delete(r)
    db.commit()
    return FriendOut(friendship_id=f.id, user=UserOut.model_validate(db.get(User, r.from_id)))


@router.delete("/friends/requests/{rid}", status_code=204)
def drop_request(rid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = db.get(FriendRequest, rid)
    if not r or user.id not in (r.from_id, r.to_id):
        raise HTTPException(404, "Request not found")
    db.delete(r)
    db.commit()


@router.delete("/friends/{fid}", status_code=204)
def unfriend(fid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _drop_friendship(db, membership(db, user, fid))
    db.commit()


@router.post("/blocks", status_code=201)
def block(data: BlockIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if data.user_id == user.id or not db.get(User, data.user_id):
        raise HTTPException(404, "User not found")
    if not db.scalar(select(Block.id).where(Block.blocker_id == user.id, Block.blocked_id == data.user_id)):
        db.add(Block(blocker_id=user.id, blocked_id=data.user_id))
    f = friendship_between(db, user.id, data.user_id)
    if f:
        _drop_friendship(db, f)
    db.execute(delete(FriendRequest).where(or_(
        (FriendRequest.from_id == user.id) & (FriendRequest.to_id == data.user_id),
        (FriendRequest.from_id == data.user_id) & (FriendRequest.to_id == user.id))))
    db.commit()
    return {"ok": True}


@router.delete("/blocks", status_code=204)
def clear_blocks(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(delete(Block).where(Block.blocker_id == user.id))
    db.commit()


@router.post("/reports", status_code=201)
def report(data: ReportIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.add(Report(reporter_id=user.id, kind=data.kind, target_id=data.target_id))
    db.commit()
    return {"ok": True}
