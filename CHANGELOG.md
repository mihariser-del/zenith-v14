# Changelog

## 22.2 — Slash commands, sign-up without email, Google button switch

- `static/js/slash.js`: "/" menu on `#user-input` (filter, ↑↓, Enter/Tab, Esc; document-level capture so it runs before the send handler). Create (/image, /video), modes (/think, /research, /fact), quick asks (/summarize, /shorter, /simpler, /longer, /translate, /fix, /explain, /continue), app (/remember, /memory, /personality [name], /new, /search, /share, /files, /invite, /feedback, /settings, /help) with aliases. Text that starts with "/" but matches no command is sent as a normal message
- `POST /api/auth/register` accepts `skip_email` (placeholder `…@noemail.local`, `email_status=""`). `emailcheck.state()`: every account without a good email gets `EMAIL_GRACE_DAYS` — from sign-up for new accounts — instead of new accounts being blocked at once. Checkbox on the sign-up and invite forms
- Google Identity Services rejects the site origin for the configured client ID (403 on the button, "The given origin is not allowed for the given client ID"), which can only be fixed in Google Cloud Console → Credentials → Authorised JavaScript origins. New `google_signin` system setting (default off) hides the buttons on `/`, the login card and the invite page; `POST /api/vault/google-signin` (owner) + a Vault Settings card with the steps

## 22.1.1 — Invite rewards back to normal

- Ladder (1/3/5/10/25) and the friend's 3-day gift removed. `invites.settle()` gives 3 days of Pro per 5 counted friends (`users.invite_rewards` = number of rewards given). One-time `invite_v3` migration recomputes that number and caps or ends `invite_pro` / `invite_ultimate` time the ladder handed out
- Friends list, leaderboard, link-open count and "counts once the friend is active" stay

## 22.1 — Personality studio, memory, invites, real emails, team chat, security pass

**Personality** (`persona.py`, `static/js/persona.js`)
- Ten personalities, five sliders (warmth, humour, detail, formality, emoji), nickname, "about you", reply language, up to 6 custom personalities, live preview (`POST /api/personality/preview`, 20/h). Stored as JSON in `user_settings.persona`
- `style_block()` is appended to the system prompt; the user's own instructions (old "system prompt" box) no longer *replace* the base prompt. Research / fact-check modes ignore it. Mirror keeps working on top

**Memory** (`memories.py`, `static/js/memory.js`)
- Categories, pin, source (you / learned), use counter; `for_prompt()` sends pinned + best keyword matches + newest (22 max) and honours the Memory switch (it used to send the latest 30 even when switched off)
- Extraction returns structured items, updates an existing memory instead of adding a near-copy, reads only the user's own messages, skips secrets; `POST /tidy` (dedupe + model-assisted merge/re-file), `GET /export`, `POST /forget-all`, 300 max

**Invites** (`invites.py`, `static/js/invite.js`)
- Ladder 1/3/5/10/25 friends → 3/7/14/30 days Pro, 30 days Ultimate; an invite counts when the friend has a valid email and 3 messages; the friend gets 3 days Pro. `GET /api/invite/overview` (link, opens, ladder, friends, monthly leaderboard). Old `/api/referral/claim` and the 5-for-3-days auto reward removed

**Email** (`emailcheck.py`, `static/js/account.js`)
- `check_email()`: format, typo hints, placeholder / throw-away domains, MX/A lookup over DNS-over-HTTPS. `users.email_status` ""/checked/verified. With `BREVO_API_KEY` + `SMTP_FROM` (or SMTP) a 6-digit code confirms the address; without it a checked address is accepted
- Accounts created before 2026-11-12 get `EMAIL_GRACE_DAYS` (7) from their first prompt, then `limits.check_limit` returns 403 + `X-Email-Required`; new accounts need one at sign-up. Owner is asked but never locked; guests are exempt
- `GET /api/vault/email`, `POST /api/vault/email/test`

**Plans**
- `BILLING_LIVE=1` (+ Stripe secret + webhook secret) is required to sell; otherwise `create-checkout` returns 503 and the UI shows "Coming soon" with `POST /api/billing/notify-me` (`plan_interest`). The mock path that granted any plan for free is removed; checkout return URLs must be on `APP_BASE_URL`
- `pro_trial`, `referral_pro`, `invite_*` now end at `trial_end` (`limits._is_pro`, `expire_timed_plans()` every 5 min) — they used to stay Pro forever

**Team chat** (`staff.py`, `static/js/staff.js`): replies, reactions, edit/delete, typing, online list

