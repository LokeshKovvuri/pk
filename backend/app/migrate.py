"""Database bootstrap: create the database if missing, then apply migrations automatically."""
import re
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError

from .config import get_settings
from .db import engine

BASE = Path(__file__).resolve().parents[1]
LOCK_ID = 727274  # arbitrary number; makes concurrent server starts migrate one at a time


def alembic_config() -> Config:
    cfg = Config(str(BASE / "alembic.ini"))
    cfg.set_main_option("script_location", str(BASE / "migrations"))
    return cfg


def ensure_database() -> bool:
    """Create the Postgres database if it does not exist yet. Returns True if it was created.

    Managed hosts (Neon, Supabase, Render) already provide the database, so there this is a no-op.
    """
    url = make_url(get_settings().database_url)
    if not url.drivername.startswith("postgresql"):
        return False
    try:
        with engine.connect():
            return False
    except OperationalError as first_error:
        name = url.database or ""
        if not re.fullmatch(r"[A-Za-z0-9_\-]+", name):
            raise RuntimeError(f"Cannot auto-create database with name {name!r}") from first_error
        admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
        try:
            with admin.connect() as conn:
                if not conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": name}).scalar():
                    conn.execute(text(f'CREATE DATABASE "{name}"'))
                    return True
        except OperationalError:
            raise RuntimeError(
                "Could not connect to PostgreSQL. Check DATABASE_URL (host, user, password) and that the server is running."
            ) from first_error
        finally:
            admin.dispose()
        return False


def upgrade(revision: str = "head") -> None:
    """Apply all pending migrations. Safe to call on every start and from several processes at once."""
    if engine.dialect.name == "postgresql":
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as lock:
            lock.execute(text("SELECT pg_advisory_lock(:k)"), {"k": LOCK_ID})
            try:
                command.upgrade(alembic_config(), revision)
            finally:
                lock.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": LOCK_ID})
    else:
        command.upgrade(alembic_config(), revision)


def bootstrap() -> None:
    ensure_database()
    upgrade()
