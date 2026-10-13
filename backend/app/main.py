from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .migrate import bootstrap
from .routers import auth, chat, friends, posts, promises, shared

settings = get_settings()
if settings.env == "production" and settings.secret_key == "dev-insecure-change-me-dev-insecure-change-me":
    raise RuntimeError("Set SECRET_KEY before running in production.")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_migrate:
        bootstrap()  # creates the Postgres database if missing, then applies pending migrations
    yield


app = FastAPI(title="Promise Keeper API", lifespan=lifespan)
if settings.cors_origins:
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])

api = APIRouter(prefix="/api")
for module in (auth, promises, friends, chat, posts, shared):
    api.include_router(module.router)


@api.get("/health")
def health():
    return {"ok": True}


app.include_router(api)
app.add_api_websocket_route("/ws", chat.ws_endpoint)

if settings.frontend_dir.is_dir():  # one deployable: the API also serves the built web app
    app.mount("/", StaticFiles(directory=settings.frontend_dir, html=True), name="web")