**Security**
- Google sign-in: audience must match the site's client ID (it was skipped when `GOOGLE_CLIENT_ID` was unset), issuer + `email_verified` checked, banned/deleted accounts refused; first Google sign-in to an unconfirmed account resets its password and sessions
- `/api/auth/admin/{dashboard,users,users/{id}/chats,ban,unban,reset-password,role}` and `DELETE /users/{id}` now require the Vault token; the token is bound to the user who unlocked
- Password reset bumps `token_version`; passwords ≥ 8; usernames limited to `[A-Za-z0-9_.-]{3,30}`
- `/docs`, `/redoc`, `/openapi.json` off unless `API_DOCS=1`; `X-Content-Type-Options`, `X-Frame-Options`, `frame-ancestors`, `Referrer-Policy`, HSTS, `no-store` on JSON; webhook errors no longer echo exception text

## 22.0 — Feedback rework

- `feedback.py` rewritten. Tables `fb_tickets`, `fb_messages`, `fb_votes`, `answer_ratings`, `fb_pulse`; old `feedbacks` / `user_requests` rows are copied in once at startup (`fb_migrated` setting). `personal_requests.py` and `/api/requests/*` removed
- People (`/api/feedback`): create (multipart: kind bug/idea/praise/problem/request, 1–5 stars, screenshot ≤5 MB png/jpg/webp/gif stored under `UPLOAD_DIR/feedback`, served only to the author and staff), `/mine`, `/{id}` thread, `/{id}/reply`, delete, `/unread`, `/ideas` + `/{id}/vote`, `/rate` + `/ratings` (thumbs on AI answers with reasons), `/pulse` ("How is Zelpophai so far?": ≥2 days old account, ≥12 messages, at most every 30 days). Guests can send (3/hour; no personal requests, public ideas or votes); everything is rate-limited
- Ideas go public at once when the author agrees and the safety filter finds nothing, unless "Check ideas before they go public" is on (`fb_ideas_review`)
- Staff (`/api/vault/feedback`, behind the Vault PIN): inbox with counts/KPIs/search/filters, thread (opening marks it Seen), reply (+ optional status), update (status with a system note to the user, type, board visibility, title, official answer), delete, `/insights` (stars, thumbs, reasons, latest thumbs-down with question + answer; staff chats hidden from admins), `/summary` (light model, JSON, saved in settings; feedback text is passed as data), `/settings`
- App: `static/js/feedback.js` + `static/css/feedback.css` (`zfb-` classes): Send / My feedback / Ideas board modal, reply card + system notification, badge, pulse card, thumbs under answers (`ZPFeedback.attachRating` from `chat.js`). Old feedback/request modals, inbox popups and the Personal Request button removed
- Vault: People → Feedback (`#/feedback`, `/ideas`, `/answers`, `/summary`, `/{id}`) with a nav badge

## 21.9.2 — Classic Vault merged, plan countdowns

- `/vault/classic` now redirects to `/vault`; the sidebar link and palette action are gone
- New Vault pages: **Conversations** (`/api/auth/admin/analytics/all-chats|all-messages`, chat viewer via `/chat/{id}/messages`), **Security & emergency** (owner; `GET /api/vault/security`: 24 h sign-ins/failures, 7-day chart, top failed accounts/IPs, psutil server health; lock-all/unlock-all, maintenance, `/api/admin/system/backup` download, `/api/auth/emergency-password`, force-logout), **Staff & permissions** (owner; `GET /api/vault/staff`; role, trusted tag, `/users/{id}/permissions`, `set-chosen`), **Settings & exports** (`/api/auth/admin/pin-change`, users/chats/messages exports)
- Users: multi-select + `/api/auth/admin/users/bulk-delete`; User 360: Export data, Permissions (admins), clickable chats
- Exports and downloads go through the token-aware `api()` (plain links were refused with "Vault is locked")
- `plan_info` on `GET /api/vault/users/{id}`: kind (renews/ends/trial/gift/forever/friend/free), end date from Stripe (`current_period_end`/`cancel_at`, cached 10 min) or estimated from the last Stripe payment, trial/gift end, price (owner only); plan pill with live countdown + countdown modal

## 21.9.1 — Vault charts fix

- Chart.js 4.4.1 is self-hosted at `/static/vendor/chart-4.4.1.umd.min.js` (was cdnjs; when the CDN was blocked every chart rendered as an empty card)
- Chart helpers are wrapped individually (`safe()`); a failed chart shows "Charts couldn't load" / "This chart couldn't be drawn" with the reason instead of a blank box, and never stops the other charts

## 21.9 — New Vault

