from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect

from app.db import Base, engine
from app.migrate import alembic_config, upgrade


def test_models_match_migrations(client):
    """Fails if you changed models.py but forgot: python -m app.manage revision "message"."""
    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn, opts={"compare_type": True})
        assert compare_metadata(ctx, Base.metadata) == []


def test_migrations_roll_back_and_forward(client):
    command.downgrade(alembic_config(), "base")
    assert "users" not in inspect(engine).get_table_names()
    upgrade()
    assert {"users", "promises", "friendships", "messages", "posts", "shared_promises"} <= set(inspect(engine).get_table_names())
