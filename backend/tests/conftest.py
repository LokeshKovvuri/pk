import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{_db}")
os.environ["PBKDF2_ITERATIONS"] = "1000"
os.environ["FRONTEND_DIR"] = "/nonexistent"
os.environ["SECRET_KEY"] = "test-secret-key-with-at-least-32-bytes-ok"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def register(client, username):
    r = client.post("/api/auth/register", json={"name": username.title(), "username": username,
                                                 "email": f"{username}@example.com", "password": "password123"})
    assert r.status_code == 201, r.text
    d = r.json()
    return {"Authorization": f"Bearer {d['token']}"}, d