- New Vault SPA at `/vault` (`static/vault2.html`, `static/css/vault2.css`, `static/js/vault2.js`; Chart.js 4.4.1): Overview, Growth & revenue, AI cost & usage (owner), Live monitor, Users + User 360, Friends & customers, Content safety, Controls & broadcast, App releases, Backups & data (owner), Activity log; date ranges 24h/7d/30d/90d, dark/light, mobile drawer, Ctrl+K command palette, alerts bell + desktop notifications, PIN lockscreen (same `X-Vault-Token` flow, 15-minute idle lock). Old Vault kept at `/vault/classic`
- `vault_api.py` (`/api/vault/*`, all behind `require_vault`; revenue, AI, backups and plan gifts owner-only): overview, growth (cohorts, invites, revenue), ai, live, alerts, users, users/{id} (360), notes, plan gifts (`gift_ultimate_until` handled in `limits.py`), people, safety, releases, backups, search
- New tables: `ai_usage`, `payments`, `admin_notes`, `error_events`, `vault_alerts`, `content_flags`, `client_seen`
- `ai_meter.py`: every AI call (chat, search, titles, router, Mini, voice, code, news, video) is recorded with estimated tokens (chars/4) × OpenRouter public prices (cached 12 h); credit from `/api/v1/credits`
- `vault_events.py`: 5xx/exception and AI-stream error logging, app/platform/version tracking from the User-Agent, conservative safety filters on user messages (self-harm, violence, sexual content involving minors, hate) and `POST /api/s/{share_id}/report` (5/hour per IP; "Report this chat" on shared pages)
- `vault_jobs.py`: daily SQLite snapshot (backup API, newest `VAULT_KEEP_BACKUPS`=14 kept) under the volume's `backups/`; restore swaps the file at next start (`RESTORE_PENDING`, a `before-restore` copy is kept) and restarts; alert checks every 5 min (`ALERT_CREDIT_USD`=5, `ALERT_SIGNUPS_PER_HOUR`=25), each kind at most once an hour
- `billing.py` records a `Payment` on Stripe `checkout.session.completed`

## 21.8 — Auto search & models, greetings, Mini login, antivirus fix (Windows app 1.4.0)

- `router_ai.py`: `plan_request()` asks a small fast model (`CHAT_ROUTER_MODEL`, 4.5 s limit; rules as fallback; small talk skips it) whether a message needs the **web**, a **heavy** model and **photos**
- Models chosen per message: `CHAT_MODEL_LIGHT` (openai/gpt-6-luna) or `CHAT_MODEL_HEAVY` (openai/gpt-6-sol; also for Think, Research/Fact, file requests). Model pickers hidden for everyone but the Owner (Owner: "Auto" or a pinned model, stored as `pin:<id>`); `PATCH /api/settings` and `/api/chats/{id}/prefs` ignore model changes from non-owners
- Web answers: SSE `{"status":"searching","query"}` → "Searching the web…" pill; `web_answer()` (`CHAT_SEARCH_MODEL`, perplexity/sonar) reads sources from `citations` / `search_results` / `annotations`; `cite()` turns [1] markers into clickable source chips and appends a **Sources** list with page titles; if search fails the AI answers normally and says so
- Photos: `web_images()` (Wikipedia page images, Openverse fallback; openly licensed) shown as a gallery above the answer, each linking to its source page; broken images hide themselves
- AI context: recent chats (title, when, last question) and greeting behaviour ("hello" → greet by name + offer to continue); Owner privacy rule (no personal info about Wanzu; people who know him are congratulated and pointed to a Friend request)
- New-chat screen greeting card (`GET /api/chats/greeting`): time-of-day greeting by name, last chat with Continue chips; guests get a welcome + sign-up chip
- Zelpophai Mini re-checks the shared login every time it opens or gets focus (sign in/out in the app is picked up immediately)
- Theme switch now also sets `html.light-theme`, so the sidebar and app shell change too
- One-time Owner Vault PIN reset (bcrypt hash only; marker file prevents re-runs)
- Windows app 1.4.0: Mini's input moved from a PowerShell `-EncodedCommand` + runtime-compiled `SendInput` helper (a classic antivirus trigger) to the prebuilt native module `@nut-tree-fork/libnut-win32` (unpacked from the asar)

## 21.7 — Always up to date, custom installer (Windows app 1.3.0)

- Pages and app code (`.js`, `.css`, `.html`, `.json`, HTML routes) are now sent with `Cache-Control: no-cache` (a quick 304 when unchanged), so browsers and the apps no longer keep old copies after a deploy
- `GET /api/version` → `{version, build}` (`build` = Railway deployment id); `static/js/freshness.js` (app, Coding AGT., Mini) checks it on focus, every 10 min and when back online: hidden windows (e.g. the Windows app in the tray) reload silently; visible ones show a "Zelpophai was updated · Refresh" bar and reload the next time they're hidden unless something is being typed or streamed (`window.zpBusy` hook)
- Windows app clears its HTTP cache on every launch (sign-ins and settings are kept)
- Custom NSIS installer (`desktop/build/installer.nsh` + artwork): branded welcome with **Install** (current user, desktop shortcut, opens the app and closes — no other pages) and **Customize installation** (folder, desktop shortcut, Start with Windows, finish page with "Open Zelpophai AI now"), Terms/Privacy links, branded header/sidebar/icon and uninstaller; options are handed to the app via `%APPDATA%\Zelpophai AI\installer-options.json`; silent auto-updates skip all pages and keep the user's choices

