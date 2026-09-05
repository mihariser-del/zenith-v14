# Zenith AI — Deep System Audit Report

Date: 2026-09-03 · Scope: READ-ONLY (no fixes applied except broadcast delivery, which you authorized separately)

This is a read-only audit of the entire Zenith AI system. Findings are reported for your review
and remediation prioritization. No code was changed for the audit findings below. The only change
made during this session was the **broadcast delivery fix** (you requested it explicitly) — documented at the end.

---
## ⚠️ UPDATE (same day): Most findings have now been FIXED at your request
The following were implemented after you approved the fixes (see `git log` on the applied commit):
- **1.1 hardcoded admin secret** — REMOVED. Admin creation is now owner-only via `POST /api/auth/admin/users` (no secret; vault form is owner-only). The `admin/login` endpoint no longer accepts a secret to mint admins.
- **1.2 hardcoded AI key** — REMOVED from `ai.py`; the app now uses only `OPENROUTER_API_KEYS`/`OPENROUTER_API_KEY` env.
- **1.4 `KeyError` on malformed token** — FIXED (`auth.py` now guards `sub` and validates the int).
- **2.1 maintenance login exemption** — FIXED (chosen helpers can now log in during maintenance).
- **2.2 duplicate `showToast`** — FIXED (single canonical version now lives in `api.js`).
- **2.3 `emBackup` false success** — FIXED (failures now shown as errors).
- **2.4 `console.log` override** — FIXED (restored in a `finally`).
- **1.5 DOM-XSS (app.js:272)** — FIXED (username escaped).
- **Broadcast delivery** — further hardened (vault receives broadcasts; cache-busted feed polling; SW bumped to v23).
- **PWA icons** — regenerated to match the website logo (gradient + centered white Z) with new versioned filenames + manifest/SW bump so already-installed apps pick up the new icon.

Still open / not addressed:
- **1.3 plaintext password exposure** — intentional feature (target user views their new password once); left as-is pending your call.
- **2.5 role-change popup / page reload** — investigation ongoing; no root cause confirmed yet.

---
## 🔧 LATEST (same day) — emergency/feature-control fixes
- **No more "now working" broadcasts on toggle-OFF**: removing the ON/restored `_announce` calls in `global_controls.py` (maintenance off, registrations on, messaging on, ai on, unlock-all). These no longer broadcast to everyone — the vault shows a confirming toast instead. Kills the endless "X is working again" replay.
- **Emergency broadcasts no longer replay on reload/logout**: `app.js` `pollAnnouncements` now marks ALL broadcasts (including `[EMERGENCY:...]`) as seen.
- **Persistent maintenance/locked screen is now driven by LIVE system state** (`_syncPersistentScreen` in `app.js`): checked on load + every 3s, so a reload mid-emergency still re-applies the screen, and it lifts automatically the instant the Owner turns the mode off (no more stuck/infinite reload loop).
- **Guest upgrade → "Login Required" popup**: guest click on Upgrade now shows a login prompt (plan cards hidden) instead of the full upgrade modal.
- **Removed the 5-day Pro trial**: "Start Pro Trial"/free-trial messaging removed; `pro_monthly` now goes through normal checkout; the auto `checkTrialOffer` popup removed.

