from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user
from ..models import Promise, User, utcnow
from ..schemas import CloseIn, PromiseIn, PromiseOut, PromiseUpdate
from ..stats import compute, next_due

router = APIRouter(tags=["promises"])


def _own(db: Session, user: User, pid: int) -> Promise:
    p = db.get(Promise, pid)
    if not p or p.owner_id != user.id:
        raise HTTPException(404, "Promise not found")
    return p


@router.get("/promises", response_model=list[PromiseOut])
def list_promises(status: Literal["open", "closed"] = "open", q: str = Query("", max_length=60),
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Promise).where(Promise.owner_id == user.id)
    stmt = stmt.where(Promise.status == "open") if status == "open" else stmt.where(Promise.status != "open")
    rows = db.scalars(stmt).all()
    if q.strip():
        needle = q.strip().lower()
        rows = [p for p in rows if needle in f"{p.text} {p.person} {p.note}".lower()]
    if status == "open":
        rows.sort(key=lambda p: (p.due is None, p.due or date.max, p.id))
    else:
        rows.sort(key=lambda p: p.closed_at or p.created_at, reverse=True)
        rows = rows[:200]
    return rows


@router.post("/promises", response_model=PromiseOut, status_code=201)
def create_promise(data: PromiseIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = Promise(owner_id=user.id, **data.model_dump())
    p.text, p.person, p.note = p.text.strip(), p.person.strip(), p.note.strip()
    db.add(p)
    db.commit()
    return p


@router.patch("/promises/{pid}", response_model=PromiseOut)
def update_promise(pid: int, data: PromiseUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _own(db, user, pid)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(p, k, v.strip() if isinstance(v, str) else v)
    db.commit()
    return p


@router.post("/promises/{pid}/close", response_model=PromiseOut)
def close_promise(pid: int, data: CloseIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _own(db, user, pid)
    if p.status != "open":
        raise HTTPException(409, "Already closed")
    p.status, p.closed_at = data.status, utcnow()
    p.late = bool(p.due and p.due < date.today())
    if p.repeat and p.due:  # recurring promises create their next occurrence
        d = next_due(p.due, p.repeat)
        for _ in range(400):
            if d >= date.today():
                break
            d = next_due(d, p.repeat)
        db.add(Promise(owner_id=user.id, direction=p.direction, text=p.text, person=p.person,
                       note=p.note, due=d, repeat=p.repeat))
    db.commit()
    return p


@router.post("/promises/{pid}/reopen", response_model=PromiseOut)
def reopen_promise(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _own(db, user, pid)
    p.status, p.closed_at, p.late = "open", None, False
    db.commit()
    return p


@router.delete("/promises/{pid}", status_code=204)
def delete_promise(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(_own(db, user, pid))
    db.commit()


@router.get("/stats")
def stats(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return compute(db, user)
