# Changelog

## 26.4 — Twelve more tools, music, invoices, meeting notes, MP3 answers, offline drafts

- **`static/js/tools2.js`** (new): Recipe from your fridge, Exam revision planner (also makes a Study deck per subject), Language lessons (lesson count + streak in `user_data.prefs`), Story mode, Logo & poster maker, CV & job matcher, Spreadsheet helper (attaches the file and uses the existing Pyodide path), Characters (role-play; historical figures only, never living people), Make music, Invoices & quotes, Meeting notes (in-browser recording or upload), Rewards. Tools window now grouped into sections.
- **`tools.py`**: `POST /api/tools/speech` (gpt-audio-mini → MP3; markdown/tags stripped), `POST /api/tools/music` (Lyria 3 clip/pro; per-plan daily allowance via `UsageLog action=music`; files in `UPLOAD_DIR/audio`, served only to their owner by `GET /api/tools/audio/{name}`), a robust audio extractor (non-streaming reply shapes, then streamed PCM16 → WAV) and ffmpeg MP3 conversion; `POST /api/tools/invoice` (Decimal sums, running numbers per kind, PDF/Word via docgen); `POST /api/tools/meeting` (ffmpeg → 10-min 16 kHz MP3 pieces → audio-model transcripts → notes); `GET /api/tools/rewards` (17 badges + level from existing data).
- Chat: **Save as → Audio (.mp3)** on every answer; **offline drafts** (`zp_outbox` in the browser, sent in order on `online`).

## 26.3 — A better Christmas, Tools, explain levels, translate, polls and games

- **Christmas** (`christmas.js/.css`): countdown pill (Christmas → Boxing Day → New Year), Advent calendar (24 doors + a warm-up door; opens by date, remembered per browser; each door → a prompt in a new chat), Santa's sleigh every 3–6 min (tap: +3 baubles), snow caps on the composer and New Chat button, Christmas ideas on the welcome screen (MutationObserver), card maker, snow amount off/light/lots (`zp_xmas_snow`). All respect reduced motion / animations off.
- **`tools.py`** (new) + `static/js/tools.js`: `user_data` table (JSON per key: budget, spending, prefs; size-capped) with `GET/PUT /api/tools/data/{key}`; `POST /api/tools/replies` (3 replies), `POST /api/tools/translate`, `POST /api/tools/receipt` (vision → merchant/date/total/category/items, appended to spending), `GET /api/tools/briefing` (web weather/news for the saved town + reminders, jobs, due cards, projects, budget; cached 3 h per day) with a one-tap daily scheduled job. Each AI call counts as a message. Tools window, Your day, Reply writer, Budget & spending (doughnut + per-category bars, receipt photos via the camera on phones), Translate, Homework helper (new built-in assistant example).
- Every answer gets **Level** (child / simpler / adult / expert → sends a follow-up) and **Translate** (inline, remembers the language). System prompt: reply in the user's language.
- **Polls** (`polls` table, `POST /api/chats/{id}/polls`, `GET /api/polls/{id}`, `/vote`, `/close`; `<zpoll id>` message rendered as a live card, refreshed every 6 s) and **games** (five host prompts) in shared chats via Poll/Game buttons in the composer. Polls are shown to the AI as "(started a poll…)".

## 26.2 — Projects, custom assistants, Canvas and Study mode

