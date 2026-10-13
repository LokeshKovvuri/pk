from datetime import date, timedelta

from .conftest import register


def test_auth_flow(client):
    h, d = register(client, "alice")
    assert d["recovery_key"] and len(d["recovery_key"]) == 19
    assert client.post("/api/auth/register", json={"name": "A", "username": "alice", "email": "x@y.com", "password": "password123"}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "alice@example.com", "password": "wrong-pass"}).status_code == 401
    ok = client.post("/api/auth/login", json={"email": "ALICE@example.com", "password": "password123"})
    assert ok.status_code == 200
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me", headers=h).json()["username"] == "alice"
    # recovery key resets the password and rotates the key
    r = client.post("/api/auth/reset", json={"email": "alice@example.com", "recovery_key": d["recovery_key"].lower(), "new_password": "newpassword9"})
    assert r.status_code == 200 and r.json()["recovery_key"] != d["recovery_key"]
    assert client.post("/api/auth/login", json={"email": "alice@example.com", "password": "newpassword9"}).status_code == 200
    assert client.post("/api/auth/reset", json={"email": "alice@example.com", "recovery_key": d["recovery_key"], "new_password": "anotherpass1"}).status_code == 400


def test_promises_stats_and_repeat(client):
    h, _ = register(client, "bob")
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    p = client.post("/api/promises", headers=h, json={"direction": "mine", "text": "Call Mom", "person": "Mom", "due": yesterday, "repeat": "weekly"}).json()
    client.post("/api/promises", headers=h, json={"direction": "theirs", "text": "Send photos", "person": "Sam"})
    assert len(client.get("/api/promises", headers=h).json()) == 2
    closed = client.post(f"/api/promises/{p['id']}/close", headers=h, json={"status": "kept"}).json()
    assert closed["status"] == "kept" and closed["late"] is True
    open_ = client.get("/api/promises", headers=h).json()
    assert len(open_) == 2 and any(x["text"] == "Call Mom" and x["due"] >= date.today().isoformat() for x in open_)  # next occurrence spawned
    s = client.get("/api/stats", headers=h).json()
    assert s["kept_pct"] == 100 and s["streak"] == 1 and s["on_time_pct"] == 0
    assert client.get("/api/promises?status=closed&q=mom", headers=h).json()[0]["id"] == p["id"]
    assert client.post(f"/api/promises/{p['id']}/close", headers=h, json={"status": "kept"}).status_code == 409
    client.post(f"/api/promises/{p['id']}/reopen", headers=h)
    assert client.delete(f"/api/promises/{p['id']}", headers=h).status_code == 204


def test_promises_are_private(client):
    h1, _ = register(client, "carol")
    h2, _ = register(client, "dave")
    p = client.post("/api/promises", headers=h1, json={"direction": "mine", "text": "Secret", "person": "X"}).json()
    assert client.patch(f"/api/promises/{p['id']}", headers=h2, json={"text": "hacked"}).status_code == 404
    assert client.delete(f"/api/promises/{p['id']}", headers=h2).status_code == 404
    assert client.get("/api/promises", headers=h2).json() == []


def _befriend(client, ha, hb, b_username):
    assert client.post("/api/friends/requests", headers=ha, json={"username": b_username}).status_code == 201
    rid = client.get("/api/friends/requests", headers=hb).json()["incoming"][0]["id"]
    return client.post(f"/api/friends/requests/{rid}/accept", headers=hb).json()["friendship_id"]


def test_friends_chat_feed_shared(client):
    ha, _ = register(client, "erin")
    hb, _ = register(client, "frank")
    hc, _ = register(client, "gina")
    assert client.get("/api/users/search?username=frank", headers=ha).json()["name"] == "Frank"
    fid = _befriend(client, ha, hb, "frank")
    assert [f["user"]["username"] for f in client.get("/api/friends", headers=ha).json()] == ["frank"]

    # chat: live delivery over WebSocket + access control
    tok = hb["Authorization"].split()[1]
    with client.websocket_connect(f"/ws?token={tok}") as ws:
        sent = client.post(f"/api/chats/{fid}/messages", headers=ha, json={"text": "hello"})
        assert sent.status_code == 201
        assert ws.receive_json()["message"]["text"] == "hello"
    assert [m["text"] for m in client.get(f"/api/chats/{fid}/messages", headers=hb).json()] == ["hello"]
    assert client.get(f"/api/chats/{fid}/messages", headers=hc).status_code == 404
    assert client.post(f"/api/chats/{fid}/messages", headers=hc, json={"text": "intrude"}).status_code == 404
    try:
        with client.websocket_connect("/ws?token=bad"):
            raise AssertionError("bad token must be rejected")
    except Exception as e:
        assert "AssertionError" not in type(e).__name__

    # feed visibility: friends see posts, strangers do not; stories; likes
    post = client.post("/api/posts", headers=ha, json={"kind": "post", "text": "Kept it!"}).json()
    client.post("/api/posts", headers=ha, json={"kind": "story", "text": "story"})
    fb = client.get("/api/feed", headers=hb).json()
    assert [p["text"] for p in fb["posts"]] == ["Kept it!"] and len(fb["stories"]) == 1
    assert client.get("/api/feed", headers=hc).json() == {"stories": [], "posts": []}
    assert client.post(f"/api/posts/{post['id']}/like", headers=hb).json() == {"liked": True, "likes": 1}
    assert client.post(f"/api/posts/{post['id']}/like", headers=hc).status_code == 404
    assert client.post(f"/api/posts/{post['id']}/like", headers=hb).json() == {"liked": False, "likes": 0}

    # shared promises: only the recipient can confirm
    sp = client.post("/api/shared", headers=ha, json={"friendship_id": fid, "text": "Bring the book"}).json()
    assert client.post(f"/api/shared/{sp['id']}/close", headers=ha, json={"status": "kept"}).status_code == 404
    done = client.post(f"/api/shared/{sp['id']}/close", headers=hb, json={"status": "kept"}).json()
    assert done["status"] == "kept"
    assert client.post("/api/shared", headers=hc, json={"friendship_id": fid, "text": "x"}).status_code == 404

    # block removes the friendship and hides both people from each other
    uid_b = client.get("/api/me", headers=hb).json()["id"]
    assert client.post("/api/blocks", headers=ha, json={"user_id": uid_b}).status_code == 201
    assert client.get("/api/friends", headers=ha).json() == []
    assert client.get("/api/users/search?username=frank", headers=ha).status_code == 404
    assert client.get("/api/users/search?username=erin", headers=hb).status_code == 404
