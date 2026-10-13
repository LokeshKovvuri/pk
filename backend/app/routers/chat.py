from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import SessionLocal, get_db
from ..deps import current_user, membership
from ..models import Message, User
from ..schemas import MessageIn, MessageOut
from ..security import decode_token
from ..ws import manager

router = APIRouter(tags=["chat"])


@router.get("/chats/{fid}/messages", response_model=list[MessageOut])
def messages(fid: int, after: int = Query(0, ge=0), user: User = Depends(current_user), db: Session = Depends(get_db)):
    membership(db, user, fid)
    rows = db.scalars(select(Message).where(Message.friendship_id == fid, Message.id > after)
                      .order_by(Message.id.desc()).limit(200)).all()
    return list(reversed(rows))


@router.post("/chats/{fid}/messages", response_model=MessageOut, status_code=201)
async def send(fid: int, data: MessageIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = membership(db, user, fid)
    m = Message(friendship_id=fid, sender_id=user.id, text=data.text.strip())
    db.add(m)
    db.commit()
    out = MessageOut.model_validate(m).model_dump(mode="json")
    await manager.send([f.user_a_id, f.user_b_id], {"type": "message", "message": out})
    return m


async def ws_endpoint(ws: WebSocket, token: str = ""):
    uid = decode_token(token)
    if uid is None:
        await ws.close(code=4401)
        return
    with SessionLocal() as db:
        if not db.get(User, uid):
            await ws.close(code=4401)
            return
    await manager.connect(uid, ws)
    try:
        while True:
            await ws.receive_text()  # clients only listen; keeps the connection open
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(uid, ws)
