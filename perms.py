"""Admin permissions, in detail.

The Owner can always do everything. A normal user can do nothing here. For an admin, each ability in
CATALOG is a switch the Owner sets (Vault -> Staff & permissions). On top of the switches the Owner can
set daily limits (how many bans / password resets / deletions per day), an end date for the admin role,
and a private note. A "Trusted admin" has every switch on and no limits, as before.

Stored in users.permissions as JSON:  {"ban_users": true, ..., "_": {"limits": {...}, "until": iso, "note": str, "preset": str}}
"""

import json
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select

# (key, label, what it means, on by default, sensitive)
CATALOG = [
    ("People", "Looking after accounts", [
        ("view_users", "See the people list and profiles", "Open Users and anyone's profile page.", True, False),
        ("view_emails", "See email addresses", "Shows people's email on their profile and in the list.", False, True),
        ("user_notes", "Write staff notes on a profile", "Private notes other staff can read.", True, False),
        ("ban_users", "Ban people", "Stop an account from using Zelpophai.", True, False),
        ("unban_users", "Unban people", "Let a banned account back in.", True, False),
        ("reset_password", "Reset passwords", "Give someone a new password.", True, True),
        ("delete_users", "Delete accounts", "Remove an account. This is hard to undo.", True, True),
    ]),
    ("Conversations", "Reading what people wrote", [
        ("manage_chats", "See the list of someone's chats", "Chat titles and counts, without opening them.", True, False),
        ("view_messages", "Open and read chats", "Read the full conversation, including files and pictures.", True, True),
        ("export_data", "Download data", "Export users, chats and messages as files.", False, True),
    ]),
    ("Feedback", "Messages from people to the team", [
        ("feedback_view", "Read feedback and requests", "Open the Feedback inbox.", True, False),
        ("feedback_reply", "Reply to feedback", "Answer people in the feedback thread.", True, False),
        ("feedback_manage", "Manage feedback and the Ideas board", "Change status, publish or hide ideas, delete feedback.", True, False),
    ]),
    ("Safety", "Flagged content and reports", [
        ("safety_view", "See flagged messages and reports", "Open Content safety.", True, False),
        ("safety_act", "Act on flagged items", "Mark as fine, remove, or take action on a report.", True, False),
    ]),
    ("Talking to everyone", "Messages that reach many people", [
        ("broadcast", "Send broadcasts", "Pop-up messages to everyone or a group.", True, True),
        ("team_chat", "Use team chat", "Read and write in the staff chat.", True, False),
    ]),
    ("Numbers and history", "What is happening on Zelpophai", [
        ("view_stats", "See stats", "Overview, Growth, Live monitor and Friends & customers.", True, False),
        ("view_logs", "See the activity log", "Who did what, including other staff.", True, False),
        ("manage_releases", "See app releases", "The App releases page.", True, False),
    ]),
    ("Site controls", "Switches that affect everybody", [
        ("global_controls", "Use site controls", "Maintenance, sign-ups, messaging and AI on or off. Emergency tools stay with the Owner.", False, True),
    ]),
]

KEYS = {k for _, _, items in CATALOG for k, *_ in items}
DEFAULTS = {k: d for _, _, items in CATALOG for k, _l, _w, d, _s in items}
LABELS = {k: l for _, _, items in CATALOG for k, l, *_ in items}
LIMIT_KEYS = {"bans": ("ban_users", ("ban",), "bans"), "resets": ("reset_password", ("reset_password",), "password resets"),
              "deletes": ("delete_users", ("delete_user", "bulk_delete"), "deletions"), "broadcasts": ("broadcast", ("broadcast",), "broadcasts")}

_all = lambda v: {k: v for k in KEYS}  # noqa: E731
PRESETS = {
    "full": ("Full admin", "Everything an admin can do, except site controls and emails.", {**_all(True), "global_controls": False, "view_emails": False}),
    "moderator": ("Moderator", "Keeps people safe: bans, flagged content and reading chats. No deleting, no passwords.",
                  {**_all(False), "view_users": True, "user_notes": True, "ban_users": True, "unban_users": True, "manage_chats": True,
                   "view_messages": True, "safety_view": True, "safety_act": True, "team_chat": True, "feedback_view": True}),
    "support": ("Support", "Helps people: feedback, password resets and profiles. Can't ban, delete or read chats.",
                {**_all(False), "view_users": True, "user_notes": True, "reset_password": True, "feedback_view": True, "feedback_reply": True,
                 "feedback_manage": True, "team_chat": True}),
    "viewer": ("Read-only", "Can look at stats, people and feedback but can't change anything.",
               {**_all(False), "view_users": True, "feedback_view": True, "safety_view": True, "view_stats": True, "team_chat": True}),
}


def _raw(user) -> dict:
    try:
        d = json.loads(user.permissions) if getattr(user, "permissions", "") else {}
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _role(user):
    from auth import get_role
    return get_role(user)


def _trusted(user) -> bool:
    from auth import is_trusted
    return bool(is_trusted(user))


def extras(user) -> dict:
    x = _raw(user).get("_")
    x = x if isinstance(x, dict) else {}
    lim = x.get("limits") if isinstance(x.get("limits"), dict) else {}
    return {"limits": {k: max(0, int(lim.get(k) or 0)) for k in LIMIT_KEYS}, "until": x.get("until") or None,
            "note": str(x.get("note") or "")[:500], "preset": str(x.get("preset") or "")}


def switches(user) -> dict:
    """The stored switches for an admin, with defaults filled in (ignores owner / trusted)."""
    raw = _raw(user)
    return {k: bool(raw[k]) if k in raw else DEFAULTS[k] for k in KEYS}


