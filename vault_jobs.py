"""Background jobs for the Vault: daily database backups and alert checks.

Backups: a consistent SQLite snapshot (sqlite3 backup API, safe while the app
is running) is written to <volume>/backups once a day; the newest 14 are kept.
The Owner can also make one on demand, download it, or restore it (the
restore swaps the database file at the next start, then restarts the app).

Alerts (every 5 minutes): low OpenRouter credit, error spikes, AI failures,
sign-up spikes and new content-safety flags. Each kind is raised at most once
an hour, and the Vault shows them (and a browser notification while open).
"""

import asyncio
import os
import shutil
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

KEEP_BACKUPS = int(os.getenv("VAULT_KEEP_BACKUPS", "14"))
CREDIT_ALERT_USD = float(os.getenv("ALERT_CREDIT_USD", "5"))


# ─────────────────────────────────────────────── backups ──
def db_path() -> Path | None:
    from database import settings
    url = settings.database_url or ""
    if not url.startswith("sqlite"):
        return None
    p = url.split(":///", 1)[-1]
    p = Path(p if os.path.isabs(p) else os.path.abspath(p))
    return p if p.exists() else None


def backup_dir() -> Path:
    src = db_path()
    for cand in (os.getenv("BACKUP_DIR", ""), str(src.parent / "backups") if src else "", "/data/backups",
                 os.path.join(os.path.dirname(os.path.abspath(__file__)), "backups")):
        if not cand:
            continue
        try:
            d = Path(cand)
            d.mkdir(parents=True, exist_ok=True)
            return d
        except Exception:
            continue
    raise RuntimeError("No folder for backups")


def make_backup(label: str = "auto") -> dict:
    """Write a consistent snapshot; returns {name, size, created}."""
    src = db_path()
    if not src:
        raise RuntimeError("Backups need the SQLite database")
    d = backup_dir()
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    name = f"zelpophai-{ts}-{label}.db"
    tmp = d / (name + ".part")
    con = sqlite3.connect(str(src), timeout=30)
    try:
        out = sqlite3.connect(str(tmp))
        try:
            con.backup(out)
        finally:
            out.close()
    finally:
        con.close()
    os.replace(tmp, d / name)
    prune()
    st = (d / name).stat()
    return {"name": name, "size": st.st_size, "created": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat()}


def list_backups() -> list:
    try:
        d = backup_dir()
    except Exception:
        return []
    out = []
    for f in sorted(d.glob("zelpophai-*.db"), key=lambda f: f.stat().st_mtime, reverse=True):
        st = f.stat()
        out.append({"name": f.name, "size": st.st_size, "auto": f.name.endswith("-auto.db"),
                    "created": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat()})
    return out


def prune():
    autos = [b for b in list_backups() if b["auto"]]
    for b in autos[KEEP_BACKUPS:]:
        try:
            (backup_dir() / b["name"]).unlink()
        except Exception:
            pass


def safe_backup_file(name: str) -> Path:
    if not name or "/" in name or "\\" in name or not name.startswith("zelpophai-") or not name.endswith(".db"):
        raise ValueError("Bad backup name")
    f = backup_dir() / name
    if not f.is_file():
        raise FileNotFoundError(name)
    return f


def schedule_restore(name: str):
    """Mark a backup to be swapped in at the next start (see apply_pending_restore)."""
    f = safe_backup_file(name)
    (backup_dir() / "RESTORE_PENDING").write_text(f.name)


def apply_pending_restore():
    """Called at startup before the database is opened."""
    try:
        marker = backup_dir() / "RESTORE_PENDING"
        if not marker.exists():
            return
        name = marker.read_text().strip()
        marker.unlink()
        src = db_path()
        f = safe_backup_file(name)
        if src:
            ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
            shutil.copy2(src, backup_dir() / f"zelpophai-{ts}-before-restore.db")
            for extra in ("-wal", "-shm"):
                try:
                    Path(str(src) + extra).unlink()
                except FileNotFoundError:
                    pass
            shutil.copy2(f, src)
            print(f"[vault] Restored database from {name}")
    except Exception as e:
        print(f"[vault] restore failed: {e}")


async def backup_loop():
    await asyncio.sleep(120)
    while True:
        try:
            latest = next((b for b in list_backups() if b["auto"]), None)
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(latest["created"])).total_seconds() if latest else 1e9
            if age > 23 * 3600:
                info = await asyncio.to_thread(make_backup, "auto")
                print(f"[vault] daily backup {info['name']} ({info['size']} bytes)")
        except Exception as e:
            print(f"[vault] backup failed: {e}")
        await asyncio.sleep(3600)


# ──────────────────────────────────────────────── alerts ──
async def raise_alert(db, kind, level, title, detail=""):
    from sqlalchemy import select
    from database import VaultAlert
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    dup = (await db.execute(select(VaultAlert).where(VaultAlert.kind == kind, VaultAlert.created_at >= since))).scalars().first()
    if dup:
        return
    db.add(VaultAlert(kind=kind, level=level, title=title[:200], detail=detail[:2000]))
    await db.commit()


async def check_alerts():
    from sqlalchemy import func, select
    from database import ContentFlag, ErrorEvent, User, async_session
    import ai_meter
    now = datetime.now(timezone.utc)
    async with async_session() as db:
        cr = await ai_meter.credits()
        if cr and cr["left"] < CREDIT_ALERT_USD:
            await raise_alert(db, "credit_low", "critical" if cr["left"] < 1 else "warn",
                              f"OpenRouter credit is low: ${cr['left']:.2f} left",
                              "Top up at openrouter.ai/settings/credits before the AI stops answering.")
        ten = now - timedelta(minutes=10)
        srv = (await db.execute(select(func.count()).select_from(ErrorEvent).where(ErrorEvent.kind == "server", ErrorEvent.created_at >= ten))).scalar() or 0
        if srv >= 10:
            await raise_alert(db, "server_errors", "critical", f"{srv} server errors in the last 10 minutes", "Open Live → Errors to see what's failing.")
        aie = (await db.execute(select(func.count()).select_from(ErrorEvent).where(ErrorEvent.kind == "ai", ErrorEvent.created_at >= ten))).scalar() or 0
        if aie >= 5:
            await raise_alert(db, "ai_errors", "critical", f"The AI failed {aie} times in the last 10 minutes",
                              "Usually out of credit, a model outage or rate limits. Check Live → Errors.")
        hr = now - timedelta(hours=1)
        su = (await db.execute(select(func.count()).select_from(User).where(User.created_at >= hr, ~User.username.like("guest_%")))).scalar() or 0
        if su >= int(os.getenv("ALERT_SIGNUPS_PER_HOUR", "25")):
            await raise_alert(db, "signup_spike", "info", f"{su} new accounts in the last hour", "Great news — or a bot wave. Check Users.")
        fl = (await db.execute(select(func.count()).select_from(ContentFlag).where(ContentFlag.status == "open", ContentFlag.created_at >= hr))).scalar() or 0
        if fl:
            crit = (await db.execute(select(func.count()).select_from(ContentFlag).where(
                ContentFlag.status == "open", ContentFlag.created_at >= hr,
                ContentFlag.category.in_(["self_harm", "sexual_minors", "violence"])))).scalar() or 0
            await raise_alert(db, "safety_flags", "critical" if crit else "warn",
                              f"{fl} new item{'s' if fl > 1 else ''} in the safety queue", "Open Safety to review them.")


async def alert_loop():
    await asyncio.sleep(90)
    while True:
        try:
            await check_alerts()
        except Exception as e:
            print(f"[vault] alert check failed: {e}")
        await asyncio.sleep(300)