---
## 🔧 NEWEST (18.1) — batch: dynamic limits, media window, voice meter, auto image gen & split changelog
- **Dynamic cooldown timers** — `limits.py`: new `User.cooldown_until` column (auto-migrated in `database.py`). Hitting a limit starts a timer — free: **1h–18h** from `_usage_profile` intensity (msgs today / last hour / 10-min bursts + media volume); Pro: **10–30 min** normally, fixed **60 min** on exploitation (≥60 msgs/hr, ≥30 in 10 min, ≥15 media/day). The generic cooldown gate at the top of `check_limit` blocks *every* limited action until it expires.
- **Images & files count as messages** — image/file/document actions now also log a `message` UsageLog row (feeds both the daily counters and the intensity profile).
- **Chat media window** — new `check_chat_media_window` (replaces `check_image_file_window`): after **5 image gens** or **15 file uploads** in one chat (`[Image` / `[File:` markers), a **15-message allowance** runs (media counts as messages), then a cooldown starts (long for free, short for Pro, guest pause for guests). Called from `chats.py` before streaming.
- **File editor/generator system** — guests get `403` on file edits & document generation ("Please log in"); free logged-in users get **10 combined create/edit actions/day** (upload+edit+doc-gen counted together) then a **fixed 1-hour cooldown**; Pro keeps 100/day each. `generate.py` now enforces it (previously no `check_limit` at all).
- **Voice meter** — `voice.js` client-side accumulator keyed by UTC date; logged-in free users get **30 min of voice-mode chat/day**; opening voice mode after the cap shows a "Voice limit reached — resets at midnight (UTC)" popup. Pro/Ultimate/Owner unlimited; guests unchanged.
- **Limit popups** — `api.js` `showLimitPopup(detail)`: fullscreen "LIMIT REACHED" countdown modal with live timer, **Login/Register** for guests (the guest image-limit follow-up) and **Upgrade for more** for logged-in. `billing.js` now routes 429 messages containing `wait Xm Ys`/cooldown/pause to the popup; modal de-dup through `window.__modalOpen`. `chat.js` `_handleSendError` shows the popup on countdowns and on persistent non-timer limits.
- **Generated images persisted** — `image.py` accepts optional `chat_id` and saves an assistant message (`**Prompt:** … ![Generated image](url)`) so images survive reload and count toward the media window.
- **Auto image generation** — `detectImageRequest()` (app.js) matches "generate a pic of…", "i want a pic of…", etc.; `Chat.generateImageNow` generates + persists before sending. Image-gen button now reuses the same path.
- **Changelog split** — `main.py` now serves `user_changes` + `staff_changes`; app shows the role-appropriate list (staff include technical notes); vault Settings shows a collapsible staff changelog.
- Docs: `LIMITS.md` rewritten, `CHANGELOG.md` 18.1 entry, `FEATURE_LIST.md` guest line updated, vault limits display + config export updated.

---
## 🔧 NEWEST — batch: controls, limits, offline & polish (see CHANGELOG 17.1)
- **Vault admin list hygiene** — `renderAdmins` + stat cards now filter out `is_deleted` users end-to-end (deleted admins no longer appear in Admin Management or counts).
- **Global AI OFF really silences the AI** — `chats.py` now checks the `ai_enabled` system setting; user messages are saved but the model returns an empty `[DONE]` stream for everyone except the Owner (also applies to edit/regenerate). No more "I'm still underserved by disabling AI".
- **Global Messaging OFF totally blocks sending** — `app.js` caches `/api/admin/system/public` as `window.__sysState`, `_applySysUI` disables composer/send/mic for non-owners and `Chat.send()` no-ops via `window.__msgBlocked`; server 403 remains as defense-in-depth.
- **Silent 429s fixed** — `chat.js send()`/`regenerate()` now check `res.ok`; limit/pause errors render a countdown banner above the composer (`#limit-banner`) and auto-disable messaging (`_limitBlocked`) until the cooldown expires; guest pause parses `wait Xm Ys` (else 30 min). Billing modal still fires for guests via the api interceptor (messages containing "Guest"/"limit").
- **Guest limits revised** — `limits.py`: message 40→60/day, pause 15→30 min; the pause window now also blocks image generation (`last_pause_at` check on `image_gen`). Mirror updates in vault limits display + export config + `database.py` comment + new `LIMITS.md`.
- **Guests can use Settings & Feedback** — settings-btn/save/sections un-gated; `feedback.py` no longer 403s guests on POST/GET; vault feedback thread labels `guest_*` users as **Guest**; guest logout shows a permanent-deletion warning.
- **Device notifications** — `devicePush` now also fires real `new Notification(...)` for broadcasts and AI replies; permission requested for everyone (incl. guests) after 2s.
- **Maintenance-off note popup** — Owner prompted (vault) for a "what was fixed" note on toggling OFF; stored in `system_settings` key `maint_note`, exposed via `/api/admin/system/public`; `app.js` `_maybeShowMaintNote()` shows a fullscreen "What Was Fixed During The Break" popup (session+localStorage dedup), wired into both the pending-notification path and the `_syncPersistentScreen` lift.
- **Offline math + rotation** — wording now "The value for X is Y" (Python + JS engines); directory entries support `answers[]` rotation (localStorage counter client-side, per-minute bucket server-side); added new common questions (can-you-hear-me, who-owns-zenith, contact-admin, meaning-of-life, joke).
- **Voice double-speech fixed** — `voice.js sendVoiceMode` no longer calls `speak()` after `Chat` already auto-speaks (chat.js:573), and the redundant `onend` override block in `speak()` was removed.
- **Display name real-time** — `user_settings.py` PATCH now also mirrors `User.display_name` (the field `/api/auth/me` uses), and `settings.js` calls a new `window.__applyDisplayName` hook after saving.

