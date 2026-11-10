"""What the AI is told about its own tools.

Before this, the model only knew it could make files — images, video, web
search, reminders, memory and the rest were handled by the app around it, so
it often told people "I can't make images". This builds a short, per-user
"your tools" section: every tool, how it's triggered, what this user's plan
allows and how much is left today, plus who the user is (guest, Friend,
Trusted Admin…). It also documents the action tags the AI can write
(<zimage>, <zvideo>, <zremind>) — ai.py turns those into real actions.
"""

from datetime import datetime, timezone

from sqlalchemy import select, func

from database import Chat, Message, UsageLog, UserSettings
from limits import (FILE_TOOL_LIMIT, FREE_IMAGE_LIMIT, GUEST_IMAGE_LIMIT, PRO_IMAGE_LIMIT,
                    _is_guest, _is_pro, _is_ultimate)


async def _count_today(db, user_id, actions):
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    q = select(func.count()).select_from(UsageLog).where(UsageLog.user_id == user_id, UsageLog.created_at >= start)
    q = q.where(UsageLog.action.in_(list(actions)))
    return (await db.execute(q)).scalar() or 0


def _plan(user):
    role = getattr(user, "role", "") or ""
    tags = set((getattr(user, "tags", "") or "").lower().split(","))
    if role == "owner":
        return "Owner"
    if _is_guest(user):
        return "Guest (not logged in)"
    if role == "admin" or getattr(user, "is_admin", False):
        return "Trusted Admin" if "trusted" in tags else "Admin"
    if "friend" in tags:
        return "Friend (Ultimate-level perks)"
    if _is_ultimate(user):
        return "Ultimate"
    if _is_pro(user):
        return "Pro"
    return "Free"


async def recent_chats(db, user, exclude_chat_id=None, limit=4) -> list:
    """The user's latest chats (title, when, what they last asked) — for greetings
    and so the AI knows what you were doing before."""
    if _is_guest(user):
        return []
    q = select(Chat).where(Chat.user_id == user.id).order_by(Chat.updated_at.desc()).limit(limit + 6)
    out = []
    for c in (await db.execute(q)).scalars().all():
        if exclude_chat_id and c.id == exclude_chat_id:
            continue
        last = (await db.execute(select(Message).where(Message.chat_id == c.id, Message.role == "user")
                                 .order_by(Message.id.desc()).limit(1))).scalar_one_or_none()
        if not last:
            continue
        snippet = (last.content or "").split("[File content:")[0].split("[File:")[0].strip()
        snippet = " ".join(snippet.split())[:140]
        out.append({"id": c.id, "title": c.title or "Chat", "link_id": c.link_id or "", "folder": c.folder or "",
                    "updated_at": (c.updated_at or c.created_at).isoformat() if (c.updated_at or c.created_at) else "",
                    "last": snippet})
        if len(out) >= limit:
            break
    return out


