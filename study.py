"""Study mode: flashcards and quizzes with spaced repetition (26.2).

Decks are made from a topic, from pasted notes or a file, or from flashcards
Zelpophai writes in a chat (<zdeck>). Reviewing uses a simple SM-2 schedule:
"Again" brings a card back in a minute, "Good" pushes it further out each time,
so the cards you find hard come back more often. Quizzes are multiple choice
built from the deck itself (the other cards' answers are the wrong options),
so they cost nothing. Every review counts towards a daily streak.
"""

import random
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user_from_cookie
from database import StudyCard, StudyDay, StudyDeck, get_db

router = APIRouter(prefix="/api/study", tags=["study"])

MAX_DECKS = 200
MAX_CARDS = 500


def _now():
    return datetime.now(timezone.utc)


def _aware(d):
    return d if d is None or d.tzinfo else d.replace(tzinfo=timezone.utc)


def _today(tz: str | None):
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo(tz)).strftime("%Y-%m-%d") if tz else _now().strftime("%Y-%m-%d")
    except Exception:
        return _now().strftime("%Y-%m-%d")


async def _deck(db, user, did) -> StudyDeck:
    d = await db.get(StudyDeck, did)
    if not d or d.user_id != user.id:
        raise HTTPException(status_code=404, detail="Deck not found")
    return d


async def _streak(db, user_id, tz):
    days = {r[0]: r[1] for r in (await db.execute(select(StudyDay.day, StudyDay.reviewed).where(StudyDay.user_id == user_id))).all()}
    today = datetime.strptime(_today(tz), "%Y-%m-%d").date()
    d = today if days.get(today.isoformat()) else today - timedelta(days=1)
    n = 0
    while days.get(d.isoformat()):
        n += 1
        d -= timedelta(days=1)
    return n, days.get(today.isoformat(), 0)