---


## 1. CRITICAL — Security findings

### 1.1 Hardcoded admin secret (backdoor)
- `auth.py:300` — `ADMIN_SECRET = "zenith-admin-2026"`
- Verified referenced in `vault.js:1282` (create-admin form posts `secret: 'zenith-admin-2026'`).
- **Impact:** The secret is in the client-side JS and the backend. Anyone who reads the vault
  JS (publicly served) can create admin accounts. This is a serious backdoor.
- **Fix:** Move to an env var / system setting, never ship in frontend JS. Require the secret only
  from the owner, or replace the whole "create admin by secret" flow with owner-only actions.

### 1.2 Hardcoded OpenRouter fallback API key
- `ai.py:22` — a real `sk-or-v1-...` key is assembled from 5 string fragments in source.
- **Impact:** The key is public in the git history / repo. Anyone with the source can use/rotate it
  and run up costs. (The `ai.py:19` path correctly reads from env, but this fallback is hardcoded.)
- **Fix:** Remove the hardcoded fragments; rely on `OPENROUTER_API_KEYS` env only.

### 1.3 Plaintext password exposure endpoint
- `auth.py:282-288` — `GET /api/auth/password-changed/view` returns the pending password **in plaintext**
  in the response body. (Used so the affected user can read their new password after an admin reset.)
- **Impact:** The new password is sent in the clear over the wire and visible in devtools/network logs.
- **Fix:** This is a deliberate UX feature but a risk. Consider showing it once with a TTL,
  or using a one-time token, or masking; at minimum restrict to the target user (it already does)
  and consider HTTP-only delivery.

### 1.4 `KeyError` on malformed token (unhandled 500)
- `auth.py:116` — `user_id = int(payload["sub"])` raises `KeyError` if the token decodes but lacks `sub`.
- **Impact:** A crafted token triggers an unhandled 500 instead of a clean 401.
- **Fix:** Use `payload.get("sub")` and raise 401 if missing/invalid.

### 1.5 DOM-based XSS in app.js
- `app.js:272` — `user.username` is interpolated raw into `innerHTML` in the avatar popup.
- **Impact:** If a username can ever contain HTML (e.g., `</div><script>...`), it executes in the
  viewer's session. Registration generally restricts usernames, so severity is low, but it's a
  fragile pattern.
- **Fix:** Escape via the same `safe()` helper used elsewhere (`const d = document.createElement('div'); d.textContent=s; return d.innerHTML;`).

---

## 2. HIGH — Inconsistency / correctness

### 2.1 Maintenance login doesn't exempt chosen helpers
- `auth.py:214` — login check only exempts the owner (`get_role(user) != "owner"` rejects everyone in
  maintenance mode), but the rest of the shutdown logic (maintenance screen, lock-all, force-logout)
  exempts **chosen helpers**.
- **Impact:** A chosen helper who logs OUT during maintenance can't log back IN, even though the
  entire point of the chosen-helpers feature is to let them assist. Broken/inconsistent.
- **Fix:** Allow chosen helpers (`user.is_chosen`) to log in during maintenance too.

### 2.2 Duplicate conflicting `showToast` definitions
- `api.js:4` defines `showToast` (uses a single `toastTimer`); `confirm.js:62` re-defines `showToast`.
- Because `confirm.js` loads after `api.js` on every page, **confirm.js's version wins**. It is actually
  the more robust one (reuses `#toast` or builds its own container), so behavior is OK today, but the
  duplicate is a maintenance hazard — small edits to one won't affect the other.
- **Fix:** Keep one reference implementation and delete the other.

### 2.3 `emBackup` always "succeeds"
- `vault.js:1476` — `catch (e) { showToast(e.message || 'Backup created', 'success'); }`
- **Impact:** Even when the backup API call fails, it's reported as a success toast. Misleading; you may
  believe you have a backup when you don't.
- **Fix:** Use `'error'` type in the catch and surface the real failure.

### 2.4 Global `console.log` override in code sandbox
- `codeexec.js:60` — `console.log = (...a) => logs.push(...)` replaces the app's global `console.log`,
  restored at `codeexec.js:62`. If the restore doesn't run (an exception between the two), the app's
  real console logging is broken for the session.
