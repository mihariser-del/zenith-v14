"""The new Vault's data: /api/vault/*.

Every endpoint needs a staff session plus a live Vault unlock (X-Vault-Token,
see auth.require_vault). Money, AI spend, backups, releases and gifting plans
are Owner-only.
"""

import asyncio
import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_role, is_owner, is_trusted, require_vault
from database import (ActionLog, AdminNote, AiUsage, Chat, ClientSeen, ContentFlag, ErrorEvent, InviteToken,
                      LoginHistory, Message, Payment, Referral, UploadedFile, UsageLog, User, VaultAlert, get_db)

router = APIRouter(prefix="/api/vault", tags=["vault"])

RANGES = {"24h": (timedelta(hours=24), "hour"), "7d": (timedelta(days=7), "day"),
          "30d": (timedelta(days=30), "day"), "90d": (timedelta(days=90), "day")}
ONLINE_WINDOW = timedelta(minutes=5)


# ───────────────────────────────────────────────────────── helpers ──
def _utc(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _iso(dt):
    dt = _utc(dt)
    return dt.isoformat() if dt else None


def _range(r: str):
    span, step = RANGES.get(r or "30d", RANGES["30d"])
    now = datetime.now(timezone.utc)
    if step == "hour":
        end = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    else:
        end = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    start = end - span
    return start, end, step


def _buckets(start, end, step):
    out, cur = [], start
    d = timedelta(hours=1) if step == "hour" else timedelta(days=1)
    while cur < end:
        out.append(cur)
        cur += d
    return out


def _key(dt, step):
    dt = _utc(dt)
    return dt.replace(minute=0, second=0, microsecond=0) if step == "hour" else dt.replace(hour=0, minute=0, second=0, microsecond=0)


def _series(rows, start, end, step, value=lambda r: 1):
    """rows: iterable of (datetime, ...) → list of totals per bucket."""
    b = _buckets(start, end, step)
    idx = {k: i for i, k in enumerate(b)}
    out = [0.0] * len(b)
    for r in rows:
        k = _key(r[0], step)
        if k in idx:
            out[idx[k]] += value(r)
    return out


def _labels(start, end, step):
    return [_iso(x) for x in _buckets(start, end, step)]


def _need_owner(user):
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")


def _plan_of(u) -> str:
    tags = (u.tags or "").lower().split(",")
    if getattr(u, "is_ultimate", False):
        return "ultimate"
    if getattr(u, "is_pro", False) or (u.trial_end and _utc(u.trial_end) > datetime.now(timezone.utc)):
        return "pro"
    if "friend" in tags:
        return "friend"
    if (u.username or "").startswith("guest_"):
        return "guest"
    return "free"


def _paid_plan(u) -> bool:
    p = (u.pro_plan or "")
    return p in ("pro_monthly", "pro_annual", "pro_lifetime", "ultimate_monthly", "ultimate_annual", "ultimate_lifetime")


def _monthly_value(plan: str) -> float:
    try:
        from billing import PLANS
        p = PLANS.get(plan)
    except Exception:
        p = None
    if not p:
        return 0.0
    if p["interval"] == "month":
        return float(p["price"])
    if p["interval"] == "year":
        return float(p["price"]) / 12
    return 0.0



# ───────────────────────────────────────────────────── plan timing ──
_PERIOD_DAYS = {"month": 30, "year": 365}
_sub_cache: dict = {}


def _stripe_period(sub_id: str):
    """(end datetime, cancel_at_period_end) from Stripe, cached 10 min. None if unavailable."""
    hit = _sub_cache.get(sub_id)
    if hit and hit[0] > datetime.now(timezone.utc).timestamp():
        return hit[1]
    res = None
    try:
        from billing import STRIPE_SECRET
        if STRIPE_SECRET:
            import stripe
            stripe.api_key = STRIPE_SECRET
            sub = stripe.Subscription.retrieve(sub_id)
            end = sub.get("current_period_end")
            if not end:
                items = (sub.get("items") or {}).get("data") or []
                end = items[0].get("current_period_end") if items else None
            if sub.get("cancel_at"):
                end = sub.get("cancel_at")
            if end:
                res = (datetime.fromtimestamp(int(end), timezone.utc),
                       bool(sub.get("cancel_at_period_end") or sub.get("cancel_at")), sub.get("status") or "")
    except Exception as e:
        print(f"[vault] stripe period lookup failed: {e}")
    _sub_cache[sub_id] = (datetime.now(timezone.utc).timestamp() + 600, res)
    return res


async def _plan_info(db, u) -> dict:
    """What plan someone has and when it ends.
    kind: free | friend | trial | gift | renews | ends | forever"""
    now = datetime.now(timezone.utc)
    plan = _plan_of(u)
    pp = u.pro_plan or ""
    out = {"plan": plan, "pro_plan": pp, "kind": "free", "end": None, "start": None, "source": None, "price": None, "interval": None}
    try:
        from billing import PLANS
        meta = PLANS.get(pp)
    except Exception:
        meta = None
    if meta:
        out["price"], out["interval"] = meta.get("price"), meta.get("interval")
    trial_end = _utc(u.trial_end)
    if trial_end and trial_end > now and (pp in ("pro_trial", "gift_pro", "gift_ultimate_until", "invite_pro", "invite_ultimate", "referral_pro", "") or not u.is_pro):
        out.update(kind="gift" if pp.startswith("gift") else "trial", end=_iso(trial_end), source="invite" if "invite" in pp or "referral" in pp else "set")
    elif _paid_plan(u):
        last = (await db.execute(select(Payment).where(Payment.user_id == u.id, Payment.source == "stripe")
                                 .order_by(Payment.created_at.desc()))).scalars().first()
        if last:
            out["start"] = _iso(last.created_at)
        if pp.endswith("_lifetime"):
            out.update(kind="forever", source="plan")
        else:
            got = await asyncio.to_thread(_stripe_period, u.stripe_subscription_id) if u.stripe_subscription_id else None
            if got:
                out.update(kind="ends" if got[1] else "renews", end=_iso(got[0]), source="stripe")
            else:
                days = _PERIOD_DAYS.get((meta or {}).get("interval") or ("year" if "annual" in pp else "month"), 30)
                base = _utc(last.created_at) if last else None
                if base:
                    end = base + timedelta(days=days)
                    while end < now:
                        end += timedelta(days=days)
                    out.update(kind="renews", end=_iso(end), source="estimate")
                else:
                    out.update(kind="renews", source="unknown")
    elif pp.startswith("gift") and (u.is_pro or u.is_ultimate):
        out.update(kind="forever", source="gift")
    elif plan == "friend":
        out.update(kind="friend")
    elif plan in ("pro", "ultimate"):
        out.update(kind="forever", source="set")
    return out

def _user_brief(u, online_cut=None):
    online_cut = online_cut or (datetime.now(timezone.utc) - ONLINE_WINDOW)
    return {"id": u.id, "username": u.username, "display_name": getattr(u, "display_name", "") or "", "role": get_role(u),
            "tags": [t for t in (u.tags or "").split(",") if t], "plan": _plan_of(u), "pro_plan": u.pro_plan or "",
            "created_at": _iso(u.created_at), "last_seen": _iso(u.last_seen),
            "online": bool(u.last_seen and _utc(u.last_seen) >= online_cut),
            "banned": bool(u.is_banned), "deleted": bool(u.is_deleted), "guest": (u.username or "").startswith("guest_")}


async def _count(db, model, *where):
    q = select(func.count()).select_from(model)
    for w in where:
        q = q.where(w)
    return (await db.execute(q)).scalar() or 0


def _delta(cur, prev):
    return {"v": round(cur, 4) if isinstance(cur, float) else cur, "prev": round(prev, 4) if isinstance(prev, float) else prev,
            "pct": (None if not prev else round((cur - prev) / prev * 100, 1))}


async def _user_msgs(db, start, end):
    q = (select(Message.created_at, Chat.user_id).join(Chat, Chat.id == Message.chat_id)
         .where(Message.role == "user", Message.created_at >= start, Message.created_at < end))
    return (await db.execute(q)).all()


# ──────────────────────────────────────────────────────── overview ──
@router.get("/overview")
async def overview(range: str = "30d", user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    import perms as _perms; _perms.need(user, "view_stats")
    start, end, step = _range(range)
    span = end - start
    pstart = start - span
    now = datetime.now(timezone.utc)
    owner = is_owner(user)

    msgs = await _user_msgs(db, pstart, end)
    cur_m = [m for m in msgs if _utc(m[0]) >= start]
    prev_m = [m for m in msgs if _utc(m[0]) < start]
    signups = (await db.execute(select(User.created_at, User.username).where(User.created_at >= pstart))).all()
    reg = [s for s in signups if not (s[1] or "").startswith("guest_")]
    cur_s = [s for s in reg if _utc(s[0]) >= start]
    prev_s = [s for s in reg if _utc(s[0]) < start]
    chats = (await db.execute(select(Chat.created_at).where(Chat.created_at >= pstart))).all()

    active_series = []
    per = defaultdict(set)
    for t, uid in cur_m:
        per[_key(t, step)].add(uid)
    for b in _buckets(start, end, step):
        active_series.append(len(per.get(b, ())))

    out = {
        "range": range, "step": step, "labels": _labels(start, end, step),
        "kpis": {
            "users_total": await _count(db, User, ~User.username.like("guest_%"), User.is_deleted == False),  # noqa: E712
            "guests_total": await _count(db, User, User.username.like("guest_%")),
            "online": await _count(db, User, User.last_seen >= now - ONLINE_WINDOW),
            "new_users": _delta(len(cur_s), len(prev_s)),
            "active_users": _delta(len({m[1] for m in cur_m}), len({m[1] for m in prev_m})),
            "messages": _delta(len(cur_m), len(prev_m)),
            "chats": _delta(len([c for c in chats if _utc(c[0]) >= start]), len([c for c in chats if _utc(c[0]) < start])),
        },
        "series": {
            "messages": _series(cur_m, start, end, step),
            "signups": _series(cur_s, start, end, step),
            "active": active_series,
        },
    }
    # plan mix
    users = (await db.execute(select(User).where(User.is_deleted == False))).scalars().all()  # noqa: E712
    mix = Counter(_plan_of(u) for u in users)
    out["plans"] = dict(mix)
    # most used features
    feats = (await db.execute(select(UsageLog.action, func.count()).where(UsageLog.created_at >= start)
                              .group_by(UsageLog.action).order_by(func.count().desc()).limit(8))).all()
    out["features"] = [{"feature": f, "count": c} for f, c in feats]
    if owner:
        pays = (await db.execute(select(Payment.created_at, Payment.amount).where(Payment.created_at >= pstart, Payment.source == "stripe"))).all()
        out["kpis"]["revenue"] = _delta(round(sum(p[1] for p in pays if _utc(p[0]) >= start), 2),
                                        round(sum(p[1] for p in pays if _utc(p[0]) < start), 2))
        out["kpis"]["mrr"] = round(sum(_monthly_value(u.pro_plan or "") for u in users if _paid_plan(u)), 2)
        out["kpis"]["paying"] = sum(1 for u in users if _paid_plan(u))
        costs = (await db.execute(select(AiUsage.created_at, AiUsage.cost).where(AiUsage.created_at >= pstart))).all()
        out["kpis"]["ai_cost"] = _delta(round(sum(c[1] for c in costs if _utc(c[0]) >= start), 4),
                                        round(sum(c[1] for c in costs if _utc(c[0]) < start), 4))
        out["series"]["ai_cost"] = [round(x, 4) for x in _series([c for c in costs if _utc(c[0]) >= start], start, end, step, lambda r: r[1] or 0)]
        out["series"]["revenue"] = _series([p for p in pays if _utc(p[0]) >= start], start, end, step, lambda r: r[1] or 0)
    out["alerts"] = await _count(db, VaultAlert, VaultAlert.acknowledged == False)  # noqa: E712
    out["safety_open"] = await _count(db, ContentFlag, ContentFlag.status == "open")
    return out


# ─────────────────────────────────────────────── growth & revenue ──
@router.get("/growth")
async def growth(range: str = "30d", user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    import perms as _perms; _perms.need(user, "view_stats")
    start, end, step = _range(range)
    now = datetime.now(timezone.utc)
    rows = (await db.execute(select(User.created_at, User.username).where(User.created_at >= start))).all()
    reg = [r for r in rows if not (r[1] or "").startswith("guest_")]
    gst = [r for r in rows if (r[1] or "").startswith("guest_")]
    # active users: daily / weekly / monthly (people who sent a message)
    msgs = await _user_msgs(db, now - timedelta(days=30), now + timedelta(minutes=1))
    dau = len({m[1] for m in msgs if _utc(m[0]) >= now - timedelta(days=1)})
    wau = len({m[1] for m in msgs if _utc(m[0]) >= now - timedelta(days=7)})
    mau = len({m[1] for m in msgs})
    # retention: weekly sign-up cohorts, share who came back in each following week
    cohorts = []
    week0 = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    all_msgs = await _user_msgs(db, week0 - timedelta(weeks=9), now + timedelta(minutes=1))
    by_user = defaultdict(list)
    for t, uid in all_msgs:
        by_user[uid].append(_utc(t))
    for w in range_(8, 0, -1):
        ws, we = week0 - timedelta(weeks=w), week0 - timedelta(weeks=w - 1)
        ids = [r[0] for r in (await db.execute(select(User.id).where(User.created_at >= ws, User.created_at < we,
                                                                     ~User.username.like("guest_%")))).all()]
        row = {"week": _iso(ws), "size": len(ids), "weeks": []}
        for k in range_(1, w + 1):
            ks, ke = ws + timedelta(weeks=k), ws + timedelta(weeks=k + 1)
            if ks > now:
                break
            back = sum(1 for i in ids if any(ks <= t < ke for t in by_user.get(i, [])))
            row["weeks"].append(round(back / len(ids) * 100) if ids else None)
        cohorts.append(row)
    # invites
    tok_total = await _count(db, InviteToken, InviteToken.created_at >= start)
    tok_used = await _count(db, InviteToken, InviteToken.created_at >= start, InviteToken.used == True)  # noqa: E712
    refs = (await db.execute(select(Referral.created_at, Referral.rewarded).where(Referral.created_at >= start))).all()
    top_ref = (await db.execute(select(Referral.referrer_id, func.count()).group_by(Referral.referrer_id)
                                .order_by(func.count().desc()).limit(5))).all()
    names = {u.id: u.username for u in (await db.execute(select(User).where(User.id.in_([r[0] for r in top_ref] or [0])))).scalars()}
    out = {
        "range": range, "step": step, "labels": _labels(start, end, step),
        "series": {"signups": _series(reg, start, end, step), "guests": _series(gst, start, end, step),
                   "invites": _series(refs, start, end, step)},
        "active": {"dau": dau, "wau": wau, "mau": mau, "stickiness": round(dau / mau * 100) if mau else 0},
        "cohorts": cohorts,
        "invites": {"links": tok_total, "used": tok_used, "joined": len(refs), "rewarded": sum(1 for r in refs if r[1]),
                    "top": [{"username": names.get(r[0], "?"), "count": r[1]} for r in top_ref]},
    }
    if is_owner(user):
        pays = (await db.execute(select(Payment).where(Payment.created_at >= start).order_by(Payment.created_at.desc()))).scalars().all()
        users = (await db.execute(select(User).where(User.is_deleted == False))).scalars().all()  # noqa: E712
        paid = [u for u in users if _paid_plan(u)]
        out["revenue"] = {
            "total": round(sum(p.amount for p in pays if p.source == "stripe"), 2),
            "mrr": round(sum(_monthly_value(u.pro_plan or "") for u in paid), 2),
            "paying": len(paid),
            "by_plan": dict(Counter(u.pro_plan for u in paid)),
            "series": _series([(p.created_at, p.amount) for p in pays if p.source == "stripe"], start, end, step, lambda r: r[1] or 0),
            "upgrades": _series([(p.created_at,) for p in pays], start, end, step),
            "recent": [{"username": p.username, "plan": p.plan, "amount": p.amount, "currency": p.currency, "source": p.source,
                        "created_at": _iso(p.created_at)} for p in pays[:15]],
            "conversion": round(len(paid) / max(1, sum(1 for u in users if not (u.username or "").startswith("guest_"))) * 100, 1),
        }
    return out


def range_(a, b, step=1):
    return range(a, b, step)


# ─────────────────────────────────────────────────── AI spend ──
@router.get("/ai")
async def ai_costs(range: str = "30d", user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    _need_owner(user)
    import ai_meter
    start, end, step = _range(range)
    span = end - start
    rows = (await db.execute(select(AiUsage).where(AiUsage.created_at >= start - span))).scalars().all()
    cur = [r for r in rows if _utc(r.created_at) >= start]
    prev = [r for r in rows if _utc(r.created_at) < start]
    by_f, by_m, by_u = defaultdict(lambda: [0, 0.0]), defaultdict(lambda: [0, 0.0, 0, 0]), defaultdict(lambda: [0, 0.0])
    for r in cur:
        by_f[r.feature][0] += 1; by_f[r.feature][1] += r.cost or 0
        m = by_m[r.model]; m[0] += 1; m[1] += r.cost or 0; m[2] += r.in_tokens or 0; m[3] += r.out_tokens or 0
        if r.user_id:
            by_u[r.user_id][0] += 1; by_u[r.user_id][1] += r.cost or 0
    feats = sorted(by_f, key=lambda f: -by_f[f][1])
    stack = {f: [round(x, 4) for x in _series([(r.created_at, r.cost) for r in cur if r.feature == f], start, end, step, lambda x: x[1] or 0)]
             for f in feats[:6]}
    top_u = sorted(by_u.items(), key=lambda kv: -kv[1][1])[:10]
    names = {u.id: u.username for u in (await db.execute(select(User).where(User.id.in_([k for k, _ in top_u] or [0])))).scalars()}
    total = sum(r.cost or 0 for r in cur)
    days = max(1.0, span.total_seconds() / 86400)
    credits = await ai_meter.credits()
    per_day = total / days
    return {
        "range": range, "step": step, "labels": _labels(start, end, step),
        "credits": credits, "per_day": round(per_day, 4), "month_projection": round(per_day * 30, 2),
        "days_left": (round(credits["left"] / per_day, 1) if credits and per_day > 0 else None),
        "total": _delta(round(total, 4), round(sum(r.cost or 0 for r in prev), 4)),
        "calls": _delta(len(cur), len(prev)), "failures": sum(1 for r in cur if not r.ok),
        "tokens": {"in": sum(r.in_tokens or 0 for r in cur), "out": sum(r.out_tokens or 0 for r in cur)},
        "by_feature": [{"feature": f, "calls": by_f[f][0], "cost": round(by_f[f][1], 4)} for f in feats],
        "by_model": sorted([{"model": k, "calls": v[0], "cost": round(v[1], 4), "in": v[2], "out": v[3]} for k, v in by_m.items()],
                           key=lambda x: -x["cost"]),
        "top_users": [{"id": k, "username": names.get(k, "?"), "calls": v[0], "cost": round(v[1], 4)} for k, v in top_u],
        "stack": stack,
        "estimated": True,
    }


# ─────────────────────────────────────────────── live & alerts ──
@router.get("/live")
async def live(user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    import perms as _perms; _perms.need(user, "view_stats")
    now = datetime.now(timezone.utc)
    cut = now - ONLINE_WINDOW
    online = (await db.execute(select(User).where(User.last_seen >= cut).order_by(User.last_seen.desc()).limit(100))).scalars().all()
    plats = {}
    if online:
        for c in (await db.execute(select(ClientSeen).where(ClientSeen.user_id.in_([u.id for u in online])))).scalars():
            if c.user_id not in plats or _utc(c.last_seen) > _utc(plats[c.user_id].last_seen):
                plats[c.user_id] = c
    feed = []
    since = now - timedelta(hours=24)
    for u in (await db.execute(select(User).where(User.created_at >= since).order_by(User.created_at.desc()).limit(15))).scalars():
        feed.append({"t": _iso(u.created_at), "type": "signup" if not u.username.startswith("guest_") else "guest",
                     "text": f"{u.username} {'joined' if not u.username.startswith('guest_') else 'started as a guest'}", "user_id": u.id})
    q = (select(Message.created_at, Chat.title, User.username, User.id).join(Chat, Chat.id == Message.chat_id)
         .join(User, User.id == Chat.user_id).where(Message.role == "user", Message.created_at >= since)
         .order_by(Message.created_at.desc()).limit(25))
    for t, title, uname, uid in (await db.execute(q)).all():
        feed.append({"t": _iso(t), "type": "message", "text": f"{uname} sent a message in “{(title or 'a chat')[:40]}”", "user_id": uid})
    for lh, uname in (await db.execute(select(LoginHistory, User.username).join(User, User.id == LoginHistory.user_id)
                                        .where(LoginHistory.login_at >= since).order_by(LoginHistory.login_at.desc()).limit(10))).all():
        feed.append({"t": _iso(lh.login_at), "type": "login" if lh.success else "login_failed",
                     "text": f"{uname} {'logged in' if lh.success else 'failed to log in'}", "user_id": lh.user_id})
    if is_owner(user):
        for p in (await db.execute(select(Payment).where(Payment.created_at >= since).order_by(Payment.created_at.desc()).limit(10))).scalars():
            feed.append({"t": _iso(p.created_at), "type": "payment", "text": f"{p.username} → {p.plan} ({p.amount:.2f} {p.currency.upper()}, {p.source})", "user_id": p.user_id})
    for f in (await db.execute(select(ContentFlag).where(ContentFlag.created_at >= since).order_by(ContentFlag.created_at.desc()).limit(10))).scalars():
        feed.append({"t": _iso(f.created_at), "type": "flag", "text": f"Safety: {f.category.replace('_', ' ')} flagged", "user_id": f.user_id})
    feed.sort(key=lambda e: e["t"] or "", reverse=True)
    errors = (await db.execute(select(ErrorEvent).order_by(ErrorEvent.created_at.desc()).limit(40))).scalars().all()
    hour = now - timedelta(hours=1)
    err_series = _series([(e.created_at,) for e in (await db.execute(select(ErrorEvent).where(ErrorEvent.created_at >= now - timedelta(hours=24)))).scalars()],
                         *_range("24h"))
    return {
        "now": _iso(now),
        "online": [{**_user_brief(u, cut), "platform": plats[u.id].platform if u.id in plats else "web",
                    "version": plats[u.id].version if u.id in plats else ""} for u in online],
        "feed": feed[:60],
        "errors": [{"id": e.id, "kind": e.kind, "message": e.message[:400], "path": e.path, "t": _iso(e.created_at)} for e in errors],
        "errors_last_hour": sum(1 for e in errors if _utc(e.created_at) >= hour),
        "error_series": err_series, "error_labels": _labels(*_range("24h")),
        "messages_last_hour": len(await _user_msgs(db, hour, now + timedelta(minutes=1))),
    }


@router.get("/alerts")
async def alerts(all: bool = False, user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    q = select(VaultAlert).order_by(VaultAlert.created_at.desc()).limit(100)
    if not all:
        q = q.where(VaultAlert.acknowledged == False)  # noqa: E712
    rows = (await db.execute(q)).scalars().all()
    if not is_owner(user):
        rows = [r for r in rows if r.kind not in ("credit_low",)]
    return {"alerts": [{"id": a.id, "kind": a.kind, "level": a.level, "title": a.title, "detail": a.detail,
                        "acknowledged": a.acknowledged, "t": _iso(a.created_at)} for a in rows]}


@router.post("/alerts/{alert_id}/ack")
async def ack_alert(alert_id: int, user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    a = await db.get(VaultAlert, alert_id)
    if a:
        a.acknowledged = True
        await db.commit()
    return {"ok": True}


@router.post("/alerts/ack-all")
async def ack_all(user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    for a in (await db.execute(select(VaultAlert).where(VaultAlert.acknowledged == False))).scalars():  # noqa: E712
        a.acknowledged = True
    await db.commit()
    return {"ok": True}


@router.post("/alerts/check")
async def run_checks(user=Depends(require_vault)):
    from vault_jobs import check_alerts
    await check_alerts()
    return {"ok": True}


# ─────────────────────────────────────────────────────── users ──
@router.get("/users")
async def users(q: str = "", filter: str = "all", sort: str = "new", page: int = 1, per: int = 25,
                user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    import perms as _perms; _perms.need(user, "view_users")
    per = max(5, min(per, 100))
    now = datetime.now(timezone.utc)
    stmt = select(User)
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.username.ilike(like), User.email.ilike(like)))
    f = filter
    if f == "registered":
        stmt = stmt.where(~User.username.like("guest_%"), User.is_deleted == False)  # noqa: E712
    elif f == "guests":
        stmt = stmt.where(User.username.like("guest_%"))
    elif f == "paying":
        stmt = stmt.where(User.pro_plan.in_(["pro_monthly", "pro_annual", "pro_lifetime", "ultimate_monthly", "ultimate_annual", "ultimate_lifetime"]))
    elif f == "pro":
        stmt = stmt.where(or_(User.is_pro == True, User.trial_end > now))  # noqa: E712
    elif f == "friends":
        stmt = stmt.where(User.tags.like("%friend%"))
    elif f == "staff":
        stmt = stmt.where(User.role.in_(["admin", "owner"]))
    elif f == "banned":
        stmt = stmt.where(User.is_banned == True)  # noqa: E712
    elif f == "deleted":
        stmt = stmt.where(User.is_deleted == True)  # noqa: E712
    elif f == "online":
        stmt = stmt.where(User.last_seen >= now - ONLINE_WINDOW)
    elif f == "new":
        stmt = stmt.where(User.created_at >= now - timedelta(days=7), ~User.username.like("guest_%"))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    order = {"new": User.created_at.desc(), "old": User.created_at.asc(), "active": User.last_seen.desc(),
             "name": User.username.asc()}.get(sort, User.created_at.desc())
    rows = (await db.execute(stmt.order_by(order).offset((page - 1) * per).limit(per))).scalars().all()
    ids = [u.id for u in rows] or [0]
    since = now - timedelta(days=30)
    mc = dict((await db.execute(select(Chat.user_id, func.count()).join(Message, Message.chat_id == Chat.id)
                                .where(Chat.user_id.in_(ids), Message.role == "user", Message.created_at >= since)
                                .group_by(Chat.user_id))).all())
    out = []
    import perms as _perms0
    show_email = _perms0.can(user, "view_emails")
    for u in rows:
        d = _user_brief(u)
        d["messages_30d"] = mc.get(u.id, 0)
        if show_email:
            d["email"] = u.email
        out.append(d)
    return {"total": total, "page": page, "per": per, "users": out}


@router.get("/users/{user_id}")
async def user_360(user_id: int, user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    import perms as _perms; _perms.need(user, "view_users")
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    owner = is_owner(user)
    now = datetime.now(timezone.utc)
    d = _user_brief(u)
    import perms as _perms0
    if _perms0.can(user, "view_emails"):
        d["email"] = u.email
    d.update({"trial_end": _iso(u.trial_end), "ban_reason": u.ban_reason or "", "banned_by": u.banned_by or "",
              "is_chosen": bool(u.is_chosen), "stripe": bool(u.stripe_customer_id) if owner else None})
    d["plan_info"] = await _plan_info(db, u)
    if not owner:
        d["plan_info"]["price"] = None
    if get_role(u) == "admin":
        d["permissions"] = _perms0.switches(u)
    chats = (await db.execute(select(Chat).where(Chat.user_id == u.id).order_by(Chat.updated_at.desc()))).scalars().all()
    msgs = await _user_msgs(db, now - timedelta(days=30), now + timedelta(minutes=1))
    mine = [m for m in msgs if m[1] == u.id]
    start, end, step = _range("30d")
    total_msgs = (await db.execute(select(func.count()).select_from(Message).join(Chat, Chat.id == Message.chat_id)
                                   .where(Chat.user_id == u.id, Message.role == "user"))).scalar() or 0
    usage = (await db.execute(select(UsageLog.action, func.count()).where(UsageLog.user_id == u.id, UsageLog.created_at >= now - timedelta(days=30))
                              .group_by(UsageLog.action))).all()
    files = await _count(db, UploadedFile, UploadedFile.user_id == u.id)
    logins = (await db.execute(select(LoginHistory).where(LoginHistory.user_id == u.id).order_by(LoginHistory.login_at.desc()).limit(12))).scalars().all()
    apps = (await db.execute(select(ClientSeen).where(ClientSeen.user_id == u.id))).scalars().all()
    notes = (await db.execute(select(AdminNote).where(AdminNote.user_id == u.id).order_by(AdminNote.created_at.desc()))).scalars().all()
    flags = (await db.execute(select(ContentFlag).where(ContentFlag.user_id == u.id).order_by(ContentFlag.created_at.desc()).limit(10))).scalars().all()
    refs = (await db.execute(select(Referral).where(Referral.referrer_id == u.id).order_by(Referral.created_at.desc()))).scalars().all()
    invited_by = (await db.execute(select(Referral).where(Referral.referred_user_id == u.id))).scalars().first()
    inviter = await db.get(User, invited_by.referrer_id) if invited_by else None
    audit = (await db.execute(select(ActionLog).where(or_(ActionLog.target_id == u.id, ActionLog.actor_id == u.id))
                              .order_by(ActionLog.created_at.desc()).limit(15))).scalars().all() if hasattr(ActionLog, "target_id") else []
    out = {
        "user": d,
        "stats": {"chats": len(chats), "messages_total": total_msgs, "messages_30d": len(mine), "files": files,
                  "active_days_30d": len({_key(m[0], 'day') for m in mine}), "invited": len(refs)},
        "activity": {"labels": _labels(start, end, step), "messages": _series(mine, start, end, step)},
        "usage": [{"action": a, "count": c} for a, c in sorted(usage, key=lambda x: -x[1])],
        "chats": [{"id": c.id, "title": c.title, "updated_at": _iso(c.updated_at), "shared": bool(c.share_id), "folder": c.folder or ""} for c in chats[:12]],
        "logins": [{"t": _iso(l.login_at), "ip": l.ip_address if owner else "", "ua": (l.user_agent or "")[:120], "ok": l.success} for l in logins],
        "apps": [{"platform": a.platform, "version": a.version, "last_seen": _iso(a.last_seen)} for a in apps],
        "notes": [{"id": n.id, "author": n.author, "text": n.text, "t": _iso(n.created_at)} for n in notes],
        "flags": [{"id": f.id, "category": f.category, "status": f.status, "excerpt": f.excerpt[:200], "t": _iso(f.created_at)} for f in flags],
        "invites": [{"username": r.referred_username, "rewarded": r.rewarded, "t": _iso(r.created_at)} for r in refs[:10]],
        "invited_by": inviter.username if inviter else None,
        "audit": [{"action": a.action, "actor": getattr(a, "actor_username", ""), "detail": (a.detail or "")[:160], "t": _iso(a.created_at)} for a in audit],
    }
    if owner:
        pays = (await db.execute(select(Payment).where(Payment.user_id == u.id).order_by(Payment.created_at.desc()))).scalars().all()
        out["payments"] = [{"plan": p.plan, "amount": p.amount, "currency": p.currency, "source": p.source, "t": _iso(p.created_at)} for p in pays]
        cost = (await db.execute(select(func.sum(AiUsage.cost), func.count()).where(AiUsage.user_id == u.id, AiUsage.created_at >= now - timedelta(days=30)))).one()
        out["ai"] = {"cost_30d": round(cost[0] or 0, 4), "calls_30d": cost[1] or 0}
    return out


class NoteIn(BaseModel):
    text: str


@router.post("/users/{user_id}/notes")
async def add_note(user_id: int, req: NoteIn, user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    import perms as _perms; _perms.need(user, "user_notes")
    text = (req.text or "").strip()[:2000]
    if not text or not await db.get(User, user_id):
        raise HTTPException(status_code=400, detail="Write a note first")
    n = AdminNote(user_id=user_id, author=user.username, text=text)
    db.add(n)
    await db.commit()
    return {"ok": True, "id": n.id}


@router.delete("/users/{user_id}/notes/{note_id}")
async def del_note(user_id: int, note_id: int, user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    import perms as _perms; _perms.need(user, "user_notes")
    n = await db.get(AdminNote, note_id)
    if n and n.user_id == user_id and (n.author == user.username or is_owner(user)):
        await db.delete(n)
        await db.commit()
    return {"ok": True}


class GiftIn(BaseModel):
    plan: str            # pro | ultimate | none
    days: int = 0        # 0 = no end date


@router.post("/users/{user_id}/plan")
async def set_plan(user_id: int, req: GiftIn, request: Request, user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    """Owner: gift Pro/Ultimate (for N days or for good), or remove a plan."""
    _need_owner(user)
    u = await db.get(User, user_id)
    if not u or (u.username or "").startswith("guest_"):
        raise HTTPException(status_code=400, detail="Pick a registered user")
    now = datetime.now(timezone.utc)
    days = max(0, min(int(req.days or 0), 3650))
    if req.plan == "none":
        u.is_pro = False; u.is_ultimate = False; u.pro_plan = ""; u.trial_end = None
        detail = "removed plan"
    elif req.plan == "pro":
        if days:
            u.is_pro = False; u.is_ultimate = False; u.pro_plan = "gift_pro"; u.trial_end = now + timedelta(days=days)
        else:
            u.is_pro = True; u.is_ultimate = False; u.pro_plan = "gift_pro"; u.trial_end = None
        detail = f"gifted Pro {'for ' + str(days) + ' days' if days else 'with no end date'}"
    elif req.plan == "ultimate":
        u.is_pro = True; u.is_ultimate = True
        u.pro_plan = "gift_ultimate_until" if days else "gift_ultimate"
        u.trial_end = now + timedelta(days=days) if days else None
        detail = f"gifted Ultimate {'for ' + str(days) + ' days' if days else 'with no end date'}"
    else:
        raise HTTPException(status_code=400, detail="Unknown plan")
    if req.plan != "none":
        db.add(Payment(user_id=u.id, username=u.username, plan=u.pro_plan, amount=0.0, source="gift", note=detail))
        u.pending_notification = u.pending_notification or ""
    try:
        from audit import log_action
        await log_action(db=db, request=request, actor=user, action="plan_change", detail=f"{u.username}: {detail}")
    except Exception:
        pass
    await db.commit()
    return {"ok": True, "user": _user_brief(u), "detail": detail}


# ─────────────────────────────────────────────────────── people ──
@router.get("/people")
async def people(user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    import perms as _perms; _perms.need(user, "view_stats")
    us = (await db.execute(select(User).where(User.is_deleted == False))).scalars().all()  # noqa: E712
    owner = is_owner(user)
    last_pay = {}
    if owner:
        for p in (await db.execute(select(Payment).order_by(Payment.created_at.asc()))).scalars():
            last_pay[p.user_id] = p
    def row(u):
        d = _user_brief(u)
        p = last_pay.get(u.id)
        if owner and p:
            d["since"], d["paid"], d["source"], d["currency"] = _iso(p.created_at), p.amount, p.source, p.currency
        return d
    return {
        "friends": [row(u) for u in us if "friend" in (u.tags or "").lower().split(",")],
        "paying": [row(u) for u in us if _paid_plan(u)] if owner else [],
        "gifted": [row(u) for u in us if (u.pro_plan or "").startswith("gift")] if owner else [],
        "trial": [row(u) for u in us if not u.is_pro and u.trial_end and _utc(u.trial_end) > datetime.now(timezone.utc)
                  and not (u.pro_plan or "").startswith("gift")],
        "staff": [row(u) for u in us if get_role(u) in ("owner", "admin")],
        "chosen": [row(u) for u in us if u.is_chosen],
        "banned": [row(u) for u in us if u.is_banned],
    }


# ─────────────────────────────────────────────── content safety ──
@router.get("/safety")
async def safety(status: str = "open", user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    import perms as _perms; _perms.need(user, "safety_view")
    q = select(ContentFlag).order_by(ContentFlag.created_at.desc()).limit(200)
    if status != "all":
        q = q.where(ContentFlag.status == status)
    flags = (await db.execute(q)).scalars().all()
    names = {u.id: u.username for u in (await db.execute(select(User).where(User.id.in_([f.user_id for f in flags if f.user_id] or [0])))).scalars()}
    counts = dict((await db.execute(select(ContentFlag.status, func.count()).group_by(ContentFlag.status))).all())
    return {"counts": counts, "flags": [{
        "id": f.id, "kind": f.kind, "category": f.category, "user_id": f.user_id, "username": names.get(f.user_id, ""),
        "chat_id": f.chat_id, "message_id": f.message_id, "share_id": f.share_id, "excerpt": f.excerpt, "reason": f.reason,
        "status": f.status, "handled_by": f.handled_by, "t": _iso(f.created_at)} for f in flags]}


class SafetyAction(BaseModel):
    action: str          # dismiss | delete_message | unshare | ban | reopen
    reason: str = ""


@router.post("/safety/{flag_id}")
async def safety_action(flag_id: int, req: SafetyAction, request: Request, user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    import perms as _perms; _perms.need(user, "safety_act")
    f = await db.get(ContentFlag, flag_id)
    if not f:
        raise HTTPException(status_code=404, detail="Not found")
    a = req.action
    if a == "dismiss":
        f.status = "dismissed"
    elif a == "reopen":
        f.status = "open"
    elif a == "delete_message":
        if f.message_id:
            m = await db.get(Message, f.message_id)
            if m:
                await db.delete(m)
        f.status = "actioned"
    elif a == "unshare":
        c = await db.get(Chat, f.chat_id) if f.chat_id else None
        if c:
            c.share_id = None
            c.shared_at = None
        f.status = "actioned"
    elif a == "ban":
        u = await db.get(User, f.user_id) if f.user_id else None
        if not u or get_role(u) in ("owner", "admin"):
            raise HTTPException(status_code=400, detail="Can't ban this account here")
        u.is_banned = True
        u.ban_reason = (req.reason or f"Safety: {f.category}")[:500]
        u.banned_by = get_role(user)
        u.token_version = (u.token_version or 0) + 1
        f.status = "actioned"
    else:
        raise HTTPException(status_code=400, detail="Unknown action")
    f.handled_by = user.username
    try:
        from audit import log_action
        await log_action(db=db, request=request, actor=user, action=f"safety_{a}", detail=f"flag {f.id} ({f.category})")
    except Exception:
        pass
    await db.commit()
    return {"ok": True, "status": f.status}


# ───────────────────────────────────────────────────── releases ──
@router.get("/releases")
async def releases(user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    import perms as _perms; _perms.need(user, "manage_releases")
    from appdist import _android_info, _win_info
    since = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (await db.execute(select(ClientSeen).where(ClientSeen.last_seen >= since))).scalars().all()
    by = defaultdict(Counter)
    for r in rows:
        by[r.platform][r.version or "—"] += 1
    return {"latest": {"windows": _win_info(), "android": _android_info()},
            "usage": {k: dict(v) for k, v in by.items()},
            "users": {k: sum(v.values()) for k, v in by.items()}}


@router.post("/releases/upload")
async def release_upload(request: Request, platform: str, name: str, user=Depends(require_vault)):
    """Owner: upload a new app build straight from the Vault."""
    _need_owner(user)
    from appdist import ALLOWED, MAX_BYTES, _dir
    import hashlib
    if platform not in ALLOWED or name not in ALLOWED[platform]:
        raise HTTPException(status_code=400, detail="Unknown file — upload Zelpophai-Setup.exe, its .blockmap and latest.yml (Windows) or Zelpophai.apk and android.json (Android)")
    folder = _dir() / platform
    folder.mkdir(parents=True, exist_ok=True)
    tmp = folder / (name + ".part")
    size, h = 0, hashlib.sha256()
    with open(tmp, "wb") as fh:
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_BYTES:
                fh.close(); tmp.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Too big")
            h.update(chunk)
            fh.write(chunk)
    if not size:
        tmp.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Empty file")
    os.replace(tmp, folder / name)
    return {"ok": True, "name": name, "size": size, "sha256": h.hexdigest()}


# ────────────────────────────────────────────────────── backups ──
@router.get("/backups")
async def backups(user=Depends(require_vault)):
    _need_owner(user)
    from vault_jobs import db_path, list_backups, KEEP_BACKUPS
    p = db_path()
    return {"backups": list_backups(), "db_size": p.stat().st_size if p else None, "keep": KEEP_BACKUPS}


@router.post("/backups")
async def backup_now(request: Request, user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    _need_owner(user)
    from vault_jobs import make_backup
    try:
        info = await asyncio.to_thread(make_backup, "manual")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup failed: {e}")
    try:
        from audit import log_action
        await log_action(db=db, request=request, actor=user, action="backup", detail=info["name"])
        await db.commit()
    except Exception:
        pass
    return info


@router.get("/backups/{name}")
async def backup_download(name: str, user=Depends(require_vault)):
    _need_owner(user)
    from vault_jobs import safe_backup_file
    try:
        f = safe_backup_file(name)
    except Exception:
        raise HTTPException(status_code=404, detail="Backup not found")
    return FileResponse(f, media_type="application/octet-stream", filename=f.name)


class RestoreIn(BaseModel):
    confirm: str
    pin: str


@router.post("/backups/{name}/restore")
async def backup_restore(name: str, req: RestoreIn, request: Request, user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    """Owner: restore a backup. Needs the word RESTORE and the Vault PIN; the app
    saves a copy of the current database, swaps in the backup and restarts."""
    _need_owner(user)
    from auth import verify_password
    if (req.confirm or "").strip() != "RESTORE" or not user.pin_hash or not verify_password(req.pin or "", user.pin_hash):
        raise HTTPException(status_code=400, detail="Type RESTORE and your Vault PIN to confirm")
    from vault_jobs import schedule_restore
    try:
        schedule_restore(name)
    except Exception:
        raise HTTPException(status_code=404, detail="Backup not found")
    try:
        from audit import log_action
        await log_action(db=db, request=request, actor=user, action="restore", detail=name)
        await db.commit()
    except Exception:
        pass
    asyncio.get_running_loop().call_later(1.5, os._exit, 3)   # Railway restarts the app
    return {"ok": True, "message": "Restoring — Zelpophai will be back in about a minute."}


# ─────────────────────────────────────────────────────── search ──
@router.get("/search")
async def search(q: str = "", user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    import perms as _perms; _perms.need(user, "view_users")
    q = q.strip()
    if len(q) < 2:
        return {"users": []}
    like = f"%{q}%"
    rows = (await db.execute(select(User).where(or_(User.username.ilike(like), User.email.ilike(like)))
                             .order_by(User.last_seen.desc()).limit(8))).scalars().all()
    return {"users": [_user_brief(u) for u in rows]}


# ───────────────────────────────────────────── staff & security ──
@router.get("/staff")
async def staff(user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    """Owner: staff with their permissions, and the chosen helpers."""
    _need_owner(user)
    us = (await db.execute(select(User).where(User.is_deleted == False, or_(User.role.in_(("admin", "owner")), User.is_chosen == True))  # noqa: E712
                           .order_by(User.created_at.asc()))).scalars().all()
    import perms as _p
    out = []
    for u in us:
        d = _user_brief(u)
        d["is_chosen"] = bool(u.is_chosen)
        if get_role(u) == "admin":
            info = _p.describe(u)
            d["permissions"] = info["permissions"]
            d["perm"] = {k: info[k] for k in ("on", "total", "limits", "until", "note", "preset", "trusted")}
        out.append(d)
    return {"staff": [d for d in out if d["role"] in ("owner", "admin")], "chosen": [d for d in out if d["is_chosen"]]}


@router.get("/security")
async def security(user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    """Sign-in health for the last 24 hours, lock state and server load."""
    now = datetime.now(timezone.utc)
    day = now - timedelta(hours=24)
    owner = is_owner(user)
    rows = (await db.execute(select(LoginHistory, User.username).join(User, User.id == LoginHistory.user_id)
                             .where(LoginHistory.login_at >= now - timedelta(days=7))
                             .order_by(LoginHistory.login_at.desc()).limit(2000))).all()
    last24 = [(l, n) for l, n in rows if _utc(l.login_at) >= day]
    failed = [(l, n) for l, n in last24 if not l.success]
    by_user = Counter(n for _, n in failed)
    by_ip = Counter(l.ip_address for l, _ in failed if l.ip_address)
    start, end, step = _range("7d")
    series_ok = _series([(l.login_at,) for l, _ in rows if l.success], start, end, step)
    series_bad = _series([(l.login_at,) for l, _ in rows if not l.success], start, end, step)
    try:
        from global_controls import _get_setting
        locked = await _get_setting(db, "locked", "off")
        maint = await _get_setting(db, "maintenance_mode", "off")
    except Exception:
        locked = maint = "off"
    server = None
    try:
        import psutil
        vm = psutil.virtual_memory()
        try:
            disk = psutil.disk_usage("/data")
        except Exception:
            disk = psutil.disk_usage("/")
        proc = psutil.Process()
        server = {"cpu": psutil.cpu_percent(interval=0.2), "ram": vm.percent, "ram_used_gb": round(vm.used / 1024 ** 3, 2),
                  "ram_total_gb": round(vm.total / 1024 ** 3, 2), "disk": disk.percent,
                  "disk_free_gb": round(disk.free / 1024 ** 3, 2), "app_ram_mb": round(proc.memory_info().rss / 1024 ** 2),
                  "uptime_s": int(now.timestamp() - proc.create_time())}
    except Exception:
        pass
    return {
        "logins_24h": len(last24) - len(failed), "failed_24h": len(failed),
        "unique_ips_24h": len({l.ip_address for l, _ in last24 if l.ip_address}),
        "top_failed_users": [{"username": n, "count": c} for n, c in by_user.most_common(6)],
        "top_failed_ips": [{"ip": ip if owner else "hidden", "count": c} for ip, c in by_ip.most_common(6)],
        "labels": _labels(start, end, step), "ok_series": series_ok, "failed_series": series_bad,
        "recent": [{"username": n, "user_id": l.user_id, "ok": bool(l.success), "ip": l.ip_address if owner else "",
                    "ua": (l.user_agent or "")[:100], "t": _iso(l.login_at)} for l, n in rows[:40]],
        "locked": locked, "maintenance": maint, "server": server,
    }


# ───────────────────────────────────────── email + paid plans ──
@router.get("/email")
async def email_overview(user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    """Is email sending set up, and how many accounts have a real email."""
    import emailcheck
    from billing import BILLING_LIVE
    from database import PlanInterest
    us = (await db.execute(select(User).where(User.is_deleted == False))).scalars().all()  # noqa: E712
    real = [u for u in us if not (u.username or "").startswith("guest_")]
    verified = sum(1 for u in real if (u.email_status or "") == "verified")
    checked = sum(1 for u in real if (u.email_status or "") == "checked")
    missing = [u for u in real if (u.email_status or "") not in ("verified", "checked")]
    waiting = (await db.execute(select(PlanInterest).order_by(PlanInterest.created_at.desc()))).scalars().all()
    return {"configured": emailcheck.mail_configured(), "sender": emailcheck.mail_sender() if is_owner(user) else "",
            "provider": "Brevo" if os.getenv("BREVO_API_KEY", "").strip() else ("SMTP" if os.getenv("SMTP_HOST", "").strip() else ""),
            "accounts": len(real), "verified": verified, "checked": checked, "missing": len(missing),
            "missing_users": [{"id": u.id, "username": u.username} for u in missing[:30]],
            "grace_days": emailcheck.EMAIL_GRACE_DAYS,
            "google_signin": (await _sys_setting(db, "google_signin", "off")) == "on",
            "site_origin": os.getenv("APP_BASE_URL", "https://zelpophai.up.railway.app").rstrip("/"),
            "billing_live": BILLING_LIVE, "plan_interest": len(waiting),
            "plan_interest_users": [{"id": w.user_id, "username": w.username, "plan": w.plan, "t": _iso(w.created_at)} for w in waiting[:30]]}


class TestMailIn(BaseModel):
    to: str


@router.post("/email/test")
async def email_test(req: TestMailIn, user=Depends(require_vault)):
    _need_owner(user)
    import emailcheck
    ok, why = await emailcheck.check_email(req.to)
    if not ok:
        raise HTTPException(status_code=400, detail=why)
    if not emailcheck.mail_configured():
        raise HTTPException(status_code=400, detail="Email sending isn't set up yet — add BREVO_API_KEY and SMTP_FROM on Railway first.")
    sent, why = await emailcheck.send_mail(emailcheck.normalize(req.to), "Zelpophai test email",
                                           "This is a test email from your Zelpophai Vault.\n\nIf you can read this, email sending works: "
                                           "new accounts will get a confirmation code and password resets will arrive.\n\n— Zelpophai AI")
    if not sent:
        raise HTTPException(status_code=502, detail=f"The email could not be sent. {why}")
    return {"ok": True}


async def _sys_setting(db, key, default="off"):
    from global_controls import _get_setting
    return await _get_setting(db, key, default)


class GoogleIn(BaseModel):
    on: bool


@router.post("/google-signin")
async def google_signin_toggle(req: GoogleIn, request: Request, user=Depends(require_vault), db: AsyncSession = Depends(get_db)):
    """Owner: show or hide the 'Sign in with Google' buttons."""
    _need_owner(user)
    from global_controls import _set_setting
    await _set_setting(db, "google_signin", "on" if req.on else "off")
    try:
        from audit import log_action
        await log_action(db=db, request=request, actor=user, action="google_signin", detail=f"Google sign-in button {'shown' if req.on else 'hidden'}")
    except Exception:
        pass
    return {"google_signin": req.on}
