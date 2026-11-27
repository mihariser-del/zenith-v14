"""Each person's own account security: where they've signed in from, and how to
make the account safer.

This is the one people see in the app menu (Security). The Owner's much bigger
version lives in the Vault; the shared plain-language helpers are in secops.py.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user_from_cookie
from database import LoginHistory, get_db

router = APIRouter(prefix="/api/security", tags=["security"])


def _iso(dt):
    if dt is None:
        return ""
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


def _entry(e, secops):
    """One line of history, in words rather than browser gibberish."""
    return {
        "id": e.id,
        "ok": bool(e.success),
        "at": _iso(e.login_at),
        "device": secops.describe_device(e.user_agent),
        "kind": secops.device_kind(e.user_agent),
        "place": secops.describe_place(e.ip_address),
        "ip": e.ip_address or "",
        "here": secops.is_local(e.ip_address),
    }


@router.get("/login-history")
async def get_login_history(request: Request, db: AsyncSession = Depends(get_db)):
    """The last 50 times anyone tried to get into this account."""
    import secops
    user = await get_current_user_from_cookie(request, db)
    rows = (await db.execute(
        select(LoginHistory).where(LoginHistory.user_id == user.id)
        .order_by(LoginHistory.login_at.desc()).limit(50))).scalars().all()
    await secops.learn_places([r.ip_address for r in rows])
    return {"history": [_entry(e, secops) for e in rows]}


@router.get("/dashboard")
async def security_dashboard(request: Request, db: AsyncSession = Depends(get_db)):
    """Everything the Security window shows: the numbers, and what to check."""
    import secops
    user = await get_current_user_from_cookie(request, db)
    now = datetime.now(timezone.utc)
    month = now - timedelta(days=30)

    def count(*where):
        return select(func.count()).select_from(LoginHistory).where(LoginHistory.user_id == user.id, *where)

    total = (await db.execute(count(LoginHistory.success.is_(True)))).scalar() or 0
    failed = (await db.execute(count(LoginHistory.success.is_(False)))).scalar() or 0
    failed_recent = (await db.execute(count(LoginHistory.success.is_(False), LoginHistory.login_at >= month))).scalar() or 0
    places = (await db.execute(
        select(func.count(func.distinct(LoginHistory.ip_address)))
        .where(LoginHistory.user_id == user.id, LoginHistory.ip_address != ""))).scalar() or 0

    recent = (await db.execute(
        select(LoginHistory).where(LoginHistory.user_id == user.id, LoginHistory.success.is_(True))
        .order_by(LoginHistory.login_at.desc()).limit(2))).scalars().all()
    await secops.learn_places([r.ip_address for r in recent])
    last = recent[0] if recent else None
    previous = recent[1] if len(recent) > 1 else None

    # What this person could do to be safer. Short, and each one actionable.
    tips = []
    if (user.email or "").strip():
        tips.append({"key": "email", "state": "good", "title": "You can get back in if you forget your password",
                     "detail": f"A reset link would go to {user.email}.", "fix": "", "action": ""})
    else:
        tips.append({"key": "email", "state": "bad", "title": "Add an email address",
                     "detail": "Without one there is no way to get back into your account if you forget your password.",
                     "fix": "Add it now", "action": "email"})
    if failed_recent >= 5:
        tips.append({"key": "failed", "state": "warn", "title": f"{failed_recent} wrong passwords in the last month",
                     "detail": "If that wasn't you, change your password and sign out everywhere else.",
                     "fix": "Change my password", "action": "password"})
    elif failed_recent:
        tips.append({"key": "failed", "state": "good", "title": "Nothing unusual lately",
                     "detail": f"{failed_recent} wrong password{'s' if failed_recent != 1 else ''} in the last month — probably just a typo.",
                     "fix": "", "action": ""})
    else:
        tips.append({"key": "failed", "state": "good", "title": "Nobody has tried to guess your password",
                     "detail": "No failed sign-ins in the last month.", "fix": "", "action": ""})
    tips.append({"key": "signout", "state": "good", "title": "Signed in somewhere you've forgotten about?",
                 "detail": "Signing out everywhere ends your session on every phone, tablet and computer. You stay signed in here.",
                 "fix": "Sign out everywhere", "action": "signout"})

    return {
        "logins": total, "failed": failed, "failed_recent": failed_recent, "places": places,
        "last": _entry(last, secops) if last else None,
        "previous": _entry(previous, secops) if previous else None,
        "email": (user.email or ""),
        "tips": tips,
        # kept so an older cached copy of the app still shows something sensible
        "total_logins": total, "failed_logins": failed, "unique_ips": places,
        "last_login": _iso(last.login_at) if last else "Never",
        "last_ip": (last.ip_address if last else "") or "N/A",
    }


@router.post("/signout-others")
async def signout_others(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """End this account's session everywhere else, but stay signed in here."""
    from auth import create_token, get_role, set_auth_cookie
    user = await get_current_user_from_cookie(request, db)
    user.token_version = (getattr(user, "token_version", 0) or 0) + 1
    await db.commit()
    await db.refresh(user)
    token = create_token(user.id, user.username, user.is_admin, user.token_version, get_role(user))
    set_auth_cookie(response, token, request)
    return {"ok": True}
