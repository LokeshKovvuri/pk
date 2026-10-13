from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, membership
from ..models import SharedPromise, User, utcnow
from ..schemas import CloseIn, SharedIn, SharedOut, UserOut

router = APIRouter(tags=["shared"])


def _out(db: Session, rows: list[SharedPromise]) -> list[SharedOut]:
    ids = {r.from_id for r in rows} | {r.to_id for r in rows}
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(ids))).all()} if ids else {}
    return [SharedOut(id=r.id, friendship_id=r.friendship_id, text=r.text, due=r.due, status=r.status,
                      created_at=r.created_at, closed_at=r.closed_at,
                      from_user=UserOut.model_validate(users[r.from_id]), to_user=UserOut.model_validate(users[r.to_id]))
            for r in rows]


@router.get("/shared", response_model=list[SharedOut])
def list_shared(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(SharedPromise).where(or_(SharedPromise.from_id == user.id, SharedPromise.to_id == user.id))
                      .order_by(SharedPromise.id.desc()).limit(200)).all()
    return _out(db, list(rows))


@router.post("/shared", response_model=SharedOut, status_code=201)
def create_shared(data: SharedIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = membership(db, user, data.friendship_id)
    other = f.user_b_id if f.user_a_id == user.id else f.user_a_id
    r = SharedPromise(friendship_id=f.id, from_id=user.id, to_id=other, text=data.text.strip(), due=data.due)
    db.add(r)
    db.commit()
    return _out(db, [r])[0]


@router.post("/shared/{sid}/close", response_model=SharedOut)
def close_shared(sid: int, data: CloseIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = db.get(SharedPromise, sid)
    if not r or r.to_id != user.id:  # only the person the promise was made to can confirm it
        raise HTTPException(404, "Promise not found")
    if r.status != "open":
        raise HTTPException(409, "Already closed")
    r.status, r.closed_at = data.status, utcnow()
    db.commit()
    return _out(db, [r])[0]


@router.delete("/shared/{sid}", status_code=204)
def delete_shared(sid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = db.get(SharedPromise, sid)
    if not r or r.from_id != user.id:
        raise HTTPException(404, "Promise not found")
    db.delete(r)
    db.commit()
