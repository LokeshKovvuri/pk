import os
from functools import lru_cache
from pathlib import Path


def _normalize(url: str) -> str:
    """Accept the URLs Neon/Render/Heroku give you and point SQLAlchemy at psycopg 3."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


class Settings:
    def __init__(self) -> None:
        self.env = os.getenv("ENV", "development")
        self.database_url = _normalize(os.getenv("DATABASE_URL", "sqlite:///./promise_keeper.db"))
        self.secret_key = os.getenv("SECRET_KEY", "dev-insecure-change-me-dev-insecure-change-me")
        self.auto_migrate = os.getenv("AUTO_MIGRATE", "1") != "0"
        self.token_hours = int(os.getenv("TOKEN_HOURS", "720"))
        self.pbkdf2_iterations = int(os.getenv("PBKDF2_ITERATIONS", "600000"))
        self.cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
        default_dir = Path(__file__).resolve().parents[2] / "frontend" / "dist"
        self.frontend_dir = Path(os.getenv("FRONTEND_DIR", str(default_dir)))


@lru_cache
def get_settings() -> Settings:
    return Settings()