- **Impact:** Debugging becomes impossible; could mask other errors.
- **Fix:** Use a scoped monkey-patch with `try/finally`, or capture via a custom `window.console` wrapper.

### 2.5 Promote/demote popup dismiss may reload the whole page (user report)
- Dismiss button at `app.js:737` only removes the popup DOM (`this.closest('#role-notif-popup').remove()`),
  which is correct. But the 10s re-auth check at `app.js:339-345` redirects to `/` on any
  "Session expired/Not authenticated" message. After a role change the session/token version is often
  bumped, so the next poll can trigger a full logout/reload instead of just refreshing the UI.
- **Status:** Investigated; not yet fixed (read-only). Likely the root of the "whole page reloads"
  observation. Recommend revisiting after this report.

---

## 3. MEDIUM — Robustness / UX

- **Notification dedup race** (`app.js`): The `_lastHandled` tracker compares only the string value of
  `pending_notification`, so two different events with the same string can't be distinguished, and the
  poll clears via `/me/clear-notification`. Edge cases exist where a value is skipped if it changes too
  fast between two 1s polls.
- **Stacking upgrade modals** (`billing.js:114-124`): multiple 429/upgrade prompts could stack rather than
  replace.
- **Intervals for banned/blocked users** (`app.js`): the broadcast/presence/heartbeat intervals are started
  for everyone; banned users are handled with a full-screen overlay, but some intervals keep firing.
- **Maintenance/lock screens**: intentionally persistent full-screen ("like the offline screen"), which is
  the desired behavior — noted for completeness, not as a bug.

---

## 4. LOW — Naming / cosmetic

- `app.js:827` — animation keyframe referenced as `animation:faceIn` (typo for `fadeIn`); no animation plays.
- `app.js:119` & others — multiple `setInterval(checkNotif, 1000)`-style 1s polls run even in background tabs;
  minor battery/network overhead.
- `vault.html` does not load `app.js` (by design) — this was the **root cause** of the broadcast gap (see below).

---

## 5. What was FIXED this session (broadcast delivery — you authorized)

**Root cause:** Broadcast popups were delivered ONLY through the 1s `/api/announcements/feed` poll that
lives inside `app.js` (app.html). **Admins spend their time in the vault (`/vault`)**, which loads
`vault.js` instead of `app.js`, so admins never received broadcast popups while in the vault. Regular
broadcasts have no `pending_notification` fallback (unlike emergencies), so they relied entirely on that
feed poll.

Changes:
- **vault.js** — added `pollBroadcasts()` (2s) + `_showVaultBroadcast()` popup so staff in the vault now
  receive broadcasts (self-contained, uses `api.js`'s `showEmergencyPopup` for `[EMERGENCY:...]`).
  Shares `zenith_last_ann_id` / `zenith_last_ann_seen` localStorage with app.js so no popup is shown twice
  across the two pages.
- **app.js** — simplified/hardened the broadcast delivery so every undismissed, non-self broadcast with
  `id > seen` reliably pops (previously the first-load path only showed the latest; now it reliably shows
  the backlog). Extra broadcasts marked as seen to avoid re-show on reload; `[EMERGENCY:]` markers left
  unmarked so persistent maintenance/lock screens re-apply on reload.
- **sw.js** — bumped cache to `zenith-v23`.

### Follow-up root-cause fix (why "two accounts still didn't receive it")
The dedup cursor (`zenith_last_ann_id` / `zenith_last_ann_seen`) was stored **globally in localStorage**,
which is **shared across accounts in the same browser**. When you send a broadcast from account A, that
account's poll advances the shared cursor past the new broadcast's id; logging into account B in the same
browser then sees `id <= seen` and **never shows it**. Fixed by keying the dedup state **per-user**
(`zenith_ann_id_<username>` / `zenith_ann_seen_<username>`) in both `app.js` and `vault.js`, so each
account tracks its own "seen" cursor independently.

**Verify:** deploy, then log into TWO accounts in the same browser (send a broadcast from one) — the other
must now show the popup. Note: a user never sees their OWN broadcast (by design, `a.user_id !== user.id`).

---

## Priority recommendation
1. Fix the hardcoded ADMIN_SECRET + hardcoded AI key (remove from source, move to env). ← do first
2. Allow chosen helpers through the maintenance **login** check.
3. Fix the malformed-token `KeyError` and the password-view plaintext exposure.
4. `emBackup` error handling; single `showToast`.
5. Investigate the role-change "page reload" with the 10s session check.