def effective(user) -> dict:
    """What this person can actually do right now."""
    role = _role(user)
    if role == "owner":
        return {k: True for k in KEYS}
    if role != "admin":
        return {k: False for k in KEYS}
    if _trusted(user):
        return {k: True for k in KEYS}
    return switches(user)


def can(user, key: str) -> bool:
    return bool(effective(user).get(key, False))


def need(user, key: str):
    """Raise a friendly 403 unless the person has this ability."""
    if _role(user) not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    if not can(user, key):
        raise HTTPException(status_code=403, detail=f"You're not allowed to do this ({LABELS.get(key, key).lower()}). Ask the Owner to switch it on for you.",
                            headers={"X-Permission": key})


async def used_today(db, user) -> dict:
    """How many limited actions this admin has done since midnight UTC."""
    from database import ActionLog
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    out = {}
    for name, (_perm, actions, _label) in LIMIT_KEYS.items():
        out[name] = (await db.execute(select(func.count()).select_from(ActionLog)
                                      .where(ActionLog.actor_id == user.id, ActionLog.action.in_(actions), ActionLog.created_at >= start))).scalar() or 0
    # one "bulk_delete" line can cover many accounts
    import re
    for (detail,) in (await db.execute(select(ActionLog.detail).where(ActionLog.actor_id == user.id, ActionLog.action == "bulk_delete",
                                                                      ActionLog.created_at >= start))).all():
        m = re.match(r"Deleted (\d+) user", detail or "")
        if m:
            out["deletes"] += max(0, int(m.group(1)) - 1)
    return out


async def need_quota(db, user, name: str, amount: int = 1):
    """Daily limit set by the Owner (0 = no limit). Owner and trusted admins have none."""
    if _role(user) != "admin" or _trusted(user):
        return
    cap = extras(user)["limits"].get(name, 0)
    if not cap:
        return
    used = (await used_today(db, user)).get(name, 0)
    if used + amount > cap:
        label = LIMIT_KEYS[name][2]
        raise HTTPException(status_code=429, detail=f"You've reached your limit of {cap} {label} for today. It resets at midnight (UTC), or ask the Owner to raise it.")


def clean(body: dict, previous: dict | None = None) -> dict:
    """Validate what the Owner sent and return the JSON to store."""
    perms = body.get("permissions") if isinstance(body.get("permissions"), dict) else {}
    prev = previous or {}
    out = {k: bool(perms[k]) if k in perms else (bool(prev[k]) if k in prev else DEFAULTS[k]) for k in KEYS}
    px = prev.get("_") if isinstance(prev.get("_"), dict) else {}
    x = {"limits": dict(px.get("limits") or {}), "until": px.get("until"), "note": px.get("note", ""), "preset": ""}
    if isinstance(body.get("limits"), dict):
        x["limits"] = {}
        for k in LIMIT_KEYS:
            try:
                x["limits"][k] = max(0, min(100000, int(body["limits"].get(k) or 0)))
            except Exception:
                x["limits"][k] = 0
    if "until" in body:
        x["until"] = None
        if body["until"]:
            try:
                dt = datetime.fromisoformat(str(body["until"]).replace("Z", "+00:00"))
                dt = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
                if dt <= datetime.now(timezone.utc):
                    raise HTTPException(status_code=400, detail="The end date must be in the future.")
                x["until"] = dt.astimezone(timezone.utc).isoformat()
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(status_code=400, detail="That end date isn't valid.")
    if "note" in body:
        x["note"] = str(body.get("note") or "").strip()[:500]
    for name, (_label, _desc, values) in PRESETS.items():
        if all(out[k] == values[k] for k in KEYS):
            x["preset"] = name
    out["_"] = x
    return out


def describe(user) -> dict:
    """Everything the editor needs about one admin."""
    sw = switches(user)
    return {"permissions": sw, **extras(user), "trusted": _trusted(user), "on": sum(1 for v in sw.values() if v), "total": len(KEYS)}


def catalog() -> dict:
    return {"groups": [{"name": g, "about": a, "items": [{"key": k, "label": l, "about": w, "default": d, "sensitive": s} for k, l, w, d, s in items]}
                       for g, a, items in CATALOG],
            "presets": [{"id": i, "label": l, "about": a, "permissions": v} for i, (l, a, v) in PRESETS.items()],
            "limits": [{"key": k, "label": v[2], "needs": v[0]} for k, v in LIMIT_KEYS.items()]}


async def expire_admins() -> int:
    """Admin roles with an end date: when it passes, the person goes back to a normal account."""
    from database import User, async_session
    n = 0
    async with async_session() as db:
        admins = (await db.execute(select(User).where(User.role == "admin", User.permissions.like('%"until"%')))).scalars().all()
        now = datetime.now(timezone.utc)
        for u in admins:
            until = extras(u)["until"]
            if not until:
                continue
            try:
                if datetime.fromisoformat(until) > now:
                    continue
            except Exception:
                continue
            u.role, u.is_admin = "user", False
            raw = _raw(u)
            raw.get("_", {})["until"] = None
            u.permissions = json.dumps(raw)
            u.pending_notification = "demoted"
            u.token_version = (u.token_version or 0)
            n += 1
            try:
                from audit import log_action
                await db.commit()
                await log_action(db=db, actor=None, action="role_change", target_id=u.id, target_username=u.username,
                                 detail="Admin role ended automatically (end date set by the Owner)")
            except Exception:
                pass
        await db.commit()
    return n