## 21.6 — Privacy & Terms, real welcome preview

- `/privacy` and `/terms` (also `/privacy-policy`, `/terms-of-service`): plain-language Privacy Policy and Terms (`static/legal/`, `static/css/legal.css`); contact line from `CONTACT_EMAIL` (otherwise points to Feedback / Personal Request in the app); added to the sitemap
- Linked from the welcome footer, the sign-up form and guest/Google login ("By creating an account you agree…"), the invite page, shared chats, download, What's new and the app's About box
- Welcome preview is now real output (`showcase.py`, `GET /api/showcase`): cover letter `.docx` made by the app's document generator (downloadable), a real image from the site's image provider, today's top headlines from a web-search model (`SHOWCASE_NEWS_MODEL`, default perplexity/sonar; cached 6 h, written in the model's own words with source links), and a video the Owner picks
- Owner: "⭐ Show on welcome page" under generated images and videos in chats (`POST /api/showcase`, owner only, only `/api/image/serve/…` and `/api/video/serve/…` files); the video example stays hidden until one is chosen
- "Try this yourself" under each example signs the visitor in as a guest and fills that prompt into the message box

## 21.5.1 — Mini opens installed apps, Owner unlimited (Windows app 1.2.0)

- New Do action `launch` `{app}`: the app lists everything in the Start menu (`Get-StartApps`, so Store apps like Minecraft Launcher too) plus Start-menu/desktop `.lnk`/`.url` shortcuts (Steam games, Roblox, VPN clients), sends the names with each step (`apps`, max 400), and launches the best name match via `shell:AppsFolder\<AppID>` or the shortcut. Only apps from that list can be launched; names like Uninstall/Reset/Command Prompt/PowerShell are marked risky
- Owner: no daily limit for Zelpophai Mini (`tier "owner"`, `left: null` → "Unlimited") and up to 150 steps per task; Coding AGT. is unlimited for the Owner too

## 21.5 — Zelpophai Mini (Windows app 1.1.0)

- **Ctrl+Shift+Z** (tray toggle to turn it off) screenshots the display under the mouse, then opens a small always-on-top panel loading `/mini` (`static/mini.html`, `static/js/mini.js`, `static/css/mini.css`)
- **Ask mode** (`POST /api/mini/ask`, streams): screenshot or a dragged **area** (`desktop/region.html` overlay), optional **clipboard**, quick actions (Explain, Summarise, Translate, Fix/rewrite, Reply, Extract text), answers rendered with `render.js`, **Copy** / **Paste into app** (clipboard + Ctrl+V into the window underneath) / Open in Zelpophai
- **Do mode** (`POST /api/mini/step`): fresh screenshot each step → model returns ≤4 JSON actions (click, double/right click, move, drag, type, key combos, scroll, wait, open URL); server validates/clamps them and forces `risky` on dangerous key combos; the panel asks before each action (or only risky ones after "Allow all"), Skip/Stop, Esc (global, only while running) stops; max 40 steps / 120 actions; one-time native "Allow Mini to use your PC?" dialog
- Input on Windows: `desktop/input.js` keeps one hidden PowerShell process with a small C# `SendInput` helper (DPI aware); screenshot → screen mapping via `screen.dipToScreenPoint`
- **Voice**: MediaRecorder → 16 kHz WAV → `POST /api/mini/transcribe` (Whisper key if set, otherwise `MINI_AGENT_AUDIO_MODEL` via OpenRouter `input_audio`)
- **History**: every answer / task summary saved to a daily "Zelpophai Mini — <date>" chat in the "Mini agent" folder (`POST /api/mini/save`)
- Limits per day (`UsageLog` action `mini_agent`, each ask or Do step counts): guests none, free 20, Pro 300, Ultimate/Friend/staff 1000 (`MINI_AGENT_DAILY_*`). Models: `MINI_AGENT_MODEL(_FREE)` (default google/gemini-3.8-flash), `MINI_AGENT_DO_MODEL` (anthropic/claude-sonnet-5.5), `MINI_AGENT_DO_MODEL_FREE` (google/gemini-3.8-flash)
- Prompts treat on-screen text as content, never instructions; Mini never types passwords, card numbers or one-time codes

## 21.4.2 — Search engines

