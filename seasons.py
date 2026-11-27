"""Which seasonal look a person gets, and who is allowed to see it yet.

Halloween has been open to everyone since it was built. Christmas is new, so
for its first year it goes only to the Owner, the admins and the people tagged
as Friends — the "early" audience. When you want to open it to everyone, change
one setting in the Vault (System → Controls) rather than shipping a release.

The dates are checked on the server, but also repeated in the page's <head> so
the theme is already on at the first paint instead of flashing in a moment
later. The server is what decides *eligibility*; the browser only decides
*in season*.
"""

from datetime import date

AUDIENCE_KEY = "christmas_audience"     # "early" | "everyone" | "off"
DEFAULT_AUDIENCE = "early"
AUDIENCES = ("early", "everyone", "off")

THEMES = {
    "halloween": {"label": "Halloween", "from": (10, 15), "to": (11, 2), "audience": "everyone"},
    "christmas": {"label": "Christmas", "from": (11, 25), "to": (1, 2), "audience": AUDIENCE_KEY},
}


def in_season(name: str, today: date | None = None) -> bool:
    """Is this theme's time of year? Handles a range that crosses New Year."""
    t = THEMES.get(name)
    if not t:
        return False
    d = today or date.today()
    (fm, fd), (tm, td) = t["from"], t["to"]
    start_after = (d.month, d.day) >= (fm, fd)
    end_before = (d.month, d.day) <= (tm, td)
    # December to January wraps round the end of the year.
    return (start_after or end_before) if fm > tm else (start_after and end_before)


def is_early(user) -> bool:
    """The Owner, any admin, and anyone tagged as a Friend."""
    if user is None:
        return False
    try:
        from auth import get_role
        role = get_role(user)
    except Exception:
        role = getattr(user, "role", "") or ""
    if role in ("owner", "admin"):
        return True
    return "friend" in (getattr(user, "tags", "") or "").lower().split(",")


async def audience(db=None) -> str:
    """Who may see Christmas at the moment."""
    try:
        from database import async_session
        from global_controls import _get_setting
        if db is not None:
            v = await _get_setting(db, AUDIENCE_KEY, DEFAULT_AUDIENCE)
        else:
            async with async_session() as s:
                v = await _get_setting(s, AUDIENCE_KEY, DEFAULT_AUDIENCE)
    except Exception:
        v = DEFAULT_AUDIENCE
    return v if v in AUDIENCES else DEFAULT_AUDIENCE


async def allowed(user, name: str, db=None) -> bool:
    """May this person see this theme at all (season aside)?"""
    t = THEMES.get(name)
    if not t:
        return False
    if t["audience"] == "everyone":
        return True
    who = await audience(db)
    if who == "off":
        return False
    if who == "everyone":
        return True
    return is_early(user)


async def state(user, db=None, today: date | None = None) -> dict:
    """Everything the app needs: which themes this person may see, and which
    one is in season right now."""
    out, current = {}, ""
    for name in THEMES:
        ok = await allowed(user, name, db)
        season = in_season(name, today)
        out[name] = {"allowed": ok, "in_season": season}
        if ok and season and not current:
            current = name
    return {"themes": out, "current": current,
            "christmas_audience": await audience(db),
            "early": is_early(user)}
