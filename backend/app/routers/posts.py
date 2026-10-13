from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, friend_ids
from ..models import Like, Post, User, utcnow
from ..schemas import FeedOut, PostIn, PostOut, UserOut

router = APIRouter(tags=["posts"])


def _out(db: Session, posts: list[Post], me: User) -> list[PostOut]:
    if not posts:
        return []
    ids = [p.id for p in posts]
    counts = dict(db.execute(select(Like.post_id, func.count()).where(Like.post_id.in_(ids)).group_by(Like.post_id)).all())
    liked = set(db.scalars(select(Like.post_id).where(Like.post_id.in_(ids), Like.user_id == me.id)).all())
    authors = {u.id: u for u in db.scalars(select(User).where(User.id.in_({p.author_id for p in posts}))).all()}
    return [PostOut(id=p.id, kind=p.kind, text=p.text, created_at=p.created_at, expires_at=p.expires_at,
                    author=UserOut.model_validate(authors[p.author_id]), likes=counts.get(p.id, 0),
                    liked=p.id in liked, mine=p.author_id == me.id) for p in posts]


def _visible(db: Session, me: User, post: Post) -> bool:
    return post.author_id == me.id or post.author_id in friend_ids(db, me.id)


@router.get("/feed", response_model=FeedOut)
def feed(user: User = Depends(current_user), db: Session = Depends(get_db)):
    authors = friend_ids(db, user.id) | {user.id}
    now = utcnow()
    rows = db.scalars(select(Post).where(Post.author_id.in_(authors)).order_by(Post.created_at.desc()).limit(120)).all()
    stories = [p for p in rows if p.kind == "story" and p.expires_at and p.expires_at > now]
    posts = [p for p in rows if p.kind == "post"][:50]
    return FeedOut(stories=_out(db, stories, user), posts=_out(db, posts, user))


@router.post("/posts", response_model=PostOut, status_code=201)
def create_post(data: PostIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = Post(author_id=user.id, kind=data.kind, text=data.text.strip(),
             expires_at=utcnow() + timedelta(hours=24) if data.kind == "story" else None)
    db.add(p)
    db.commit()
    return _out(db, [p], user)[0]


@router.delete("/posts/{pid}", status_code=204)
def delete_post(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Post, pid)
    if not p or p.author_id != user.id:
        raise HTTPException(404, "Post not found")
    db.query(Like).filter(Like.post_id == pid).delete()
    db.delete(p)
    db.commit()


@router.post("/posts/{pid}/like")
def toggle_like(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Post, pid)
    if not p or not _visible(db, user, p):
        raise HTTPException(404, "Post not found")
    existing = db.get(Like, (pid, user.id))
    if existing:
        db.delete(existing)
    else:
        db.add(Like(post_id=pid, user_id=user.id))
    db.commit()
    n = db.scalar(select(func.count()).select_from(Like).where(Like.post_id == pid))
    return {"liked": existing is None, "likes": n}
