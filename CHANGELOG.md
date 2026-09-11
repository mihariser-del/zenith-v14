# Changelog

## 20.0 — Quolvex AI rebrand & billing fix

- **Quolvex AI is here** — the app is now called **Quolvex AI**. Same features, same chats, same account.
- **Fixed an upgrade-button bug**: in dev/test mode (no payment provider configured) clicking a plan used to reload the page with no confirmation; it now shows a clear "Plan activated (dev mode)" success toast and closes cleanly. Real PesaPal checkouts still redirect to the payment page as before.
- Payment provider errors now show a clear message instead of a generic "Internal Server Error".

## 19.8 — PesaPal billing (Uganda-ready)

- **Billing switched from Stripe to PesaPal** — works in Uganda with Visa, Mastercard, AMEX and mobile money (MTN/Airtel)
- Subscriptions, one-time lifetime purchases and free trials all still work the same way — just a different payment provider behind the scenes
- Sandbox mode available for testing (set `PESAPAL_SANDBOX=true` on Railway)

## 19.7 — Vibrant upgrade & guest login

- **Upgrade popup got a neon makeover**: gradient titles, glowing plan cards (cyan Pro, gold Ultimate), POPULAR / SAVE 17% / ONE-TIME badges, animated buttons and an aurora background — all responsive on mobile
- **Guests now always see why invites/sharing are off-limits**: points at locking etc. with a colorful, animated **Login / Register** prompt that pops on top of everything (it used to hide behind the invite/share dialogs)
- Guests are told instantly the moment they tap Invite or Share, before any locked feature opens

## 19.6 — Busy-proof downloads

- If Quolvex AI is busy (too many requests at once) right when you ask for a file/document generation, instead of an empty error you get a friendly note and a **test file** you can still download
- The test file preview card has one-click download buttons for every supported format: **.md, .docx, .pdf, .pptx, .xlsx, .csv** — so you can verify the download pipeline works even while the AI is unavailable
- Also applies when regenerating a previous answer

## 19.5 — AI reads every file

- **The AI can now read your files**: uploading a PDF, Word, Excel, PowerPoint, audio or video makes the content (extracted server-side) available to Quolvex AI so it can summarize, answer questions, edit, replicate and rewrite what you send
- **Wider upload support**: more MIME types + extension fallbacks — Office docs, spreadsheets, slides, audio (mp3/wav/m4a/ogg/opus/flac/aac), video (mp4/webm/mov/avi/mkv) and common code/text formats
- **Office extraction**: docx → paragraphs + tables (`python-docx`), xlsx → per-sheet cell text (`openpyxl`), pptx → per-slide text (`python-pptx`)
- **Audio**: metadata (duration/bitrate/format) via `mutagen` + Whisper-compatible transcription when `WHISPER_API_KEY`/`OPENAI_API_KEY` is set (`WHISPER_BASE_URL`/`WHISPER_MODEL` overrides)
- **Video**: duration probe + up to 3 key frames extracted (`imageio_ffmpeg`, bundled ffmpeg) sent to the vision model, plus audio-track transcription when a key is configured
- **Chat integration**: `chat.js` now auto-fetches `/api/files/{id}/read` for binary attachments and embeds the extracted content + video frames into the model context (capped ~12k chars/file)
- All optional libraries are import-guarded so the server degrades gracefully (marker text) instead of crashing when a dependency is missing
- New env knobs: `WHISPER_API_KEY`, `WHISPER_BASE_URL`, `WHISPER_MODEL`

## 18.2 — Security hardening

