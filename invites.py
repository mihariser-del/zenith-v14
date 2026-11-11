"""Invite friends: a ladder of rewards, a friends list, a monthly leaderboard and link stats.

An invite "counts" once the friend is a real, active person: they have a valid email and have
sent a few messages. Rewards are added automatically at each step of the ladder, and the friend
gets a welcome gift too. Links stay single-use (a new one appears after each friend joins).
"""

import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import Chat, InviteToken, Message, Referral, User, async_session, get_db

router = APIRouter(prefix="/api/invite", tags=["invite"])

# (friends who count, plan, days)
LADDER = [(1, "pro", 3), (3, "pro", 7), (5, "pro", 14), (10, "pro", 30), (25, "ultimate", 30)]
FRIEND_GIFT_DAYS = 3
ACTIVE_MESSAGES = 3


def _now():
    return datetime.now(timezone.utc)


def _utc(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _mask(name: str) -> str:
    name = name or "friend"
    if len(name) <= 2:
        return name[0] + "•"
    return name[:2] + "•" * min(4, len(name) - 2)


def _label(plan: str, days: int) -> str:
    span = "1 month" if days == 30 else ("2 weeks" if days == 14 else ("1 week" if days == 7 else f"{days} days"))
    return f"{span} of {'Ultimate' if plan == 'ultimate' else 'Pro'}"


def _has_lasting_plan(u) -> bool:
    """A plan with no end date (bought, lifetime, or gifted for good) — rewards never replace it."""
    from limits import TIMED_PLANS
    pp = u.pro_plan or ""
    return bool((u.is_pro or u.is_ultimate) and pp not in TIMED_PLANS and pp != "gift_pro") or (pp == "gift_pro" and u.is_pro)


def grant_days(u, plan: str, days: int) -> None:
    """Add reward time. Extends a running trial/reward; never touches a lasting plan."""
    if _has_lasting_plan(u):
        return
    now = _now()
    end = _utc(u.trial_end)
    base = end if (end and end > now) else now
    u.trial_end = base + timedelta(days=days)
    if plan == "ultimate":
        u.is_pro, u.is_ultimate, u.pro_plan = True, True, "invite_ultimate"
    elif (u.pro_plan or "") not in ("invite_ultimate", "gift_ultimate_until") or not (end and end > now):
        u.is_pro, u.is_ultimate, u.pro_plan = True, False, "invite_pro"


async def settle(db: AsyncSession, referrer_id: int) -> list:
    """Hand out any ladder rewards this person has reached. Returns the new reward labels."""
    u = await db.get(User, referrer_id)
    if not u or u.is_deleted or (u.username or "").startswith("guest_"):
        return []
    counted = (await db.execute(select(func.count()).select_from(Referral)
                                .where(Referral.referrer_id == u.id, Referral.counted == True))).scalar() or 0  # noqa: E712
    done = {int(x) for x in (u.invite_rewards or "").split(",") if x.strip().isdigit()}
    new = []
    for need, plan, days in LADDER:
        if counted >= need and need not in done:
            grant_days(u, plan, days)
            done.add(need)
            new.append(_label(plan, days))
    if new:
        u.invite_rewards = ",".join(str(x) for x in sorted(done))
        u.pending_notification = u.pending_notification or ""
        await db.commit()
    return new


async def friend_progress(user_id: int) -> None:
    """Called after someone sends a message: if they were invited and are now active, the invite counts."""
    try:
        async with async_session() as db:
            ref = (await db.execute(select(Referral).where(Referral.referred_user_id == user_id, Referral.counted == False))).scalars().first()  # noqa: E712
            if not ref:
                return
            friend = await db.get(User, user_id)
            if not friend or friend.is_deleted or friend.is_banned:
                return
            import emailcheck
            if not emailcheck.has_good_email(friend):
                return
            msgs = (await db.execute(select(func.count()).select_from(Message).join(Chat, Chat.id == Message.chat_id)
                                     .where(Chat.user_id == user_id, Message.role == "user"))).scalar() or 0
            if msgs < ACTIVE_MESSAGES:
                return
            ref.counted = True
            ref.counted_at = _now()
            ref.rewarded = True
            grant_days(friend, "pro", FRIEND_GIFT_DAYS)        # the friend's welcome gift
            await db.commit()
            await settle(db, ref.referrer_id)
    except Exception as e:
        print(f"[invite] progress check failed: {e}")


async def migrate_once():
    """Invites from before the ladder all count (their friends already joined)."""
    try:
        from global_controls import _get_setting, _set_setting
        async with async_session() as db:
            if (await _get_setting(db, "invite_v2", "off")) == "on":
                return
            rows = (await db.execute(select(Referral))).scalars().all()
            owners = set()
            for r in rows:
                if r.referred_user_id and not r.counted:
                    r.counted, r.counted_at = True, _utc(r.created_at) or _now()
                    owners.add(r.referrer_id)
            await db.commit()
            for rid in owners:
                await settle(db, rid)
            await _set_setting(db, "invite_v2", "on")
    except Exception as e:
        print(f"[invite] migration failed: {e}")


@router.get("/overview")
async def overview(request: Request, db: AsyncSession = Depends(get_db)):
    from auth import get_current_user_from_cookie
    user = await get_current_user_from_cookie(request, db)
    if user.username.startswith("guest_"):
        raise HTTPException(status_code=403, detail="Create an account to invite friends.")
    await settle(db, user.id)
    await db.refresh(user)
    tok = (await db.execute(select(InviteToken).where(InviteToken.referrer_id == user.id, InviteToken.used == False))).scalars().first()  # noqa: E712
    if not tok:
        import secrets
        tok = InviteToken(token=secrets.token_urlsafe(32), referrer_id=user.id)
        db.add(tok)
        await db.commit()
        await db.refresh(tok)
    base = (os.getenv("FRONTEND_URL", "") or os.getenv("APP_BASE_URL", "")).strip().rstrip("/") or str(request.base_url).rstrip("/")
    refs = (await db.execute(select(Referral).where(Referral.referrer_id == user.id).order_by(Referral.created_at.desc()))).scalars().all()
    counted = sum(1 for r in refs if r.counted)
    clicks = (await db.execute(select(func.coalesce(func.sum(InviteToken.clicks), 0)).where(InviteToken.referrer_id == user.id))).scalar() or 0
    done = {int(x) for x in (user.invite_rewards or "").split(",") if x.strip().isdigit()}
    ladder = [{"need": need, "reward": _label(plan, days), "plan": plan, "days": days, "done": need in done,
               "reached": counted >= need} for need, plan, days in LADDER]
    nxt = next((s for s in ladder if not s["reached"]), None)
    friends = []
    for r in refs[:50]:
        f = await db.get(User, r.referred_user_id) if r.referred_user_id else None
        if r.counted:
            status, hint = "active", "Counts towards your rewards"
        elif not f or f.is_deleted:
            status, hint = "gone", "Account was deleted"
        else:
            import emailcheck
            status, hint = "waiting", ("Needs to confirm their email" if not emailcheck.has_good_email(f)
                                       else f"Needs to send {ACTIVE_MESSAGES} messages to count")
        friends.append({"name": r.referred_username, "status": status, "hint": hint, "joined_at": (_utc(r.created_at) or _now()).isoformat()})
    # leaderboard: this month, by friends who count
    month = _now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    top = (await db.execute(select(Referral.referrer_id, func.count()).where(Referral.counted == True, Referral.counted_at >= month)  # noqa: E712
                            .group_by(Referral.referrer_id).order_by(func.count().desc()).limit(10))).all()
    board, my_rank = [], None
    for i, (rid, n) in enumerate(top):
        ru = await db.get(User, rid)
        if not ru or ru.is_deleted:
            continue
        me = rid == user.id
        if me:
            my_rank = len(board) + 1
        board.append({"name": ru.username if me else _mask(ru.username), "count": n, "me": me})
    end = _utc(user.trial_end)
    return {"link": f"{base}/i/{tok.token}", "clicks": int(clicks), "joined": len(refs), "active": counted,
            "waiting": sum(1 for f in friends if f["status"] == "waiting"),
            "ladder": ladder, "next": ({"need": nxt["need"], "left": nxt["need"] - counted, "reward": nxt["reward"]} if nxt else None),
            "friends": friends, "leaderboard": board, "my_rank": my_rank, "month": month.strftime("%B"),
            "friend_gift": _label("pro", FRIEND_GIFT_DAYS), "active_messages": ACTIVE_MESSAGES,
            "reward_until": end.isoformat() if (end and end > _now() and (user.pro_plan or "").startswith("invite")) else None,
            "lasting_plan": _has_lasting_plan(user)}
