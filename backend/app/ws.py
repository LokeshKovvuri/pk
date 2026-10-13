from fastapi import WebSocket


class Manager:
    """In-memory WebSocket hub. Fine for one server process (free tiers run exactly one)."""

    def __init__(self) -> None:
        self.conns: dict[int, set[WebSocket]] = {}

    async def connect(self, uid: int, ws: WebSocket) -> None:
        await ws.accept()
        self.conns.setdefault(uid, set()).add(ws)

    def disconnect(self, uid: int, ws: WebSocket) -> None:
        self.conns.get(uid, set()).discard(ws)

    async def send(self, uids, payload: dict) -> None:
        for uid in set(uids):
            for ws in list(self.conns.get(uid, ())):
                try:
                    await ws.send_json(payload)
                except Exception:
                    self.disconnect(uid, ws)


manager = Manager()
