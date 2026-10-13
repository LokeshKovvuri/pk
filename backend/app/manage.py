"""Database commands:  python -m app.manage <command>

  create-db            create the PostgreSQL database if it does not exist
  migrate              apply all pending migrations (also runs automatically on server start)
  revision "message"   generate a new migration from your model changes
  downgrade [rev]      roll back (default: one step)
  current              show the database's current migration
"""
import sys

from alembic import command

from . import migrate


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd, args = argv[0], argv[1:]
    cfg = migrate.alembic_config()
    if cmd == "create-db":
        print("Database created." if migrate.ensure_database() else "Database already exists (or not PostgreSQL).")
    elif cmd == "migrate":
        migrate.ensure_database()
        migrate.upgrade()
        print("Database is up to date.")
    elif cmd == "revision":
        if not args:
            print('Usage: python -m app.manage revision "what changed"')
            return 1
        migrate.ensure_database()
        migrate.upgrade()  # autogenerate compares against an up-to-date database
        command.revision(cfg, message=args[0], autogenerate=True)
    elif cmd == "downgrade":
        command.downgrade(cfg, args[0] if args else "-1")
    elif cmd == "current":
        command.current(cfg, verbose=True)
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