- **`workspace.py`** (new). *Projects*: `projects` table, `chats.project_id`, files/notes in `work_items` (≤ 40, 200k chars each, text read via the normal file reader). `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/{id}` (delete keeps chats unless `chats=delete`), `POST/DELETE …/items`, `POST /api/chats/{id}/project`; `POST /api/chats` accepts `project_id`. In a project chat the AI gets the instructions, the relevant parts of the files (whole files under 9k chars, otherwise keyword-scored 1.4k chunks) and a recap of the last reply in up to 6 other project chats.
- *Custom assistants*: `assistants`, `assistant_saves`; CRUD, knowledge items, `POST /api/assistants/draft` (AI fills the form from a sentence), six built-in examples (`/from-example/{key}`), share links `/app/a/<code>` (`GET /api/assistants/shared/{code}`, `POST …/save`, `DELETE /api/assistants/saved/{id}`). Non-owners only ever receive name, emoji, description and starters. `POST /api/chats` accepts `assistant_id` (owned or saved). The AI is told to act as the assistant within Zelpophai's own rules and not to reveal its instructions.
- *Canvas*: `<zcanvas title kind lang id>` (tools prompt item 17). `canvases` table with up to 30 versions (consecutive "Your edit" saves within 5 min merge). `POST /api/canvas` (idempotent per message + slot), `GET /api/canvas/by-message/{mid}`, `GET/PATCH /api/canvas/{id}` (content, title, `restore`), `GET …/version/{i}`, `POST …/edit` (rewrite only the selected range with the text around it as context; counts as a message), `GET …/export?fmt=docx|pdf|md|txt|code`. The newest canvas in a chat is put in the system prompt so the AI edits what the person sees, by writing `<zcanvas id=…>`; the browser applies it as a new version. Members of a shared chat can open its canvases.
- **`study.py`** (new): `study_decks`, `study_cards` (SM-2: ease, interval, reps, lapses, due), `study_days` (streak in the person's time zone). Decks from a topic or notes (AI, counts as a message), from `<zdeck>` cards in a chat (`question :: answer`, tools prompt item 18), or written by hand. Review (`/review`, `/cards/{id}/grade` again/hard/good/easy), free practice when nothing is due, and multiple-choice quizzes built from the deck's own answers (no AI) that also reschedule cards.
- **Front end**: `static/js/workspace.js` + `static/css/workspace.css` — Projects, Assistants and Study windows (ZUI kit), sidebar items, project groups in the chat list, a project/assistant chip in the chat header, assistant welcome with starter buttons, the Canvas side panel (Read/Edit, selection bar with chips and free-text change, whole-document quick actions, versions, downloads; touch selection on phones), and chat cards for `<zcanvas>` and `<zdeck>` (render.js).

## 26.1 — Shared chats, charts from the calculation engine, "Hey Zelpophai"

- **Shared chats** (`groupchats.py`, new): `chat_members` table; `chats.invite_code` (unique index), `chats.is_group`; `messages.author_id`. `POST/DELETE /api/chats/{id}/invite`, `GET/POST /api/chats/join/{code}`, `GET /api/chats/{id}/people`, `DELETE /api/chats/{id}/people/{uid}` (owner removes / member leaves), `GET /api/chats/{id}/updates?after=` (new messages with author names + who Zelpophai is answering; polled every 3 s, 8 s when hidden). `/app/join/<code>` (logged out: the code waits in localStorage through login). Max 8 people. List, by-link, messages, send, react, todo and code-run allow members; rename/prefs/share/export/edit stay owner-only; member DELETE = leave; editing is refused in shared chats. `stream_chat(actor_id=)` uses the sender's settings and allowance, prefixes user turns with `[Name]:`, skips `system` notes, adds a shared-chat note and `build_system_prompt(shared=True)` drops memories.
- **Charts** (`calcengine.chart(kind, labels, series, title, x, y, money_axis)`): line, bar, area, stacked, pie, doughnut, scatter; ≤ 4 charts, ≤ 12 series, ≤ 6,000 points; validated numbers. `calcflow.card()` appends `<zchart>` (HTML-escaped JSON) after the `<zout>`; `render.js` draws them with the bundled Chart.js 4.4.1 (loaded on demand), themed for light/dark, with PNG and CSV download. Chart requests now go through the engine (attached spreadsheets still use Pyodide).
- **Android 1.2.0**: `ZpWake` microphone foreground service running Vosk (`vosk-android 0.3.47`, model `vosk-model-small-en-us-0.15` downloaded once into app storage, zip paths checked). Matches "hey/hi/ok + something that sounds like Zelpophai" by a sound-alike spelling and edit distance (needs the "l-p" sound, ≤ 2 edits from "salpafa"). Screen-on only, pauses in calls and while the assistant sheet is open, ongoing notification with Stop. Restarts when the app is opened (Android blocks microphone services from starting after a reboot). Opening the assistant from the background needs "Display over other apps", requested during set-up. Toggle in the Phone assistant sheet (`ZPApp.wake`, `ZPApp.wakeStatus`).

## 26.0 — Paste files, a calculation engine, a smarter Mini, and a phone assistant

- **Paste & drop into the composer** (`app.js`): `paste` on `#user-input` takes clipboard files (screenshots get real names like "Pasted image 2026-11-27 15.25.16.png"; plain text still pastes); dropping files anywhere on the page shows a veil and adds them (other drop zones are left alone). Video attachments get a hover-to-play preview. `files.py` streams uploads to disk, allows **100 MB for videos** (20 MB otherwise) and extracts 3/5/8 evenly spaced frames depending on length (up to 1024 px wide); the chat sends up to 8.
- **`calcengine.py`** (new): a Python-subset interpreter that walks the AST itself — no `exec`/`eval`. Allowed: literals, containers, loops, if, def/lambda, comprehensions, f-strings, try/except, a fixed built-ins list, `math`, `statistics`, `decimal`, `fractions`, `datetime`, and finance/helpers (`pmt fv pv nper rate npv irr mirr xnpv xirr cagr effective_rate amortization round_money money pct solve integrate table set_precision`). No `_` attributes, per-type method allow-lists, guarded `range`/`pow`/`*`/`<<`/`factorial`/format widths, 4 M step cap, 9 s internal deadline, and each run in a separate `python -I` process with `RLIMIT_CPU` 12 s, `RLIMIT_AS` 768 MB, no file writes, killed after 13 s. `-0.00` is printed as `0.00`.
- **`calcflow.py`** (new): asks the heavy model for a program (`# title:` first line), runs it, feeds errors back for up to 3 tries, then `card()` → a finished `<zrun engine="1">…</zrun><zout ok engine="1">…</zout>` and `brief()` → exact-results instructions for the writer. `ai.stream_chat` uses it when `_needs_calc` and there are no images, files to analyse or charts (those still go to Pyodide `<zrun>`); the card is streamed first and kept out of `cite()`/`strip_citations`. New SSE `status: calculating`; render.js labels engine cards.
- **Mini (`miniagent.py`, `static/js/mini.js`)**: Ask keeps 12 turns and the conversation for 30 min (new "New conversation" button); paste/drop a picture to ask about it; maths goes through the engine (numbers are first copied off the screenshot). Do mode: the model returns `check`, `plan`, `plan_done`; the screenshot gets a 100 px coordinate grid and a red ring on the last click; clicks are refined with `POST /api/mini/refine` (fast model on a 2× close-up — full resolution from the app via `mini-crop` on 1.5+, otherwise from the screenshot); one allowance unit per task via an in-memory task ticket (still capped at 40 steps, 150 for the Owner).
- **Windows app 1.5.0** (`desktop/`): the Mini bubble (`bubble.html`, `bubble-preload.js`; tray toggle; hidden during screenshots and tasks), panel position/size remembered per display, `mini-crop` IPC, slightly shorter waits after actions. Built with `signAndEditExecutable: false` + resedit for icon/version info and electron-builder's JS uninstaller extraction, because wine no longer runs on the build machine.
- **Android app 1.1.0** (`android-app/native/`): `ZpAssistActivity` handles `ACTION_ASSIST`/`VOICE_COMMAND` (so it can be chosen as the digital assistant), a translucent bottom sheet showing `/mini?android=1` with a `ZPAndroid` bridge that only answers our own origin: SpeechRecognizer listening with partial results, TextToSpeech, quick actions (alarm, timer, launch, dial/SMS via contacts, maps, web search, URL, settings pages, torch, camera). `ZpAccess` (AccessibilityService) reads on-screen elements and text, takes screenshots on Android 11+, taps/long-presses/types/scrolls and global actions, and shows a "working · tap to stop" overlay. Also `ZpTile` (Quick Settings) and a "Talk" app shortcut. `static/js/mini-android.js` adapts the bridge to Mini's API; `POST /api/mini/assist` routes answer / quick / task with a light model and streams answers (spoken style when voice). The main app shows a "Phone assistant" set-up sheet via `ZPApp`.

## 25.2.1 — Web facts and real maths in the same answer

- Reported live: "If I borrow … with Uganda's inflation …" was routed to the web, and the web path hands the whole answer to the search model, which has no code tool — so it fetched the inflation figure and then said it couldn't calculate.
- `ai._needs_calc()` spots questions that need real arithmetic (loans, interest, NPV/IRR, compounding, percentages among several numbers, projections, statistics, charts…). When one also needs the web, `web_answer` now only gathers facts; they're appended to the user's turn with a numbered source list and an instruction to use `<zrun>`, the main model writes the answer, and `cite()` links its `[n]` at the end (the deep-research path).
- Maths questions always get the heavy model and at least 4,096 tokens.
- `stream_chat(continuation=…)` now forces `use_web = False`, so finishing an answer after code has run can't be sent back to the search model.

## 25.2 — Scheduled jobs and deeper research

Part three — the last of the seven.

- **`scheduler.py`** (new) + `scheduled_jobs` table: `every` daily/weekdays/weekly/once, `at` HH:MM in the person's own time zone, `day` for weekly. `next_run()` does the zone maths (verified across London, Lagos and New York, including weekday roll-over). `GET/POST /api/jobs`, `PATCH`/`DELETE /api/jobs/{id}`, `POST /api/jobs/{id}/run`. A loop every 60 s sets each due job's next time **before** running it, then runs it by writing the request into the job's own chat and draining `ai.stream_chat()` — the same path as a typed message — with a 240 s cap. Each run is one message from the allowance (skipped with a reason if none are left); completion or failure goes to `pending_notification`.
- The AI creates jobs with `<zjob title every at day>instruction</zjob>`, handled in `_run_tools` with a confirmation tip giving the first run in local time (2 per reply).
- New **`jobs`** allowance in `limits_config` (guest 0, free 1, pro 5, ultimate/friend/admin 20, trusted 50, owner unlimited), so it appears on the Vault's Limits page; the account card counts jobs held rather than jobs per day.
- Reminders window → **Reminders & jobs** with a Scheduled jobs tab: add (with four ready-made ideas), list with schedule, next run and last result, and Run now / Open its chat / Pause–Resume / Edit / Delete.
- **`research.py`** (new): with Research on, a small model splits the question into 3–5 standalone searches; each runs at once as a Sonar helper returning cited notes; `merge()` renumbers every helper's `[n]` into one de-duplicated source list; the heavy model writes the report from those notes only; and `router_ai.cite()` turns its `[n]` into links plus a Sources list (instead of the usual `strip_citations`). Each part is a live step. Falls back to the old single search if every helper fails.
- Fixed in testing: the job confirmation showed the first run in the wrong hour, because SQLite returns naive datetimes and one was converted as if local.

## 25.1 — Answers worked out with code, and links read properly

Part two.

- **`static/js/runner.js`** (new): `ZRunner.run(code, files)` runs Pyodide 0.26.4 in a Web Worker created inside `<iframe sandbox="allow-scripts">` — no `allow-same-origin`, so an opaque origin. numpy/pandas/matplotlib load from the code's imports; every matplotlib figure is captured as a PNG. A run is stopped by discarding the frame after 30 s (90 s for the first run, which downloads Python). File bytes are transferred in; the code can't fetch them. Verified: `document.cookie` unavailable, `pyfetch` to our API fails, origin `null`, an endless loop stops and the runner recovers.
- **`<zrun title="…" files="…">python</zrun>`**: `render.js` shows a card (writing → running → result, with charts; code hidden behind *Show the code*). `Chat._maybeRunCode()` runs it after the reply, then `POST /api/chats/{chat}/messages/{msg}/run` stores each result as an HTML-escaped `<zout ok imgs>` after its `<zrun>` (charts saved as `/api/image/serve/…` PNGs, 3 MB each, 6 per run) and streams the finished answer via `stream_chat(continuation=…)`, which adds the results as an unsaved user turn. Refuses a second run (409) or a stale one; doesn't count against the message allowance; at most one corrective retry. Unrun code after a reload offers *Run it now* on the latest answer.
- **`linkreader.py`** (new): up to 3 links per message. Resolves every hop and refuses unless every IP is global (private, loopback, link-local, reserved, multicast, IPv4-mapped, encoded forms), non-standard ports, credentials in URLs and `.local`/`.internal`-style names; re-checks after each of up to 4 redirects; pins the connection to the vetted IP with SNI on the live server. 5 MB / 12 s caps. HTML → readable text with the standard library parser (prefers `<article>`/`<main>`), PDFs via pypdf. `stream_chat` shows *Reading the page…*, reads in parallel and appends the text (or a plain refusal reason) to the user's turn.
- Fixed: the general code-block upgrader was wrapping the code card's own `<pre>`s.

## 25.0 — Live pages, questions with buttons, checklists

Part one of bringing the assistant's own abilities into Zelpophai.

- **Live pages** — `<zpage title="…">…</zpage>`. `render.js` shows a card with an inline preview, Open (side panel, full screen on phones), Download (.html) and Share link. The page runs in `<iframe sandbox="allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads">` — deliberately **without** `allow-same-origin`, so it gets an opaque origin.
- **`livepages.py`** (new) + `live_pages` table: `POST/GET /api/pages`, `DELETE /api/pages/{slug}`, and `GET /p/{slug}` served with `Content-Security-Policy: sandbox …`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`. Stored only on Share, de-duplicated, 600 KB and 200 per user. Verified: inside the chat the frame's origin is `null`, and both in the chat and at `/p/` the page's `document.cookie` check throws.
- `ai._wants_page()` gives page requests the same 8,000-token room as files, and the auto-file safety net now skips any reply containing `<zpage`.
- **Questions with buttons** — `<zask q="…" multi="true">` with one option per line, up to 3 per reply. One single-choice question sends on tap; otherwise a Send answers button enables once every question is answered. `Chat._settleQuestions()` greys out any question the user has since replied to, lighting the option they picked, on send and on reload.
- **Checklists** — `<ztodo title="…">` with `- [ ]` items, ticked live by `<zdone n="…"/>` as the reply streams (the next item shows a spinner). Users tick and untick by hand; `POST /api/chats/{chat}/messages/{msg}/todo` rewrites the `[ ]`/`[x]` and, when unticking, removes the matching `<zdone>`.
- Streamed replies now end with a `{"message_id"}` event and every message wrapper carries `data-mid`, so per-message actions work before a reload.
- Fixed in passing (found in testing): new code reached the chat through `window.Chat`, but `Chat` is a top-level `const` and isn't on `window` — answers and ticks silently did nothing. `render.js` now looks it up by name.

## 24.2 — zelpophai.com

- **`site_address.py`** (new): the canonical address in one place. `base()` returns `APP_BASE_URL` unless it still points at `*.up.railway.app`, in which case it returns `https://zelpophai.com`, so a forgotten Railway variable cannot undo the move.
- **Redirect:** a `move_to_canonical` middleware sends `GET`/`HEAD` requests on `zelpophai.up.railway.app` or `www.zelpophai.com` to `https://zelpophai.com` with a 301, keeping the path and query. It never redirects: the installed apps (UA `ZelpophaiDesktop` / `ZelpophaiAndroid` / `ZelpophaiMini` / `Electron` / `electron-builder`), `/api/` (a 301 would turn POSTs into GETs), `/static/`, `/downloads/` (the Windows auto-updater), `/.well-known/`, `/sw.js` and health checks.
- **Why the apps are exempt:** `desktop/main.js` decided "ours" by an exact origin match and `capacitor.config.json` allowed navigation only to the Railway host. A redirect would have made the Windows app open every link externally and Zelpophai Mini's IPC refuse its own page, and the Android app send people to Chrome.
- 30 absolute URLs across `index.html`, `download.html`, `whats-new.html`, `share.html`, `invite.html` and the privacy/terms pages, plus `billing.py`, `vault_api.py`, `router_ai.py` and the sitemap/robots/IndexNow base, now use the new address.
- App source for the next builds: desktop `SITE` and update feed → zelpophai.com with `isOurs()` trusting all three hosts; Android `server.url` → zelpophai.com with `allowNavigation` listing all three.

## 24.1.1 — Start the Christmas look now

- The Christmas season is 25 Nov – 2 Jan instead of 1 Dec – 2 Jan, so it is on from today. Changed in `seasons.py` (the one declaration), `christmas.js`'s `inSeason()` and the pre-paint snippet in `app.html`, with the Settings and Vault wording to match.
- Verified on the real clock, no date faking: on for the Owner and the early group, off for everyone else, and up at first paint on the second visit from the cached flag.

## 24.1 — A Christmas look, for the early group first

- **`seasons.py`** (new): which seasonal theme a person may see, and when. Dates are declared once (`halloween` 15 Oct – 2 Nov, `christmas` 1 Dec – 2 Jan, with the December range wrapping New Year correctly) and eligibility is decided on the server. Christmas's audience is a setting — `early` (Owner, any admin, anyone tagged Friend), `everyone`, or `off` — so it opens up without a release. `GET /api/settings/seasonal` reports it; `POST /api/admin/system/christmas-audience` changes it, logged.
- **`static/css/christmas.css` + `static/js/christmas.js`** (new): fairy lights strung across the top (one bulb per 50px, rebuilt on resize), a winter scene (aurora, snowy hills, fir trees, drift) at `z-index:-1`, falling snow capped at 70 flakes, and catchable baubles every 25–55s with a sparkle burst and a count. All the artwork is inline SVG — no extra requests.
- The theme caches "may see" in `localStorage` so the pre-paint snippet in `app.html` can apply the class before first paint, with the server as the authority on the next load.
- Christmas takes precedence over Halloween and tears down its layers; when it ends it hands the season back. It obeys the Seasonal look setting, the Animations setting and `prefers-reduced-motion`.
- Light mode's selectors are far more specific than a theme's, so while Christmas is on it holds `light-theme` aside (remembered in `dataset.xmLight`) and restores it the moment the theme goes off. `Settings.applyTheme()` respects the same.
- The 106 `:not(.halloween)` guards in `brand.css` / `layout.css` became `:not(.halloween):not(.christmas)`, so the normal brand look stops overriding the festive one.
- **Bug fix from 24.0:** `setup.js` wrote the profile's look to `zp_settings`, but everything reads `zenith_settings` — a Work profile's "no festive themes" and "no animations" were never actually applied. It now writes the right key and tells both seasonal themes to re-apply at once.

## 24.0.1 — Videos no longer report a 500 they didn't have

- `video.start_video_job()` ended with `"remaining": max(0, limit - used - 1)`. `limits_config.allowance()` returns `None` for an uncapped plan (Owner, Ultimate, staff since 22.8), so that line raised `TypeError` — *after* `db.commit()` and after `_watch()` was scheduled. The clip was made and written to the chat; the request still became a 500. Exactly the reported "internal server error, but the video is there after a reload".
- `codeagent.py` had the identical `left = max(0, limit - used - 1)` with the same consequence, after its `UsageLog` was committed.
- Both now yield `None` when there is no cap. `chat.js`'s video dialog shows "As many as you like — no daily limit" rather than "null of null", and the coding agent's status bar treats a null limit as unlimited.
- Reproduced before the fix (500) and verified after (200 with `remaining: null`), on both endpoints.

## 24.0 — Zelpophai sets itself up for you

- **`profiles.py`** (new): the single source for both questions (four use styles, four age bands) and everything they switch on — `seasonal`, `animations`, starting `persona`, tool order, starter set, and the wording added to the AI's instructions. Stored as JSON on `users.profile`; `GET/POST /api/settings/profile` reads and writes it.
- The age wording is appended in **every** mode, research and fact-check included, because it is a safety rule; the style wording is skipped in those modes so they keep their own strict voice.
- **`static/js/setup.js`** (new): the two-step window on the `zui` kit, with Skip, a summary of what was set, and `apply()` which writes the seasonal/animation settings, reorders the composer tools and stores the starter set. It runs **first** from `app.js`, deliberately not behind `whenFree()` — the "add your email" prompt never closes, so it would have blocked the setup for ever (and was already blocking the welcome tour). A 12s fallback makes sure the later pop-ups run even if it fails.
- `Settings → General → Profile` gains a row showing the current answers with a Change button that reopens the same window.
- `chat.js` starter cards are now four sets (work / fun / learn / mixed) chosen by the profile, replacing six hard-coded ones, and clicking one fills the box properly instead of pasting the last line of the prompt.
- **Bug fix, unrelated but found while testing:** `memories.for_prompt()` called `scored.append(score, m)` instead of `append((score, m))`. Every lookup raised `TypeError`, swallowed by the caller's `try/except`, so **no memory had reached a system prompt since 22.1**.

## 23.3 — The typing box, rebuilt

- `.composer-box` is a column (attachments → textarea → tool row) instead of one wrapping flex row, so the textarea gets the full width rather than whatever is left between nine buttons. It grows to 190px, and phones get 16px type so iOS stops zooming on focus.
- New `.composer-tools`: `.ct-scroll` (attach, search | think, research, fact | image, video) scrolls sideways under a CSS mask that fades whichever end has more, with `.at-start` / `.at-end` kept in sync from `app.js`; `.ct-right` pins mic, Talk (injected by `voicechat.js` after `#mic-btn`) and send/stop.
- The mobile `tools-expanded` toggle and `#tools-expand-btn` are gone — at 390px all seven tools plus mic/Talk/send fit on one row (measured: 239px of 239px), so nothing is hidden any more.
- Labels now survive down to 900px; below that it is icons only. Placeholder unified with `slash.js` ("Ask anything, or type / for a shortcut").

## 23.2 — The user's own Security window, rebuilt

- `security.py` rewritten: `/dashboard` now returns lifetime/recent counts, the last two successful sign-ins and a short list of `tips` (email on file, recent failures, sign-out-everywhere), each with a state and an action. `/login-history` returns `device`, `kind`, `place`, `ip` and `here` via `secops`, so the window never shows a user-agent string. Legacy fields kept so a cached copy of the app and `vault.js` keep working.
- New `POST /api/security/signout-others`: bumps `token_version`, then re-issues the caller's cookie from the new version, so every other device drops while this one stays in. Verified end to end.
- `static/js/security.js` rebuilt on the `zui.js` kit (the old one was hand-styled inline and clipped its own rows because of nested fixed-height scrollers). New `zsec-` styles, including a phone layout that stacks the stat tiles and drops a tip's button below its text.

## 23.1 — The Security page, rebuilt

- **`secops.py`** (new): `describe_device()` turns a user-agent into "Chrome on Windows"; `describe_place()` / `learn_places()` name the country behind an address (one batched lookup, cached, silently skipped when offline); `is_local()` marks loopback and RFC1918 so your own network is never offered as something to block.
- **Blocking.** New `blocked_addresses` table; `is_blocked()` is sync and served from an in-memory map (reloaded on every change and every 2 min) because `auth._block_guard()` calls it on every sign-in attempt, *before* the password is checked — so a blocked place is refused even with the right password. `note_failure()` auto-blocks a place that passes the configured wrong-password count in 24h (default 15 tries → 24h block, Owner-editable).
- **`checkup()`** scores the whole setup: AI key, owner email, email sending, admins with no end date, Trusted admins, lock/maintenance left on, failed-sign-in spikes, auto-blocking, backup age, users with no email — each as good/warn/bad with a fix link.
- Vault: `GET/POST/DELETE /api/vault/security/blocks`, `POST .../autoblock`, `GET .../online`, `POST .../signout/{uid}`, `GET .../checkup` (Owner only, logged). `/api/vault/security` now returns `device`, `kind`, `place`, `blocked`, `local` per row and 120 rows.
- `pageSecurity()` rebuilt as five tabs on the `vs-` kit (Check-up / Sign-ins / Who's online / Blocked places / Emergency), new `sc-` styles. The three destructive actions now need a typed word (LOCK / SIGN OUT / NEW) rather than a single click.

## 23.0 — An app that knows when it is out of date

- `main._shell()` serves `index/app/coding-agent/mini.html` with `<meta name="zp-build" content="VERSION|BUILD_ID">` injected and `Cache-Control: no-store, must-revalidate` (content cached in memory by mtime). The landing page's search-engine verification tags go through the same helper.
- `freshness.js` seeds its baseline from that stamp instead of from the first poll, so a stale copy out of the service-worker fallback is caught on first load — previously it was only noticed if a release landed while the tab was open, which is exactly the case that bit us.
- "Update" now does a *hard* reload: `caches.delete()` on every cache, `registration.update()` on every service worker, then `location.replace()` with a cache-busting `?v=`. A plain `location.reload()` can be answered by the very copy that is stale.
- Bar reworded ("A new version of Zelpophai is ready" / Update / Not now) and wraps instead of squashing under 420px.

## 22.9 — The AI key lives in the Vault

- **`aikeys.py`** (new): OpenRouter keys stored encrypted in `system_settings["openrouter_keys_enc"]` (Fernet from `SECRET_KEY`, which persists to `/data`, so they survive redeploys). `current()` is sync and cheap for the hot path; `check()` asks `GET /key` for validity and remaining credit; `status()` feeds the Vault card; `warm()` loads them at startup and logs which source is in use. Railway `OPENROUTER_API_KEY(S)` stays as a fallback.
- `ai._get_openrouter_keys()` prefers the Vault key; `personality.py` now goes through it too, so every caller shares one source.
- `ai._ai_error_text()` replaces the raw `err:401 …` with plain language ("Zelpophai can't reach the AI right now…", out-of-credit, try-again), and `aikeys.note_failure()` records refusals for the Vault.
- Vault (Owner only, logged): `GET /api/vault/ai-key`, `POST /api/vault/ai-key` (validates before saving; `{remove:true}` clears), `POST /api/vault/ai-key/test`, plus a new **Settings → AI key** tab — status strip, masked keys, paste box with Check / Save, re-check and Remove. The key is never sent back to the browser.

## 22.8 — One editable limits system

- **`limits_config.py`** (new): every daily allowance for 8 plans (guest, free, pro, ultimate, friend, admin, trusted, owner) × 7 fields (messages, images, files, videos, mini, coding, cooldown). Stored in `system_settings["limits_json"]` over code defaults, 20s cache, `plan_of(user)` decides the plan (biggest match wins; admin vs trusted are separate). `None` = unlimited, `0` = blocked.
- **`limits.check_limit()` rewritten** around it. Fixes a real bug: free logged-in accounts had *no* message cap while the meter advertised 60. Messages now count for everyone, and pictures/files/videos count as messages too. Friendlier 429/403 text with an `X-Limit` header.
- `miniagent.py`, `video.py` and `codeagent.py` dropped their own `DAILY` tables and env vars and read the shared numbers; `tools_prompt.py` tells the AI the real current allowance.
- `GET /api/usage/meter` now returns the plan, per-kind used/limit/left, `resets_at` and any running pause (old fields kept).
- Vault: `GET/POST /api/vault/limits` and `POST /api/vault/limits/clear-pauses` (Owner only, logged), plus the `#/limits` page — editable table, today's totals, people per plan, reset-to-defaults and clear-pauses.
- The account card shows a bar per allowance with used/limit and when it resets.
- Free made tighter: 50 messages, 3 pictures, 5 files, 15 Mini tasks a day. Admin/Trusted/Friend Mini: 5,000 / 10,000 / 3,000.

## 22.7 — Pictures beside each item, and a real think-mode step list

**Pictures** — the router may now return `image_targets` (up to 6 named things) and `web_images_for()` fetches one photo each in parallel. `ai._place_images()` inserts a `<zimg src href alt credit>` marker above the heading / list item / bold lead-in that names each one, after the answer is written (sent as a late `{"content": …}` so the bubble re-renders, and saved with the message). Nothing matched → the old top row. `render.js` turns each marker into a `.zs-row`: photo left, that section's heading and text moved in beside it; stacks on phones.

**Think mode** — `stream_chat` streams `{"step": {id, label, detail, state}}` for the real stages (planning + the planner's own steps, web search with source count and time, pictures, writing). `chat.js` renders a live `.zp-steps` list that ticks each stage, survives the bubble redraws, and collapses to "Thought for Ns · N steps" when the answer is final.

## 22.6.1 — The Owner account is permanently Ultimate

- `database.py` sets `is_pro` / `is_ultimate` on the Owner at every startup with `pro_plan="owner_ultimate"` and no `trial_end`; `owner_ultimate` is not in `TIMED_PLANS`, so `expire_timed_plans()` and invite rewards leave it alone.
- `limits._is_ultimate()` and `vault_api._plan_of()` treat role `owner` as Ultimate; Settings and the account card label it Ultimate instead of Free/Owner.

## 22.6 — Coding AGT. as its own app, new Knowledge/Files/Reminders, voice conversation, account card, bulk feedback delete

**Coding AGT.**
- Own address `/code` (`/app/coding-agent` redirects, keeping `?project=`), own manifest (`manifest-code.json`), own icon, own scope, so it installs separately. The sidebar button navigates straight there instead of opening `CodeExec` first.
- `coding-agent.html` rebuilt: activity rail, start page (describe-and-build, templates, your projects with copy/delete), command palette (Ctrl K), search in all files (Ctrl Shift F), hide/drag-resize panels (Ctrl B/J/I), device preview widths, breadcrumb and status bar, editor settings (theme, text size, indent, wrap, line numbers, run-on-save).
- `coding-agent.css` rewritten (neutral palette, light + dark via `html[data-ca-theme]`); `coding-agent-shell.js` is new; `coding-agent.js` now emits `ca:*` events and exposes `window.CA`.
- CodeMirror, marked, DOMPurify, highlight.js and JSZip are self-hosted in `static/vendor/` (also swapped in app.html and share.html) — no CDN calls.

**Voice** — `voicechat.js`: full-screen conversation, streaming sentence-by-sentence TTS, barge-in (tap/Space), mic level on the orb, voice + speed picker, 30-min free cap reused. `voice=true` reaches `stream_chat` and adds a "speak like a person" block to the prompt. `Voice.speak` now honours the chosen language/voice.

**Knowledge / Files / Reminders** — `library.js` replaces the three old modals. New endpoints: `PATCH /api/knowledge/{id}`, `PATCH /api/knowledge/{id}/items/{item}`, `POST /api/files/delete-many`, `PATCH /api/reminders/{id}`; knowledge search now checks collection ownership; file list limit 50 → 300; reminder times are returned as UTC-aware.

**Account card** — `acctmenu.js`: hover/tap the user row for plan, today's usage meter, theme switch and shortcuts; replaces the old 901–1100px avatar popup.

**Settings** — chatWidth, showTime, animations, sounds, autoRead, sendOnVoice, startPage, askBeforeDelete; all wired (CSS vars/classes, chat.js, voice.js, confirm.js).

**Vault** — `POST /api/vault/feedback/delete-many` (owner only; all / finished / ratings / status / kind, optional keep-board, `count_only` preview), with a picker in the feedback inbox.

**Fix** — the 901–1100px icon rail: group labels became dividers, chat rows are square icons in both themes, and the bottom icon grid no longer clips.

## 22.5.1 — Maintenance no longer blocks log in / log out

- `ZPop.systemScreen(kind, { signedIn })`: a Log out button for signed-in people, or "Owner or helper? Sign in" (username + password → `/api/auth/login`, friendly message on 503) on the welcome page, where the login form used to be wiped out with the rest of the page.
- `app.js`: the Owner, chosen helpers and trusted admins never get the full-screen block (the client used to show it to everyone); they see `#sys-banner` instead. ZPop gained `fields` (several inputs + error line).

## 22.5 — New Settings (app and Vault)

- `static/js/settings.js`: `Settings.open(section)` builds `#zst` (ZUI modal, `zst-` styles in studio.css) with a section rail; local settings save on change, server settings via debounced `PATCH /api/settings`. Old `#settings-modal` markup, Save/Cancel and the legacy personality block are gone. New local keys `textSize`, `enterSends`.
- "Formatting" now actually works (`render.js` `toHtml` shows plain text when off); "Enter sends" handled in `app.js`; text size via `html[data-zst-text]`.
- New endpoints in `auth.py`: `POST /api/auth/change-password`, `GET /api/auth/my-data`, `POST /api/auth/delete-my-chats`, `POST /api/auth/delete-account` (password + username; chats and memories removed, account soft-deleted with `deleted_by="self"`). All rate-limited.
- `ZPPersona.mountSettings()` / `ZPAccount.mountSettings()` mount into `#zst-persona-slot` / `#zst-account-slot`.
- Vault `pageSettings()`: tabs (My Vault, Site setup, Data & exports, About), `zv_lock_min` auto-lock, `.vs-*` styles.

## 22.4 — Detailed admin permissions

- `perms.py`: catalog of 21 abilities in 7 groups, presets, `can()` / `need()` (403 + `X-Permission`), daily limits counted from the action log (`need_quota()`, 429), admin role end date (`expire_admins()`, run from `vault_jobs.alert_loop`), private note. Stored in `users.permissions` JSON (`"_"` holds limits / until / note). Owner and Trusted admins bypass switches and limits. Old 5-key values keep working.
- Enforced in `auth.py` (users list, ban, unban, reset, chats, delete, bulk delete), `analytics.py` (stats, chat lists, messages, exports, login history), `audit.py`, `announcements.py`, `feedback.py` (vault router), `vault_api.py` (overview, growth, live, people, users, search, notes, safety, releases, emails), `global_controls.py` (`global_controls` replaces the trusted-only check), `staff.py` (team chat).
- New endpoints: `GET /api/auth/admin/permissions/catalog`, `GET /api/auth/admin/my-permissions`; `GET/POST /api/auth/admin/users/{id}/permissions` now return/accept `permissions`, `limits`, `until`, `note`.
- Vault: `#/staff/{id}` editor (`pagePermissions`), nav and routing filtered by the signed-in admin's abilities, "What I'm allowed to do" card in Settings.
- Behaviour change: `export_data` is off by default for admins.

## 22.3.1 — Real chat viewer in the Vault, password view fix

- `GET /api/auth/password-changed/view` and `POST …/dismiss` no longer depend on `require_vault` (added by mistake in the 22.1 security pass), so the person whose password was changed can see it again instead of getting 403 "Admin only".
- `GET /api/auth/admin/analytics/chat/{id}/messages`: message ids, ISO times, thumbs ratings, chat meta (model, plan, shared, pinned, online, banned) and the person's other chats; `?live=1` for the viewer's refresh; opening a chat is logged (`view_chat`).
- `vault2.js` `viewChat()`: full-screen viewer with its own safe Markdown renderer (escape-first; http(s)/same-site links only), file cards, images, videos, day dividers, ratings, in-chat search, copy, download, 4s live refresh, chat list. Styles `.cv-*` in `vault2.css`.
- Password / broadcast / offline popups sit above the What's New card.

## 22.3 — New login / sign-up page, one popup for everything

- `static/js/zpop.js`: `window.ZPop` (`show`, `confirm`, `prompt`, `systemScreen`). Self-styled (injects its own CSS, works after `document.body` is emptied), tones danger/warn/good/info/owner/staff, SVG icons, quote box, list, countdown, copy-code row, focus trap, Esc, light theme, bottom-sheet on phones. Loaded before `api.js` on every page.
- All popups now go through it with the same function names and element ids: `showLimitPopup`, `showEmergencyPopup` (api.js); banned-at-load, `_showTagPopup`, `_showMaintenanceScreen`, back-online note, role change, chosen helper, helper thanks, `showBroadcastPopup`, `showBannedScreen`, `showOfflineScreen`, `showDeletedScreen`, `showPasswordChangedScreen`, `showPasswordModal` (app.js); app-update prompt (sidebar.js); maintenance/locked on the welcome page (auth.js); `showConfirm` / `showPrompt` (confirm.js — static `#confirm-modal` / `#prompt-modal` removed from app.html).
- Ban reason and broadcast text are always escaped (the load-time banned screen used to inject `ban_reason` as HTML).
- `static/index.html` + `static/css/auth.css`: `#login-screen` rebuilt (brand panel + form card, segmented tabs, labelled fields, SVG show/hide, strength meter, message boxes, busy buttons); `#forgot-modal` and `#admin-modal` restyled; staff sign-in is a text link (`#admin-crown`). All ids used by `auth.js` unchanged.
- `auth.js`: client-side checks before submit, Enter/Esc in dialogs, register redirects to `/app` (the server already sets the session cookie), reset form enforces 8 characters.

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