@router.get("")
async def overview(request: Request, tz: str = "", db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    decks = (await db.execute(select(StudyDeck).where(StudyDeck.user_id == user.id).order_by(StudyDeck.created_at.desc()))).scalars().all()
    now = _now()
    out = []
    for d in decks:
        total = (await db.execute(select(func.count()).select_from(StudyCard).where(StudyCard.deck_id == d.id))).scalar() or 0
        due = (await db.execute(select(func.count()).select_from(StudyCard).where(StudyCard.deck_id == d.id, StudyCard.due_at <= now.replace(tzinfo=None)))).scalar() or 0
        new = (await db.execute(select(func.count()).select_from(StudyCard).where(StudyCard.deck_id == d.id, StudyCard.reps == 0))).scalar() or 0
        learned = (await db.execute(select(func.count()).select_from(StudyCard).where(StudyCard.deck_id == d.id, StudyCard.interval >= 21))).scalar() or 0
        out.append({"id": d.id, "title": d.title, "source": d.source, "total": total, "due": due, "new": new, "learned": learned,
                    "created_at": d.created_at.isoformat() if d.created_at else ""})
    streak, today = await _streak(db, user.id, tz)
    return {"decks": out, "streak": streak, "today": today}


class CardIn(BaseModel):
    front: str
    back: str


class DeckIn(BaseModel):
    title: str = ""
    cards: list[CardIn] = []
    topic: str = ""          # make cards about this
    text: str = ""           # …or from these notes
    count: int = 15
    source: str = ""


async def _generate(topic: str, text: str, count: int) -> tuple[str, list]:
    from router_ai import HEAVY_MODEL, _post, _json
    count = max(5, min(int(count or 15), 40))
    what = (f"these notes:\n{text[:24000]}" if text.strip() else f"the topic: {topic[:500]}")
    data = await _post({"model": HEAVY_MODEL, "temperature": 0.3, "max_tokens": 4000, "messages": [
        {"role": "system", "content": f"Make {count} high-quality flashcards from {('the notes' if text.strip() else 'the topic')}. "
                                      "Each tests ONE fact or idea; front is a clear question (not yes/no), back is a short, "
                                      "correct answer (under 25 words). Cover the most important points first, no duplicates. "
                                      'Reply with JSON only: {"title": "short deck title", "cards": [{"front": "...", "back": "..."}]}'},
        {"role": "user", "content": "Make flashcards from " + what}]}, timeout=120)
    raw = (((data or {}).get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    j = _json(raw)
    cards = [c for c in (j.get("cards") or []) if isinstance(c, dict) and str(c.get("front", "")).strip() and str(c.get("back", "")).strip()]
    return str(j.get("title") or topic or "My deck")[:120], cards


@router.post("/decks")
async def create_deck(body: DeckIn, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if (user.username or "").startswith("guest_"):
        raise HTTPException(status_code=403, detail="Create a free account to save study decks.")
    n = (await db.execute(select(func.count()).select_from(StudyDeck).where(StudyDeck.user_id == user.id))).scalar() or 0
    if n >= MAX_DECKS:
        raise HTTPException(status_code=400, detail=f"You can keep up to {MAX_DECKS} decks.")
    cards = [{"front": c.front, "back": c.back} for c in body.cards]
    title = body.title.strip()
    if not cards:
        if not (body.topic.strip() or body.text.strip()):
            raise HTTPException(status_code=400, detail="Give a topic, some notes, or cards.")
        from limits import check_limit
        await check_limit(user, db, "message")
        gen_title, cards = await _generate(body.topic, body.text, body.count)
        if not cards:
            raise HTTPException(status_code=502, detail="Couldn't make cards just now — try again.")
        title = title or gen_title
    deck = StudyDeck(user_id=user.id, title=(title or "My deck")[:120], source=(body.source or body.topic or "")[:200])
    db.add(deck)
    await db.flush()
    for c in cards[:MAX_CARDS]:
        db.add(StudyCard(deck_id=deck.id, front=str(c["front"]).strip()[:1000], back=str(c["back"]).strip()[:2000]))
    await db.commit()
    return {"id": deck.id, "title": deck.title, "cards": min(len(cards), MAX_CARDS)}


@router.get("/decks/{did}")
async def get_deck(did: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    d = await _deck(db, user, did)
    cards = (await db.execute(select(StudyCard).where(StudyCard.deck_id == did).order_by(StudyCard.id))).scalars().all()
    return {"deck": {"id": d.id, "title": d.title}, "cards": [
        {"id": c.id, "front": c.front, "back": c.back, "reps": c.reps, "interval": c.interval,
         "due_at": _aware(c.due_at).isoformat() if c.due_at else ""} for c in cards]}


class DeckPatch(BaseModel):
    title: str


@router.patch("/decks/{did}")
async def rename_deck(did: int, body: DeckPatch, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    d = await _deck(db, user, did)
    if body.title.strip():
        d.title = body.title.strip()[:120]
        await db.commit()
    return {"ok": True}


@router.delete("/decks/{did}")
async def delete_deck(did: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    d = await _deck(db, user, did)
    await db.execute(delete(StudyCard).where(StudyCard.deck_id == did))
    await db.delete(d)
    await db.commit()
    return {"ok": True}


@router.post("/decks/{did}/cards")
async def add_card(did: int, body: CardIn, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    await _deck(db, user, did)
    if not body.front.strip() or not body.back.strip():
        raise HTTPException(status_code=400, detail="Fill in both sides.")
    c = StudyCard(deck_id=did, front=body.front.strip()[:1000], back=body.back.strip()[:2000])
    db.add(c)
    await db.commit()
    return {"id": c.id}


async def _card(db, user, cid) -> StudyCard:
    c = await db.get(StudyCard, cid)
    if not c:
        raise HTTPException(status_code=404, detail="Card not found")
    await _deck(db, user, c.deck_id)
    return c


@router.patch("/cards/{cid}")
async def edit_card(cid: int, body: CardIn, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    c = await _card(db, user, cid)
    c.front, c.back = body.front.strip()[:1000] or c.front, body.back.strip()[:2000] or c.back
    await db.commit()
    return {"ok": True}


@router.delete("/cards/{cid}")
async def delete_card(cid: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    c = await _card(db, user, cid)
    await db.delete(c)
    await db.commit()
    return {"ok": True}


@router.get("/decks/{did}/review")
async def review(did: int, request: Request, limit: int = 20, all: bool = False, db: AsyncSession = Depends(get_db)):
    """Cards to go through now: the due ones (or every card with all=1 for a free practice run)."""
    user = await get_current_user_from_cookie(request, db)
    await _deck(db, user, did)
    q = select(StudyCard).where(StudyCard.deck_id == did)
    if not all:
        q = q.where(StudyCard.due_at <= _now().replace(tzinfo=None))
    cards = (await db.execute(q.order_by(StudyCard.due_at).limit(max(1, min(limit, 100))))).scalars().all()
    nxt = None
    if not cards:
        c = (await db.execute(select(StudyCard).where(StudyCard.deck_id == did).order_by(StudyCard.due_at).limit(1))).scalars().first()
        nxt = _aware(c.due_at).isoformat() if c and c.due_at else None
    return {"cards": [{"id": c.id, "front": c.front, "back": c.back, "reps": c.reps} for c in cards], "next_due": nxt}


class GradeIn(BaseModel):
    grade: str            # again | hard | good | easy
    tz: str = ""


def schedule(c: StudyCard, grade: str):
    """SM-2, simplified. Returns the new interval in days."""
    g = {"again": 0, "hard": 1, "good": 2, "easy": 3}.get(grade, 2)
    ease = c.ease or 2.5
    if g == 0:
        c.lapses = (c.lapses or 0) + 1
        c.reps = 0
        c.ease = max(1.3, ease - 0.2)
        c.interval = 0
        c.due_at = (_now() + timedelta(minutes=1)).replace(tzinfo=None)
        return 0
    c.reps = (c.reps or 0) + 1
    if c.reps == 1:
        iv = {1: 0.5, 2: 1, 3: 3}[g]
    elif c.reps == 2:
        iv = {1: 2, 2: 3, 3: 6}[g]
    else:
        iv = (c.interval or 1) * {1: 1.2, 2: ease, 3: ease * 1.3}[g]
    c.ease = max(1.3, ease + {1: -0.15, 2: 0, 3: 0.15}[g])
    c.interval = round(min(iv, 3650), 2)
    c.due_at = (_now() + timedelta(days=c.interval)).replace(tzinfo=None)
    return c.interval


async def _count_day(db, user_id, tz, reviewed=0, correct=0):
    day = _today(tz)
    row = (await db.execute(select(StudyDay).where(StudyDay.user_id == user_id, StudyDay.day == day))).scalars().first()
    if not row:
        row = StudyDay(user_id=user_id, day=day, reviewed=0, correct=0)
        db.add(row)
    row.reviewed = (row.reviewed or 0) + reviewed
    row.correct = (row.correct or 0) + correct


@router.post("/cards/{cid}/grade")
async def grade(cid: int, body: GradeIn, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    c = await _card(db, user, cid)
    iv = schedule(c, body.grade)
    await _count_day(db, user.id, body.tz, 1, 0 if body.grade == "again" else 1)
    await db.commit()
    streak, today = await _streak(db, user.id, body.tz)
    return {"interval": iv, "due_at": _aware(c.due_at).isoformat(), "streak": streak, "today": today}


@router.get("/decks/{did}/quiz")
async def quiz(did: int, request: Request, n: int = 10, db: AsyncSession = Depends(get_db)):
    """Multiple choice from the deck's own cards: the other answers are the wrong options."""
    user = await get_current_user_from_cookie(request, db)
    await _deck(db, user, did)
    cards = (await db.execute(select(StudyCard).where(StudyCard.deck_id == did))).scalars().all()
    if len(cards) < 4:
        raise HTTPException(status_code=400, detail="A quiz needs at least 4 cards in the deck.")
    # Harder cards first, then random.
    pool = sorted(cards, key=lambda c: (-(c.lapses or 0), random.random()))[:max(3, min(n, 30))]
    random.shuffle(pool)
    qs = []
    for c in pool:
        others = [o.back for o in cards if o.id != c.id and o.back.strip().lower() != c.back.strip().lower()]
        # Prefer wrong options of a similar length, so the right one doesn't stand out.
        others.sort(key=lambda b: abs(len(b) - len(c.back)) + random.random() * 20)
        opts = list(dict.fromkeys(others))[:3] + [c.back]
        random.shuffle(opts)
        qs.append({"card_id": c.id, "question": c.front, "options": opts, "answer": opts.index(c.back)})
    return {"questions": qs}


class QuizDone(BaseModel):
    results: list = []      # [{card_id, right: bool}]
    tz: str = ""


@router.post("/decks/{did}/quiz")
async def quiz_done(did: int, body: QuizDone, request: Request, db: AsyncSession = Depends(get_db)):
    """Quiz answers also move cards along their schedule."""
    user = await get_current_user_from_cookie(request, db)
    await _deck(db, user, did)
    right = 0
    for r in (body.results or [])[:60]:
        try:
            c = await db.get(StudyCard, int(r.get("card_id")))
        except (TypeError, ValueError):
            continue
        if not c or c.deck_id != did:
            continue
        ok = bool(r.get("right"))
        right += ok
        schedule(c, "good" if ok else "again")
    await _count_day(db, user.id, body.tz, len(body.results or []), right)
    await db.commit()
    streak, today = await _streak(db, user.id, body.tz)
    return {"right": right, "total": len(body.results or []), "streak": streak}
