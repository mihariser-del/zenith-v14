# Zenith AI — Usage Limits

Reference for every per-user limit on the platform. Enforcement lives in
`limits.py` (`check_limit` / `check_image_file_window`) plus `chats.py` and
`image.py`. Day-based counts reset at midnight UTC (UsageLog rows).

Legend: **Owner** (`WANZU-IBRAHIM`) — no limits. **Ultimate** — no limits.

| Tier | Messages | Image gen | File uploads | File edits | Cooldown / notes |
|------|----------|-----------|--------------|------------|------------------|
| Owner | ∞ | ∞ | ∞ | ∞ | Bypasses everything |
| Ultimate | ∞ | ∞ | ∞ | ∞ | Bypasses everything |
| Pro (or active trial) | 1000/day | 100/day | 100/day | 100/day | None |
| Free (logged in) | 1000/day | 5/day | 15/day | 5/day | None (image/file window: 20 msgs after last image/file) |
| Guest (`guest_*`) | 60/day | 2/day | 3/day | 1/day | 30-minute pause after 60 messages; pause also blocks image generation |

## Guest pause (detail)
- When a guest reaches **60 messages** in a day, a **30-minute pause** starts
  (`User.last_pause_at`). During the pause, both chat *and* image generation
  are rejected with a `429` (message says "Guest pause: wait Xm Xs…").
- After 30 minutes the guest can continue (up to the daily 60 again).
- Guest limit errors and pause messages always include the word **Guest**, which
  triggers the in-app "Login Required" upgrade modal via `billing.js`.

## Free tier
- Free users have 1000 messages/day (no message pause).
- `check_image_file_window`: after an image generation or file upload inside a
  chat, the free user gets **20 messages** before the next image/file is allowed
  within that chat (configurable count; enforced in `limits.py`).

## UI copy that must stay in sync
- Vault → Settings → Limits panel (`vault.js`): Free 5/15, Guest 2/3/1 and
  "60 msgs → 30min (blocks chat + images)", Pro 100/day each.
- Guest pause strings appear in `limits.py`, `chat.js` (countdown banner parsing),
  and `billing.js` (guest "Login Required" modal).
- `chats.py` also enforces the global **AI OFF** global control (Owner toggles
  from the Vault): user messages are saved but the model stays silent
  ("talking to nothing") for everyone except the Owner.
- **Messaging OFF** global control: non-Owner users get a disabled composer
  (`app.js` `_applySysUI`, `window.__msgBlocked`) — `Chat.send()` no-ops client-side
  and the server rejects with `403` for defense in depth.