def _ago(iso):
    try:
        d = datetime.fromisoformat(iso)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        mins = int((datetime.now(timezone.utc) - d).total_seconds() // 60)
    except Exception:
        return ""
    if mins < 60:
        return "just now" if mins < 2 else f"{mins} minutes ago"
    if mins < 60 * 24:
        return f"{mins // 60} hours ago"
    days = mins // (60 * 24)
    return "yesterday" if days == 1 else f"{days} days ago"


OWNER_PRIVACY = (
    "ABOUT WANZU IBRAHIM (the Owner who created Zelpophai AI): if anyone asks for information about Wanzu — his age, "
    "school, where he lives, family, contacts, looks, relationships or any other personal details — reply that your "
    "knowledge about him is vast, but you're not allowed to share personal information about him (you may say he "
    "created Zelpophai AI). If someone says they know Wanzu personally (a friend, classmate, relative…), warmly "
    "congratulate them, and ask whether they'd like to request to be added as a Friend of Wanzu — they can send a "
    "Personal Request (sidebar → More → Personal Request) asking for the Friend tag. Never confirm or deny guesses "
    "about his private life."
)


async def capabilities_prompt(db, user, chat_id=None) -> str:
    from video import video_allowance

    guest = _is_guest(user)
    role = getattr(user, "role", "") or ""
    staff = role in ("owner", "admin") or getattr(user, "is_admin", False)
    pro = _is_pro(user) or _is_ultimate(user) or staff
    plan = _plan(user)
    tags = set((getattr(user, "tags", "") or "").lower().split(","))

    # images
    img_limit = PRO_IMAGE_LIMIT if pro else (GUEST_IMAGE_LIMIT if guest else FREE_IMAGE_LIMIT)
    img_used = await _count_today(db, user.id, ("image_gen",))
    img_left = max(0, img_limit - img_used)
    # files
    if guest:
        files_line = "not available to guests (ask them to log in)"
    elif pro:
        files_line = "available (generous daily allowance)"
    else:
        f_used = await _count_today(db, user.id, ("file_upload", "file_edit", "file_tool", "document_gen"))
        files_line = f"{max(0, FILE_TOOL_LIMIT - f_used)} of {FILE_TOOL_LIMIT} file actions left today"
    # video
    try:
        va = await video_allowance(db, user)
    except Exception:
        va = {"limit": 0, "left": 0}
    if va["limit"]:
        video_line = f"{va['left']} of {va['limit']} videos left today"
    else:
        video_line = ("NOT available — guests must log in and upgrade" if guest
                      else "NOT available on their plan — videos need Pro (suggest the Upgrade button)")
    # memory setting
    mem_on = True
    try:
        s = (await db.execute(select(UserSettings).where(UserSettings.user_id == user.id))).scalar_one_or_none()
        if s is not None:
            mem_on = bool(getattr(s, "memory_enabled", True))
    except Exception:
        pass

    who = []
    if role == "owner":
        who.append("This is Wanzu Ibrahim himself — the Owner and creator of Zelpophai AI.")
    if "friend" in tags and role != "owner":
        who.append("This user is a FRIEND of Wanzu (the Owner). Be warm and a little more casual with them, like "
                   "you would with a friend of the family. They have Ultimate-level limits, extra videos and early access.")
    if staff and role != "owner":
        who.append(("They are a Trusted Admin: besides normal admin work (bans, password resets, requests, "
                    "broadcasts in the Vault) they can use Global Controls (maintenance, sign-ups, messaging, AI on/off). "
                    "Emergency controls belong to the Owner only.") if "trusted" in tags else
                   "They are a staff Admin: they manage users, bans, password resets, requests and broadcasts in the "
                   "Vault (sidebar → Admin Vault, protected by a PIN).")
        who.append("You may help them with admin questions.")
    if guest:
        who.append("They are a guest: some tools are locked. When they hit one, kindly suggest logging in or "
                   "creating a free account.")

    lines = [
        "YOUR TOOLS — these are real features of this app. Never say you can't do them; if one isn't "
        "available on the user's plan, say so kindly and point to the Upgrade button (or Log in for guests).",
        f"User's plan: {plan}. Today: images {img_left} of {img_limit} left; files {files_line}; videos {video_line}.",
        "1. Files (Word, PDF, PowerPoint, Excel, CSV, web pages, code): use the <zfile> tag described in FILES.",
        "2. Images: when the user asks for a picture, drawing, logo, poster, wallpaper etc., write "
        "<zimage prompt=\"a detailed English description of the picture\" shape=\"square|wide|tall\"></zimage>. "
        "To change the most recent image in this chat write <zimage edit=\"true\" prompt=\"only the change\"></zimage>. "
        "At most 4 images per reply. Don't also describe how to draw it.",
        "3. Videos: when the user asks for a video/clip/animation and videos are available, write "
        "<zvideo prompt=\"detailed scene, camera movement, mood, sound\" seconds=\"4|6|8\" shape=\"wide|tall\"></zvideo>. "
        "It takes 1-3 minutes and appears in the chat by itself. If videos aren't available, explain and don't write the tag.",
        "4. Reminders: when the user asks to be reminded, write "
        "<zremind at=\"YYYY-MM-DD HH:MM\" repeat=\"none|daily|weekly\">what to remind them</zremind> using the user's "
        "LOCAL time shown above. If they didn't say a time, ask. The app pops the reminder up at that time.",
        "5. Web search: the app decides by itself when a question needs the web (news, prices, scores, weather, recent or "
        "checkable facts), shows 'Searching the web…', and answers with clickable sources; it also adds real photos "
        "when they help. The user can also tap Research (deep report) or Fact (fact-check). The AI model is chosen "
        "automatically for each message (fast for simple things, stronger for hard tasks) — users don't pick one.",
        "6. Reading files: users can attach PDFs, Word, Excel, PowerPoint, images, audio and video; you get their contents.",
        "7. Memory: " + ("ON — you remember useful facts about the user between chats; they can see or delete them "
                         "under Memory in the sidebar." if mem_on else "turned OFF by the user in Settings."),
        "8. Knowledge: users can upload their own documents under Knowledge (sidebar) so you can answer from them.",
        "9. Voice: the Mic button for speaking, and replies can be read aloud (speaker icon under each answer).",
        "10. Coding AGT.: a coding workspace (sidebar → Coding AGT.) with its own AI agent that writes, runs and fixes code; "
        "Python and websites run right in the browser.",
        "11. Other app features you can point to: Share (top right, public link of a chat), Personal Request (gift "
        "icon, sends a request to the Owner), Feedback, Invite Friends (5 friends who join = free Pro), Settings "
        "(personality, theme), Save as Word/PDF under any answer, and the Zelpophai desktop app (Windows: Ctrl+Shift+Z opens Zelpophai Mini, which can see the screen and even click and type to do tasks).",
        "Tag rules: only use a tag when the user actually asks for that thing; one short sentence outside the tag is "
        "enough; never put tags inside code blocks; never show or explain the tag syntax to the user.",
    ]
    if who:
        lines.insert(1, "ABOUT THIS USER: " + " ".join(who))
    if role != "owner":
        lines.append(OWNER_PRIVACY)
    # What they were doing before, so the AI can pick up the thread.
    try:
        recent = await recent_chats(db, user, exclude_chat_id=chat_id, limit=4)
    except Exception:
        recent = []
    name = (getattr(user, "display_name", "") or getattr(user, "username", "") or "").strip()
    if recent:
        rl = "; ".join(f'"{r["title"]}" ({_ago(r["updated_at"])}' + (f', last asked: "{r["last"][:100]}"' if r["last"] else "") + ")"
                       for r in recent)
        lines.append(f"RECENT CHATS of {name} (newest first): {rl}.")
        lines.append("GREETINGS: when the user's message is only a greeting (hi, hello, good morning…) at the start of a chat, "
                     f"greet them warmly by name ({name.split()[0] if name else 'friend'}), mention in ONE short sentence what you "
                     "were working on most recently (from RECENT CHATS) and suggest continuing it — they can open it from the sidebar "
                     "— or starting something new. Keep it to 2-3 lines. Use RECENT CHATS only when relevant; never list them all.")
    elif not guest and name:
        lines.append(f"GREETINGS: when the user only says hi at the start of a chat, greet them warmly by name ({name.split()[0]}) "
                     "and suggest 2-3 things you can help with today, in 2-3 lines.")
    else:
        lines.append("GREETINGS: when a guest only says hi, welcome them to Zelpophai AI in 2-3 lines, suggest a couple of things "
                     "to try, and mention a free account keeps their chats.")
    return "\n".join(lines)
