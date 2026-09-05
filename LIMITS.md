# Zenith AI — Usage Limits

Reference for every per-user limit on the platform. Enforcement lives in
`limits.py` (`check_limit` / `check_chat_media_window`) plus `chats.py`,
`image.py`, `generate.py` and `files.py`. Day-based counts reset at midnight
UTC (UsageLog rows). Cooldown timers live on `User.cooldown_until`.

Legend: **Owner** (`WANZU-IBRAHIM`) — no limits. **Ultimate** — no limits.

| Tier | Messages | Image gen | Files (upload+edit+gen) | Voice chat | Cooldown / notes |
|------|----------|-----------|------------------------|------------|------------------|
| Owner | ∞ | ∞ | ∞ | ∞ | Bypasses everything |
| Ultimate | ∞ | ∞ | ∞ | ∞ | Bypasses everything |
| Pro (or active trial) | 1000/day | 100/day | 100/day each | ∞ | 10–30 min after hitting a limit / **60 min** when exploiting (burst ≥60 msgs/hr, ≥30 in 10 min, or ≥15 media/day) |
| Free (logged in) | 1000/day | 5/day | 10/day combined | 30 min/day | Dynamic cooldown **1h–18h** based on usage intensity + chat media window |
| Guest (`guest_*`) | 60/day | 2/day | uploads 3/day; edits/generator blocked | ∞ (message cap still applies) | 30-minute pause after 60 messages (blocks chat + images); login prompt follow-up |

- Images and files **count as messages** (each image/file action also logs a
  `message` UsageLog row).

## Dynamic cooldown timer (free logged-in)
- Triggered when a limit is hit (image cap, file cap, or chat media window used up).
- Duration = `60 + intensity × (1080-60)` minutes → **1h to 18h**, where intensity
  weights: messages today, messages in the last hour, messages in the last 10 min
  (burst), and media volume today (`_usage_profile` / `_intensity` in `limits.py`).
- While active, every limited action returns 429 with a live countdown; the client
  shows the countdown popup (`showLimitPopup` in `api.js`).

## Pro timer
- Normal usage: **10–30 min** after hitting a daily limit.
- Exploitation (≥60 msgs/hour, ≥30 msgs/10min, or ≥15 media actions/day): fixed **60 min**.

## Chat media window
- After **5 image generations** OR **15 file uploads** inside one chat
  (`[Image` / `[File:` markers in messages), that chat gets a **15-message
  allowance** (media counts as messages).
- When the 15 messages run out, a cooldown starts — **long** for free users
  (the dynamic 1h–18h timer), short for Pro, the 30-min guest pause for guests.
- Enforced by `check_chat_media_window` (called from `chats.py` before streaming).

## File editor/generator system
- **Guests cannot use the file editor/generator at all** (file edits and document
  generation → `403`; uploads are still allowed at 3/day).
- **Free logged-in**: username combined **10 file create/edit actions/day**
  (uploads + edits + document generation), then a **fixed 1-hour cooldown**.
- **Pro**: 100 uploads and 100 edits/day (no combined cap).

## Voice meter
- Logged-in **free** users get **30 minutes of voice-mode chat per day**
  (client-side accumulator keyed by UTC date, `voice.js`); after the cap, opening
  voice mode shows a "Voice limit reached — resets at midnight (UTC)" popup.
- Pro/Ultimate/Owner: unlimited. Guests: unchanged (message cap still applies).

## Guest pause (detail)
- When a guest reaches **60 messages** in a day, a **30-minute pause** starts
  (`User.last_pause_at` + `cooldown_until`). During the pause, both chat *and*
  image generation are rejected with a `429` ("wait Xm Xs…").
- Guest limit errors and pause messages always include the word **Guest**, which
  triggers the in-app "Login Required" follow-up (billing modal or countdown popup).

## Limit popups
- `api.js` `showLimitPopup(detail)`: full-screen countdown modal ("LIMIT REACHED")
  with live timer, a **Login / Register** button for guests and an **Upgrade for
  more** button for logged-in users.
- `billing.js` routes every 429 with a `wait Xm Ys` / cooldown / pause message to
  the popup (other limit messages still open the upgrade modal). Modal de-dup via
  `window.__modalOpen`.

## Auto image generation
- If a message clearly asks for an image ("generate a pic of...", "i want a pic
  of...", "make a logo of..."), `detectImageRequest` (app.js) extracts the prompt
  and `Chat.generateImageNow` generates it immediately — persisted as an assistant
  message (survives reload, counts toward image limits and the media window).
- Follow-up edits work the same way: "add a bell around the cow", "make it bigger",
  "remove the hat" → `Chat.editGeneratedImage` → `/api/image/edit`, which merges
  the change into the last generated image's prompt and reuses its seed (only
  triggers when the chat already has a generated image). Counts as an `image_gen`.

## UI copy that must stay in sync
- Vault → Settings → Limits panel (`vault.js`).
- Guest pause strings appear in `limits.py`, `chat.js` (countdown banner parsing),
  `api.js` (popup regex) and `billing.js` (guest "Login Required" modal).
- `chats.py` also enforces the global **AI OFF** global control (Owner toggles
  from the Vault): user messages are saved but the model stays silent
  ("talking to nothing") for everyone except the Owner.
- **Messaging OFF** global control: non-Owner users get a disabled composer
  (`app.js` `_applySysUI`, `window.__msgBlocked`) — `Chat.send()` no-ops client-side
  and the server rejects with `403` for defense in depth.