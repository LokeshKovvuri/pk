import calendar
from collections import defaultdict
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Promise, User, utcnow


def _pct(items: list[Promise]) -> int | None:
    closed = [p for p in items if p.status != "open"]
    if not closed:
        return None
    return round(100 * sum(p.status == "kept" for p in closed) / len(closed))


def next_due(d: date, repeat: str) -> date:
    if repeat == "daily":
        return date.fromordinal(d.toordinal() + 1)
    if repeat == "weekly":
        return date.fromordinal(d.toordinal() + 7)
    year, month = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def compute(db: Session, user: User) -> dict:
    rows = db.scalars(select(Promise).where(Promise.owner_id == user.id)).all()
    mine = [p for p in rows if p.direction == "mine"]
    theirs = [p for p in rows if p.direction == "theirs"]
    closed_mine = sorted((p for p in mine if p.status != "open"), key=lambda p: p.closed_at or datetime.min, reverse=True)

    current = 0
    for p in closed_mine:
        if p.status != "kept":
            break
        current += 1
    best = run = 0
    for p in reversed(closed_mine):
        run = run + 1 if p.status == "kept" else 0
        best = max(best, run)

    kept = [p for p in closed_mine if p.status == "kept"]
    on_time = round(100 * sum(not p.late for p in kept) / len(kept)) if kept else None

    now = utcnow()
    months = []
    for back in range(5, -1, -1):
        y, m = now.year, now.month - back
        while m < 1:
            m += 12
            y -= 1
        bucket = [p for p in closed_mine if p.closed_at and (p.closed_at.year, p.closed_at.month) == (y, m)]
        months.append({"month": f"{y}-{m:02d}", "kept": sum(p.status == "kept" for p in bucket),
                       "missed": sum(p.status == "broken" for p in bucket)})

    people: dict[str, dict] = defaultdict(lambda: {"name": "", "mine": [0, 0], "theirs": [0, 0]})
    for p in rows:
        if p.status == "open":
            continue
        e = people[p.person.strip().lower()]
        e["name"] = e["name"] or p.person
        e[p.direction][1] += 1
        e[p.direction][0] += p.status == "kept"
    people_out = [{"person": e["name"], "mine_kept": e["mine"][0], "mine_total": e["mine"][1],
                   "theirs_kept": e["theirs"][0], "theirs_total": e["theirs"][1]} for e in people.values()]

    return {
        "kept_pct": _pct(mine), "others_pct": _pct(theirs),
        "kept": len(kept), "closed": len(closed_mine),
        "streak": current, "best_streak": best, "on_time_pct": on_time,
        "open": sum(p.status == "open" for p in rows),
        "months": months, "people": sorted(people_out, key=lambda x: x["person"].lower()),
    }