- **Code sandbox locked down**: arbitrary server code execution (`/api/code/execute`) now requires Owner login; shell/bash execution removed entirely; secrets (OpenRouter keys, SECRET_KEY) stripped from the subprocess environment
- **Hardcoded admin/owner passwords removed**: only the Owner account is auto-created now — there is **no default admin** (admins are promoted by the Owner). The Owner password defaults to `W.A.N.Z.U.` **for now** (override with `OWNER_PASSWORD`); the vault → EMERGENCY tab can flip it to a fresh random 13-char value instantly when ready
- **No pre-registered admin**: the legacy `THE0NLYADMIN` bootstrap and the auto-rotation block were removed — future admins are created/promoted by the Owner
- **Emergency owner password rotation** (vault → EMERGENCY tab): one click rotates the Owner's password to a fresh random 13-char value, wipes any pending reset, and instantly signs out every other session (only the current browser stays logged in), showing the new password once
- **SECRET_KEY**: known-weak dev value no longer accepted — a strong key is auto-generated and persisted to `secret_key.txt` (`/data` on Railway) so sessions survive restarts
- **Forgot-password no longer allows account takeover**: `POST /api/auth/forgot-password` now issues a one-time 30-minute reset code delivered by email (SMTP via `SMTP_*` env; logged to server logs when unconfigured); new `POST /api/auth/reset-password` verifies the token
- **Brute-force protection**: failed attempts tracked per-IP and per-username with lockout + `Retry-After` (429) on login, admin login, guest creation, registration, and forgot-password
- **Sessions**: `zenith_token` cookie now sets `secure=True` except on localhost dev (login, guest, admin login, logout-all, Google sign-in)
- **`/api/debug/keys`** now Owner-only; leaked hardcoded key-prefix constant removed
- **`pending_password`** (admin password resets) encrypted at rest (Fernet) and shown once then cleared
- Docs: `.env.example` updated with owner/admin/env/SMTP vars; `secret_key.txt` added to `.gitignore`

## 18.1 — Batch: dynamic limits, media window, voice meter, auto image gen & split changelog

- **Dynamic limit timers**: logged-in users get a cooldown from **1h to 18h**,
  computed from usage intensity (messages today / last hour / 10-min bursts +
  media volume); **Pro** gets 10–30 min normally and a fixed **1h** when
  exploiting features
- **Chat media window**: after **5 image gens** or **15 file uploads** in one chat,
  you get a **15-message allowance** (images/files count as messages), then a long
  cooldown starts
- **Images and files count as messages** for the limit counters
- **Voice meter**: logged-in free users get **30 minutes of voice chat per day**
  (resets at midnight UTC) with a popup after the cap
- **File editor/generator system**: guests are blocked entirely; logged-in users
  get **10 file create/edit actions/day** then a **fixed 1-hour cooldown**
- **Limit popups**: every cooldown now shows a full-screen countdown popup
  (`LIMIT REACHED`) with a **Login/Register** button for guests (image-limit
  follow-up) and **Upgrade for more** for logged-in users
- **Auto image generation**: type "generate a pic of..." / "i want a pic of..." and
  Quolvex AI generates the image automatically (persisted in the chat)
- **Changelog split**: normal users see what affects them; owners & admins see the
  deep technical notes (vault too)
- New `User.cooldown_until` column (auto-migrated); `generate.py` now enforces the
  file_tool limit; generated images are persisted as assistant messages

## 17.1 — Batch: control room, limits, offline & polish

- AI OFF global control now truly silences the model — messages are saved but the AI
  gives an empty reply ("talking to nothing") for everyone except the Owner
- Messaging OFF global control now totally blocks sending for non-owners: composer
  disabled client-side + server 403 defense-in-depth
- Message limit / guest-pause errors are no longer silent — chat.js shows a live
  countdown banner above the composer and auto-disables messaging during cooldowns
- Guest limits revised: 60 messages/day (was 40), 30-minute pause (was 15); the pause
  also blocks image generation for guests
- Guests can now use Settings and Feedback (messages/feedback labeled "Guest" in
  the vault inbox); guests get a special logout warning that the account will be lost
- Real device notifications for broadcasts and AI replies (OS action center / mobile
  panel) — permission now requested for everyone including guests
- Maintenance OFF prompts the Owner for a "What was fixed?" note that is shown to
  all users with a "What Was Fixed During The Break" popup on the next load
- Vault admin list + stat cards no longer count deleted accounts
- Offline math answers reworded to "The value for X is Y"; directory answers rotate
  through variants (`answers` arrays), plus new common questions
- Voice mode double-speech fixed (chat.js already speaks — voice.js no longer repeats)
- Display name now updates the top bar in real time (settings PATCH mirrors
  `User.display_name` used by `/api/auth/me`)
- New `LIMITS.md` reference; global limits display + config export updated in the vault

## 14.5 — 2026-08-28

- New Feedback system — send feedback to admins and view replies as a comment thread
- Changelog popup — see what's new once per version (localStorage version check)
- Favicon updated — rounded design with gradient glow (border-radius 12px effect)
- Document title updated to Quolvex AI (was Zenith AI)

## 14.0 — Previous

- Initial 14.0 release