- Sitemap now lists `/`, `/download` and `/whats-new` with `lastmod` (deploy date); dropped `/invite.html` (it's noindex)
- Landing: clearer title/description/OG/Twitter text (chat, pictures, videos, files, Coding AGT., apps), richer `SoftwareApplication` JSON-LD (Windows/Android, downloadUrl, featureList, author); only one `<h1>` (login card title is now `<h2>`)
- `/download` and `/whats-new`: canonical URLs, robots index, OG/Twitter tags; `/download` gets `SoftwareApplication` JSON-LD
- IndexNow: key served at `/<INDEXNOW_KEY>.txt`; about a minute after each deploy the public pages are submitted to Bing, Yandex and other IndexNow engines (`INDEXNOW_DISABLE=1` turns it off)
- Google / Bing ownership: set `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION` in Railway (already supported)

## 21.4.1 — Sidebar icon row cleanup

- Icon row reduced to Upgrade, Vault (staff), Settings, Invite, What's new, Get the app and **More (⋯)**; all 34px squares, no wrapping, no stray borders in light theme
- `sidebar.js` builds the More menu (Feedback, Personal Request, Security, About, Clear All History) by moving the existing buttons, so their handlers keep working; counts show as pills in the menu and a red dot on More; closes on outside click, item click or Escape

## 21.4 — What's new redesign, shared page extras

- **What's new** (`static/js/whatsnew.js`, replaces `#changelog-modal`): entries split into title + description, max 5 cards with keyword-based **Try it** buttons (open Coding AGT., get the app, invite, prefill a picture/video/reminder/file request), staff extras counted ("Vault → Changelog"), "All updates" link
- Popup queue (`ZPWhatsNew.whenFree`): waits until no tag card, greeting, limit, maintenance, broadcast or other modal is open
- Welcome tour (4 steps with a highlight ring) for accounts under 2 days old and guests, once per device; replaces the full changelog dump new users used to get. `UserResponse.created_at` added
- Sidebar ✨ What's new icon with a dot for unseen versions; `/whats-new` full history page, grouped by version (`GET /api/changelog/all`)
- Deep links: `/app?ask=<text>` prefills the message box, `/app?do=invite` opens Invite Friends, `/?login=register` opens sign-up
- **Shared page** rebuilt: uses `render.js` (`publicView` mode: file cards show the content but no owner-only download/preview links), user bubbles, unboxed answers, copy per answer, Copy link / Copy chat, compact reactions, long answers folded
- **Continue this chat** (`POST /api/s/{id}/continue`): copies the public snapshot (attachments as names, sharer's file tags turned into text) into the visitor's chats, max 200 messages and 30 per day; logged-out visitors are sent to sign up / log in and the copy happens on arrival in /app

## 21.3 — Invite page redesign

- `static/invite.html` rebuilt: "<name> invited you" badge, perks, gift note, **Continue with Google** (hidden inside the apps), username/email/password form with show-password, clear expired/used/already-joined states; mobile layout
- Google sign-up now credits invites: `GoogleAuthRequest` takes `invite_token` + `device_id`; invite checks refactored into `_invite_guard` / `_invite_apply` in `auth.py` (shared by register and Google)
- Invite Friends modal: 5-step progress, joined / to go / rewarded stats, copy link, native share, WhatsApp, Telegram, X, lazy-loaded QR code
- `/?login=1` opens the login form directly

## 21.2 — New Coding AGT., Windows & Android apps

- **Coding AGT. rebuilt** (`codeagent.py`, `static/coding-agent.html`, `static/js/coding-agent.js`, `static/css/coding-agent.css`): saved projects (`code_projects` table), file tree, tabs, CodeMirror editor, live web preview with console capture, Python via Pyodide in a Web Worker (packages auto-loaded, matplotlib charts shown in the console), SQL via sql.js, templates (website, Python, data analysis, game, SQL, blank), share read-only links (`/code/<id>`, "Open my own copy"), .zip download, mobile tab layout
- **AI coding agent** (`POST /api/code/agent`, streams): sees the project, active file, selection and console; proposes whole-file changes as `<zfile>` blocks shown as change cards with +/− counts, a line diff view, Apply / Apply all (undo-able); "Fix with AI" sends the error. Daily limits: guest 2, free 5, Pro 60, Ultimate/Friend/staff 200 (`CODE_AGENT_DAILY_*`); models `CODE_AGENT_MODEL(_FREE)`
- Free users and guests see a warning banner about the website's limits with **Download the app** / Upgrade
- **Windows app** (`desktop/`, Electron 33): tray, notifications, Ctrl+Shift+Space quick ask, start with Windows, close-to-tray, offline page, downloads with notifications, Google sign-in opens in the browser, self-updates (`electron-updater`, generic provider at `/downloads/win`) with a "Restart & update" prompt, and **local code running** for Coding AGT. (`runner.js`: Python, Node, Java, C/C++, Go, Ruby, PHP; asks first, temp folder, 2-minute limit)
- **Android app** (`android-app/`, Capacitor 6): live site in an app, file downloads with login, mic/camera permissions, and an in-app "update available → Install" prompt
- **Downloads** (`appdist.py`): `/download` page, `/downloads/<platform>/<file>` on the Railway volume, `/api/app/latest`, token-protected `POST /api/app/upload`; "Get the app" icon in the sidebar (hidden inside the apps)
- Sidebar entry renamed from "Run Code" to "Coding AGT."

## 21.1 — Shared chat privacy

- Attached-file contents never appear on a shared page: user messages show "📎 file name" instead (`_public_message_text`)
- Owner can hide their name ("Anonymous"); otherwise the display name is shown instead of the username
- Shares are snapshots (`chats.share_upto`): only messages up to the moment of sharing are public; the share modal shows how many newer messages exist and an **Update link** button; reactions only work on snapshot messages
- `/s/{id}` is now rendered server-side with the chat's real title, a summary of the first answer, `og:url`, Twitter card tags and `noindex`, so link previews in WhatsApp/X/Telegram/Facebook look right

## 21.0 — AI tools, Friend & Trusted Admin tags, Vault PIN

- **AI knows its tools** (`tools_prompt.py`): every reply's instructions now list each real feature, how it's triggered, the user's plan, what's left today (images, files, videos), memory on/off, and who the user is (guest, Friend, Admin, Trusted Admin, Owner). The user's local time zone is sent with each message
- **AI uses tools itself**: it can write `<zimage prompt shape>` (or `edit="true"` to change the last picture), `<zvideo prompt seconds shape>` and `<zremind at repeat>`; `ai.py` carries them out after the reply (limits and plans enforced, max 4 images / 1 video / 5 reminders per reply) and swaps in the picture, a "video is coming" note (the clip lands in the chat by itself) or a "Reminder set" card. While working, the chat shows a small "Creating your image…" card
- **Friend tag** (owner-only, from the Vault user list 🤝): teal FRIEND badge, Ultimate-level limits, 15 videos/day on the faster model (`VIDEO_DAILY_FRIEND`), early access, and the AI treats them as a friend of Wanzu; a welcome card pops up for them
- **Trusted Admin tag** (owner-only, 🛡️ on admins): Global Controls (maintenance, registrations, messaging, AI on/off), password resets/unbans/ban/delete without the per-admin permission switches, login during maintenance, TRUSTED badge and "Trusted Vault" label. Emergency controls, admin management, backups and the owner account stay owner-only. Demoting an admin removes the tag
- **Vault button** now goes straight to the PIN page and clears any earlier unlock in that tab
- Image and video generation were split into reusable helpers (`image.make_image`, `image.edit_last_image`, `video.start_video_job`, `video.video_allowance`)

## 20.9 — Tools on top, icon row below

- **Sidebar**: Files, Memory, Knowledge, Reminders and Run Code (plus Live Chat and Broadcast for staff) sit under New Chat as compact rows; a "Chats" label separates them from your conversations
- **Below the chats**: one row of word-free icons — Upgrade (gold crown), Settings, Feedback, Personal Request, Invite Friends, Security, About, Clear history (plus Owner/Admin Vault for staff) — with tooltips on hover and a red dot for unread feedback/requests; your name with a log-out icon underneath. The account pop-up menu from 20.8 is gone. Memory got its own sparkle icon (it shared the clock with Reminders)
- Icon rail (901–1100px) shows everything as icons; phone drawer uses the same layout with bigger touch targets

## 20.8 — Unboxed answers, tidy sidebar

- **AI answers without a box** (`static/css/layout.css`): replies render straight on the page in a centred 780px reading column with a small Z mark in the margin (hidden on phones); headings left-aligned; reply buttons are borderless and appear on hover (always visible on the latest reply and on touch screens); user bubbles stay compact
- **Sidebar decluttered**: brand, New Chat, chat list, a slim Upgrade line and your name. Everything else (Settings, Reminders, Personal Request, Feedback, Invite Friends, Files, Security, Memory, Knowledge, staff tools, Run Code, About, Clear All History, Log out) moved into an account menu that opens from your name (`static/js/sidebar.js`): keyboard and Escape support, closes on outside click, floats beside the icon rail on mid-size screens, and shows a red count on your name when feedback / request / live-chat badges are waiting

## 20.7 — Real file generation, better answers, security fixes

- **File generation rebuilt** (`docgen.py`): the AI wraps each file in `<zfile name="…">`; the server turns it into a real file, stores it (with its Markdown source for previews), and the chat shows a file card with **Preview**, **Download** and **Show text**. Cards survive reloads, files are versioned when the AI edits them, and if the AI forgets the tag the reply still becomes the file. One parser (mistune) feeds every format:
  - **Word**: styled headings, bold/italic/links, nested and tick lists, shaded tables with repeating headers, code boxes, callouts, page X of Y footer; letters and CVs skip the report header
  - **PDF**: brand ribbon, page numbers, real tables with proportional columns, code boxes, callouts, Unicode fonts (DejaVu bundled in `fonts/`)
  - **PowerPoint**: dark brand design, title slide, bullet slides that split when long, 2–3 column slides from `###`, table and code slides, quote and closing slides, speaker notes from `Notes:`
  - **Excel**: numbers, money and percentages stored as real values with formats, formulas kept, bold totals, banded rows, filters and frozen headers; one sheet per table
  - Also CSV (Excel-friendly UTF-8), HTML (styled page or the AI's own page), Markdown, text and code files
  - `GET /api/generate/preview/{id}` serves a sandboxed HTML preview (CSP sandbox, owner only)
  - Long documents get up to `FILE_MAX_TOKENS` (default 8000) so they aren't cut off
- **Message rendering rebuilt** (`static/js/render.js`, `render.css`): streaming repaints at most once a frame and only highlights finished code; code blocks with language, line count, copy, wrap, download and folding for long code; tables with copy and CSV; GitHub-style callouts; tick lists; KaTeX maths (loaded on demand); source chips for web links; reply errors show a Retry button; compact actions with **Save as** (Word/PDF/MD/HTML/TXT) and native share; scrolling no longer yanks you down while you read
- **Auto chat titles**: a quick title from the first message, then a short AI-written one after the first reply (`TITLE_MODEL`)
- **Honesty**: the system prompt now includes today's date and tells the AI not to invent live facts without web results
- **Bug fixes**: citation stripping no longer deletes `arr[0]` from code or squashes indentation; free models picked by users are no longer reset on every boot; the same image prompt now gets a fresh seed; the fake "test file" shown when the AI was busy is gone
- **Security**: client IP comes from `X-Real-IP` / the right-most `X-Forwarded-For` hop (`TRUSTED_PROXY_HOPS`), so rate limits can't be dodged with a fake header; login lockouts are checked before the password and are per username + IP, so nobody can lock the owner out; `python-jose` → `PyJWT`, `PyPDF2` → `pypdf` (PDF text read in an isolated child process), FastAPI 0.162 / Starlette 1.10, python-multipart 0.0.33; marked pinned to 15.0.12
- **Light mode** uses the blue-purple brand (including for staff accounts)
- **Removed**: the offline directory (`directory.py`, `directory.js`, Offline Mode chat and the canned-answer shortcut); going offline shows a simple notice

## 20.6 — AI video, new look, welcome page

- **AI video generation** (OpenRouter video API): tap **Video** in the message box or say "make a 6 second video of…"; attach a photo and say "animate this" for image-to-video. 4/6/8-second clips, wide or tall, with sound. A live "rendering" card shows progress; the server keeps working if you close the tab and the video lands in the chat when ready, with a player and a download button. Pro: 3/day on Veo 3.1 Lite; Ultimate: 10/day on Veo 3.1 Fast; staff: 20/day. Failed clips don't count. All tunable with `VIDEO_*` env vars
- **New brand look** in the app (dark mode): blue → purple gradient, drifting light, pulsing logo with a *Think · Create · Explore* tagline, pill header, glass answer cards, rotating gradient rim on the message box, gold Upgrade plate
- **Redesigned welcome page**: clear headline, "Try it free — no sign-up" (guest) and Continue with Google up front, a live demo that plays by itself (cover letter, image, web search, video), feature cards, FAQ; restyled login card
- **Uploads persist**: uploaded files and generated documents are stored on the Railway volume, so downloads survive redeploys
- **Shared pages**: blue brand colours, the "Zelpophai AI.ai" typo is gone, reactions only under AI answers, generated videos play inline

## 20.5 — Notifications that fold away + Halloween games

- **New notifications everywhere**: alerts now drop in from the top like a phone notification, stay a few seconds (hover to pause, × to dismiss), then fold into a small circle parked in the top-right corner. Tap a circle to read it again; circles fade on their own. Pumpkin icon and orange glow during Halloween
- **Happy Halloween greeting from the AI** on login (password, Google, guest, admin) and right after creating an account: the AI "types" a personal welcome, with a pokeable jack-o'-lantern and a **Trick or Treat?** button (treat = candy rain + a joke or fact; trick = bat swarm + a shake)
- **Catch the bats**: the bats that fly across the screen can be tapped; each catch bursts into candy and keeps a running score, with milestones at 1, 5, 10 and 13
- **Poke the pumpkin logo** in the sidebar or on the welcome screen for a wobble, a candy burst and a cackle

## 20.4 — Haunted village look

- **Illustrated Halloween scene**: a blood-orange moon with a castle and bats behind the chat, a glowing lantern and jack-o'-lanterns with flickering candles on the left, a haunted house with lit windows behind an iron fence on the right
- **Chat restyled to match**: pumpkin logo with "Zelpophai **AI**" and a *Think · Create · Explore* tagline, pill-shaped chat header with a pumpkin, framed glass answer cards with a corner cobweb, serif headings with a pumpkin divider, orange action pills, a big glowing send button, and a crown-and-chevron Upgrade button
- **Welcome and login pages** use the same scene, with a Cinzel Decorative title and a pumpkin above the login card
- **Fixes**: the site now tells Google and link previews it lives at zelpophai.up.railway.app (the old zenithai address is dead), and the hidden notification toast no longer peeks in from the right edge

## 20.3 — Halloween theme

- **Seasonal Halloween theme**: pumpkin-orange accents, a jack-o'-lantern Z logo with a candle flicker, a "Happy Haunting!" greeting, a purple Upgrade button with a slime-green glow, candy-corn badges, cobwebs, a dangling spider, drifting fog and the occasional bat
- Switches on by itself from Oct 15 to Nov 2 (on each visitor's own clock) and off again afterwards; Settings → Appearance → **Seasonal Theme** lets anyone force it on or turn it off
- Lives entirely in `css/halloween.css` + `js/halloween.js`, scoped to `html.halloween`, so the normal, light, owner and admin looks are untouched; motion is disabled for people who prefer reduced motion
- **Welcome & login pages joined in**: harvest moon, graveyard skyline, spooky "WELCOME TO Zelpophai AI" title with a "Happy Halloween" tag, pumpkin START and LOGIN buttons, orange login card with a corner cobweb (same auto dates / Settings switch)
- **Phone fix**: the welcome screen kept its desktop width on phones, so the greeting and the right column of starter cards ran off-screen; it now fits in two columns

## 20.0 — Zelpophai AI rebrand & billing fix

- **Zelpophai AI is here** — the app is now called **Zelpophai AI**. Same features, same chats, same account.
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

- If Zelpophai AI is busy (too many requests at once) right when you ask for a file/document generation, instead of an empty error you get a friendly note and a **test file** you can still download
- The test file preview card has one-click download buttons for every supported format: **.md, .docx, .pdf, .pptx, .xlsx, .csv** — so you can verify the download pipeline works even while the AI is unavailable
- Also applies when regenerating a previous answer

## 19.5 — AI reads every file

- **The AI can now read your files**: uploading a PDF, Word, Excel, PowerPoint, audio or video makes the content (extracted server-side) available to Zelpophai AI so it can summarize, answer questions, edit, replicate and rewrite what you send
- **Wider upload support**: more MIME types + extension fallbacks — Office docs, spreadsheets, slides, audio (mp3/wav/m4a/ogg/opus/flac/aac), video (mp4/webm/mov/avi/mkv) and common code/text formats
- **Office extraction**: docx → paragraphs + tables (`python-docx`), xlsx → per-sheet cell text (`openpyxl`), pptx → per-slide text (`python-pptx`)
- **Audio**: metadata (duration/bitrate/format) via `mutagen` + Whisper-compatible transcription when `WHISPER_API_KEY`/`OPENAI_API_KEY` is set (`WHISPER_BASE_URL`/`WHISPER_MODEL` overrides)
- **Video**: duration probe + up to 3 key frames extracted (`imageio_ffmpeg`, bundled ffmpeg) sent to the vision model, plus audio-track transcription when a key is configured
- **Chat integration**: `chat.js` now auto-fetches `/api/files/{id}/read` for binary attachments and embeds the extracted content + video frames into the model context (capped ~12k chars/file)
- All optional libraries are import-guarded so the server degrades gracefully (marker text) instead of crashing when a dependency is missing
- New env knobs: `WHISPER_API_KEY`, `WHISPER_BASE_URL`, `WHISPER_MODEL`

## 18.2 — Security hardening

- **Code sandbox locked down**: arbitrary server code execution (`/api/code/execute`) now requires Owner login; shell/bash execution removed entirely; secrets (OpenRouter keys, SECRET_KEY) stripped from the subprocess environment
- **Hardcoded admin/owner passwords removed**: only the Owner account is auto-created now — there is **no default admin** (admins are promoted by the Owner). The Owner password comes from `OWNER_PASSWORD`; the vault → EMERGENCY tab can flip it to a fresh random 13-char value instantly when ready
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
  Zelpophai AI generates the image automatically (persisted in the chat)
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
- Document title updated to Zelpophai AI (was Zenith AI)

## 14.0 — Previous

- Initial 14.0 release
