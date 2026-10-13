# Promise Keeper

Track promises you make and promises made to you, see how reliable everyone is, and share it with friends
(chat, feed, 24-hour stories, promises you confirm for each other).

**Stack:** Python 3.12 + FastAPI + SQLAlchemy + **PostgreSQL** with Alembic migrations (SQLite also works for quick local tests) / vanilla-JS web app built with Vite.
In production one Docker container serves both the API and the web app.

## Project structure

```
promise-keeper/
├── backend/
│   ├── app/
│   │   ├── main.py          # app, CORS, routers, serves the built web app
│   │   ├── config.py        # settings from environment variables
│   │   ├── db.py            # engine + session (PostgreSQL, or SQLite for quick tests)
│   │   ├── migrate.py       # creates the database if missing + applies migrations on start
│   │   ├── manage.py        # commands: create-db, migrate, revision, downgrade, current
│   │   ├── models.py        # tables: users, promises, friendships, messages, posts, ...
│   │   ├── schemas.py       # request/response validation (pydantic)
│   │   ├── security.py      # password hashing (PBKDF2), JWT, recovery keys
│   │   ├── deps.py          # current-user dependency, friendship/block helpers
│   │   ├── stats.py         # reliability statistics, recurring-promise dates
│   │   ├── ws.py            # WebSocket hub for live chat
│   │   └── routers/         # auth, promises, friends, chat, posts, shared
│   ├── migrations/          # Alembic: env.py + versions/0001_initial_schema.py (your table history)
│   ├── alembic.ini
│   ├── tests/               # pytest (+ checks that models and migrations match): auth, privacy, friends, chat (WebSocket), feed, shared, block
│   ├── requirements.txt
│   └── requirements-dev.txt
├── frontend/
│   ├── index.html
│   ├── public/              # manifest.json, sw.js, icons (installable app)
│   ├── src/
│   │   ├── main.js          # app shell, tabs, live-update bus
│   │   ├── api.js           # fetch wrapper + auto-reconnecting WebSocket
│   │   ├── ui.js            # helpers (escape, dates, toast, tap-to-confirm)
│   │   ├── styles.css
│   │   └── pages/           # auth, promises, insights, feed, chats, shared, friends, me
│   ├── package.json
│   └── vite.config.js       # dev proxy to the backend
├── Dockerfile               # builds web app + runs API
├── docker-compose.yml       # local PostgreSQL + app in one command
├── render.yaml              # one-click Render blueprint
├── .github/workflows/ci.yml # tests + build on every push
└── .env.example
```

## Database (PostgreSQL): created and updated automatically

On every start the server (1) creates the PostgreSQL database if it does not exist, then (2) applies any pending
migrations, so tables are created on first run and updated on every deploy. Nothing to run by hand.

**Easiest local setup (Docker):** `docker compose up --build`, then open http://localhost:8000.

**Without Docker:** install PostgreSQL, then set the connection string (the database name does not have to exist yet):
```bash
export DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/promise_keeper   # Windows: set DATABASE_URL=...
```

**Changing the database later (add a column, a table, ...):**
1. Edit `backend/app/models.py`.
2. Run `python -m app.manage revision "describe the change"` (from `backend/`). This writes a new file in `migrations/versions/`.
3. Read the generated file, then commit it with your code change.
4. Start or deploy the app. The migration is applied automatically and existing data is kept.

If you forget step 2, `pytest` fails with "models do not match migrations", so it cannot slip into production.

Other commands: `python -m app.manage create-db | migrate | downgrade | current`. Set `AUTO_MIGRATE=0` to turn the
automatic step off and run `migrate` yourself.

## Run it locally

```bash
# 1. backend (http://localhost:8000, API docs at /docs)
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
export DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/promise_keeper
pytest -q                                              # optional: tests use a throwaway SQLite file by default
uvicorn app.main:app --reload

# 2. web app with hot reload (http://localhost:5173), in a second terminal
cd frontend
npm install
npm run dev
```

To run the tests against PostgreSQL too: `TEST_DATABASE_URL=postgresql://.../pk_tests pytest -q` (use a fresh database each time).

## Deploy for free

You need a **Postgres database that does not expire** and **a host for the container**.

1. **Database:** create a free Postgres project at neon.tech or supabase.com and copy its connection string
   (`postgresql://...`). Check each provider's current free-tier limits before relying on them.
   Do not use SQLite on a free host: its disk is wiped on every restart. The database already exists there, so the app only creates the tables.
   Neon tip: use the **direct** (non-pooled) connection string. Migrations take a lock that pooled connections can break; with a pooled string set `AUTO_MIGRATE=0` and run `python -m app.manage migrate` once per deploy.
2. **Host:** push this folder to GitHub, then on render.com choose *New > Blueprint*, select the repo, and set
   `DATABASE_URL` when asked. `SECRET_KEY` is generated for you. Any Docker host works the same way (Fly.io, Railway, Cloud Run).
3. Open the URL Render gives you. On phones use the browser menu > *Install app* / *Add to Home screen*.

Free-tier reality (as of Oct 2026): Render's free web service sleeps after 15 minutes without traffic and takes
about a minute to wake, so the first request after a quiet spell is slow (the app shows a "waking the server" message).
Render's own free Postgres expires after 30 days, which is why the database lives elsewhere.
No always-on free host exists without trade-offs; a $7/month always-on instance removes the sleep.

### Separate hosting for the web app (optional)
Build with `VITE_API_URL=https://your-api.onrender.com npm run build`, host `frontend/dist` anywhere static
(GitHub Pages, Cloudflare Pages), and set `CORS_ORIGINS=https://your-site` on the API.

## Security notes
- Passwords: PBKDF2-SHA256 (600k iterations), per-user salt. Tokens: signed JWT valid 30 days (`TOKEN_HOURS`).
- Login and password-reset attempts are throttled per email (in memory, resets on restart).
- Every query is scoped to the signed-in user; friends-only content is checked on the server (see tests).
- The app refuses to start in `ENV=production` without a custom `SECRET_KEY`.
- Password reset uses a **recovery key** shown once at sign-up, because there is no email service. Add one (Resend, Brevo, SMTP) if you want email resets.

## Known limits / next steps
- The WebSocket hub is in memory: one server process only (fine for free tiers). Use Redis pub/sub to scale out.
- Migrations that rename or drop columns need a careful look: review every generated file before committing it (Alembic cannot always tell a rename from a drop + add).
- No photo uploads (needs object storage). No push notifications when the app is closed (needs a push service + VAPID keys).
- Back up the database yourself (Neon/Supabase dashboards or `pg_dump`); free tiers may not include backups.
- Moderation: reports are stored in the `reports` table; build an admin view or review them with SQL.
