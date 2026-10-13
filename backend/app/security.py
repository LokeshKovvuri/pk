import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt

from .config import get_settings


def _derive(secret: str, salt: bytes, iterations: int) -> str:
    return hashlib.pbkdf2_hmac("sha256", secret.encode(), salt, iterations).hex()


def hash_secret(secret: str) -> str:
    iterations = get_settings().pbkdf2_iterations
    salt = os.urandom(16)
    return f"pbkdf2${iterations}${salt.hex()}${_derive(secret, salt, iterations)}"


def verify_secret(secret: str, stored: str) -> bool:
    try:
        _, iterations, salt, digest = stored.split("$")
        return hmac.compare_digest(_derive(secret, bytes.fromhex(salt), int(iterations)), digest)
    except (ValueError, TypeError):
        return False


def make_token(user_id: int) -> str:
    s = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(hours=s.token_hours)
    return jwt.encode({"sub": str(user_id), "exp": exp}, s.secret_key, algorithm="HS256")


def decode_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def new_recovery_key() -> str:
    raw = secrets.token_hex(8).upper()
    return "-".join(raw[i:i + 4] for i in range(0, 16, 4))


def normalize_recovery_key(key: str) -> str:
    return key.replace("-", "").replace(" ", "").upper()
