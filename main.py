from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, PlainTextResponse, Response
from pydantic import BaseModel

import os
import re
import time
import secrets
import asyncio
from datetime import datetime, timezone, timedelta
os.makedirs("uploads", exist_ok=True)

from database import init_db, get_db
from auth import router as auth_router, get_current_user_from_cookie, is_owner, _server_fingerprint
from chats import router as chats_router
from memories import router as memories_router
from user_settings import router as settings_router
from knowledge import router as knowledge_router
from search import router as search_router
from files import router as files_router
from generate import router as generate_router
from security import router as security_router
from codeexec import router as codeexec_router
from codeagent import router as codeagent_router
from miniagent import router as miniagent_router
from showcase import router as showcase_router
from vault_api import router as vault_router
from appdist import router as appdist_router
from image import router as image_router
from video import router as video_router, _resume_unfinished as _resume_videos
from feedback import router as feedback_router, vault_router as feedback_vault_router
from persona import router as persona_router
from emailcheck import router as email_router
from invites import router as invites_router
from staff import router as staff_router
from announcements import router as announcements_router
from billing import router as billing_router
from google_auth import router as google_router
from system_stats import router as system_router
from analytics import router as analytics_router
from global_controls import router as global_controls_router
from personality import router as personality_router
from audit import router as audit_router

REFERRAL_REQUIRED = 5  # referrals needed for Pro reward
REFERRAL_PRO_DAYS = 3  # days of Pro granted per reward

VERSION = "22.7"

# User-facing changelog: what actually matters to normal users (benefits, no internals).
USER_CHANGELOG = [
    "22.7 Pictures from the web now sit beside the thing they show. Ask something like “what are the common operating systems” and each one gets its own photo next to its heading, instead of a row of photos at the top",
    "22.7 Think mode now shows what Zelpophai is actually doing — working out what you need, the steps it plans to take, searching the web, finding pictures, writing the answer — ticking off as each one finishes. When it's done it folds into “Thought for 6s · 5 steps”, and you can open it again to see the list",
    "22.6 Coding AGT. is now its own app at zelpophai.up.railway.app/code — tapping it no longer flashes the old code box first. New start page where you type what you want to build, a quieter professional look in light or dark, panels you can hide and drag to resize, search in all your files, a command box (Ctrl K), a live preview at phone, tablet or full width, and a status bar. You can install it on your phone or computer as a separate app with its own icon",
    "22.6 Brand-new Knowledge, Files and Reminders windows: collections you can rename and search inside, file pictures and previews with multi-select delete, and reminders with quick times, repeat, snooze and editing",
    "22.6 Voice conversation: tap Talk next to the microphone and just speak. Zelpophai answers out loud sentence by sentence as it thinks, you can cut in any time by tapping the circle or pressing Space, and you can pick the exact voice and speed",
    "22.6 Hover your name at the bottom of the sidebar for a new account card: your plan, how many messages you have left today, a quick theme switch and shortcuts to everything",
    "22.6 More settings: chat width, time on each message, animations on or off, sounds for new replies, read answers aloud, send as soon as you stop talking, what you see when Zelpophai opens, and ask-before-deleting",
    "22.6 Fixed: the sidebar no longer looks broken on tablets and half-size windows",
    "22.5.1 The maintenance screen no longer traps you: it now has a Log out button, so you can leave your account while Zelpophai is paused",
    "22.5 Brand-new Settings: one tidy window with sections down the side — General, Chat, Personality & memory, Voice, Notifications, Account and About. Everything saves by itself as you change it, so there is no Save button any more",
    "New in Settings: pick your theme from pictures, six colours, text size (small, normal, large), answer length and style in plain words, a switch for whether Enter sends your message, 20 voice languages with a Play a sample button, and a notifications page that tells you how to switch them on",
    "New Account page in Settings: change your password, sign out your other devices, see your sign-in history, download all your data as one file, delete all your chats, or delete your account",
    "22.3.1 Fixed: when the team changed your password, tapping \"Show my new password\" said \"Admin only\" instead of showing it. It now shows your new password as it should",
    "22.3 New Log in and Create account page: a cleaner two-panel design with clear labels, a show/hide password button, a password strength hint, clearer error messages, and a tidier Forgot password box. After creating an account you now go straight in — no need to log in again",
    "All pop-ups have a new look: one clean style with clear icons and plain wording for messages from the Owner, maintenance, limits, role changes, password notices, offline, and the small \"Are you sure?\" boxes. They work in light and dark mode, close with Esc, and slide up neatly on phones",
    "22.2 Slash commands: type / in the message box to see quick commands — /image and /video to create, /think, /research and /fact to switch modes, /summarize, /shorter, /simpler, /translate and /fix for quick requests, /remember to save a memory, /personality to change how Zelpophai talks, plus /new, /search, /share and more. Keep typing to filter, Enter to choose",
    "Signing up without an email: if you can't add your email right away, tick \"skip this and add it later\" on the sign-up page. You'll have 7 days to add it inside Zelpophai",
    "22.1.1 Invite rewards are back to normal: every 5 friends who join gives you 3 days of Pro. The bigger reward steps added in 22.1 have been removed",
    "22.1 New Personality studio (Settings → Personality): choose from ten personalities like Friendly, Teacher, Coder, Coach or Comedian, fine-tune with sliders for warmth, humour, detail, formality and emoji, tell Zelpophai your name and a bit about you, write your own personalities, and tap Try it to hear it before you chat",
    "Smarter Memory: memories are sorted into categories, you can pin the important ones, search and edit them, tap Learn from my chats, Tidy up duplicates, download them or forget everything — and Zelpophai now uses the memories that matter for each message",
    "Invite Friends now shows a list of the friends you invited and a monthly leaderboard. The reward is the same as before: 5 friends who join = 3 days of Pro",
    "Every account now needs a real email address so you can always get back in. If yours is missing you'll be asked to add it (you have 7 days), with help if you don't have one. Passwords now need at least 8 characters",
    "Paid plans are marked Coming soon — nothing can be bought yet. Tap Tell me on the Upgrade screen and we'll let you know when they open",
    "22.0 Brand-new Feedback (sidebar → More → Feedback): choose Bug, Idea, Praise, Problem or Personal request, add a star rating and a screenshot, and chat back and forth with the team — you can see when it's Seen, In progress or Done, and you get a notification when they reply",
    "New Ideas board: see what other people have suggested, vote for the ideas you want most, and watch them move to Planned and Done",
    "Rate any answer with a thumbs up or down right under it — if an answer was bad, tell us why in one tap and we use it to make Zelpophai better",
    "21.9 You can now report a shared chat: tap \"Report this chat\" at the bottom of any shared page if something in it shouldn't be there, and the Zelpophai team will take a look",
    "21.8 Smarter answers: Zelpophai now decides by itself when to search the web — you'll see \"Searching the web…\" — and answers with real, clickable sources and a list of the pages it used. It also adds real photos when they help (places, animals, landmarks…)",
    "No more picking AI models: each message automatically gets a fast model for simple things and a stronger one for hard tasks like code, maths and long writing",
    "Zelpophai remembers what you were working on: say hello and it greets you and offers to pick up where you left off, and every new chat now opens with a personal greeting",
    "Zelpophai Mini now logs in and out together with the app — no more restarting after you sign in. Light and dark themes now switch the whole app",
    "Windows app 1.4.0: rebuilt Mini's mouse-and-keyboard control in a way antivirus programs no longer mistake for malware",
    "21.7 The Windows and Android apps now update themselves the moment Zelpophai changes — no waiting for a new app version. If you're in the middle of something you'll see a small Refresh button instead",
    "New Windows installer in Zelpophai's look: one click on Install sets everything up and opens the app, or choose Customize to pick the folder, a desktop shortcut and Start with Windows (Windows app 1.3.0)",
    "21.6 New Privacy Policy and Terms of Service pages, linked across the site. The welcome page now shows real things Zelpophai made — a real Word file you can download, a real image and video, and today's actual news — each with a Try this yourself button",
    "21.5.1 Zelpophai Mini can now open any app on your PC in Do mode — games like Roblox and Minecraft, VPNs, Steam, Discord and more. Just say \"Open Roblox\" (Windows app 1.2.0)",
    "21.5 Zelpophai Mini: in the Windows app press Ctrl+Shift+Z anywhere to ask about your screen — explain, summarise, translate, fix or reply in one tap, select just part of the screen, use what you copied, or speak your question. Switch to Do and Mini can even use your mouse and keyboard to finish tasks for you (it asks first, and Esc stops it). Update the Windows app to get it",
    "21.4.1 Tidier sidebar: the icon row under your chats now has just your main buttons, all the same size, with Feedback, Personal Request, Security, About and Clear history tucked into a neat More (⋯) menu",
    "21.4 Continue a shared chat: open someone's shared conversation and tap Continue this chat — it's copied into your own chats so you can keep asking from where it left off",
    "Better shared pages: answers look just like in the app (code with copy buttons, tables, maths, file cards), plus Copy link and Copy chat",
    "New What's new: short update cards with Try it buttons, a sparkle icon in the sidebar for the full history, and a quick welcome tour for new users. Popups now wait their turn instead of piling up",
    "21.3 New invite page: your friends see \"<you> invited you\", what they get, and can join in one tap with Google. Invite Friends now shows your progress to free Pro step by step, with WhatsApp, Telegram, X and QR-code sharing",
    "21.2 Brand-new Coding AGT.: a real coding workspace with projects, a proper code editor and its own AI agent that writes code, shows you exactly what it changes and fixes errors with one tap. Websites, Python (even charts with pandas and matplotlib) and SQL run right in your browser. Templates, sharing and .zip download included",
    "The Zelpophai app is here for Windows and Android — get it from the new phone icon in the sidebar or zelpophai.up.railway.app/download. Notifications, a Ctrl+Shift+Space quick-ask shortcut, automatic updates, and on Windows Coding AGT. can run your code on your own computer",
    "21.1 Safer sharing: files you attached only show their name on a shared page (never their contents), you can hide your name, and a shared link is a snapshot — new messages stay private until you tap Update link. Shared links now show the chat's real title and a preview in WhatsApp, X and Telegram",
    "21.0 The AI now knows everything it can do — and does it: ask in your own words for a picture, a video or a reminder (\"remind me Friday at 9 to pay rent\") and it just happens, right in the chat. It also knows your plan and what you have left today",
    "New Friend tag: people Wanzu adds as friends get a FRIEND badge, Ultimate-level limits, extra videos and early access",
    "Staff: new Trusted Admin tag with more powers, and the Vault button now always asks for your PIN first",
    "20.9 Sidebar refresh: your most-used tools (Files, Memory, Knowledge, Reminders, Run Code) now sit right under New Chat, and the buttons under your chats are a clean row of icons — hover one to see its name",
    "20.8 Cleaner reading: AI answers now sit on the page like a document instead of inside a box, in a comfortable centred column, with the buttons underneath appearing when you need them",
    "A calmer sidebar: just New Chat, your chats, Upgrade and your name. Tap your name for everything else — Settings, Files, Memory, Reminders, Feedback, Invite Friends, Log out and more. A red dot tells you when something inside needs you",
    "20.7 Real files, done properly: ask for a CV, cover letter, report, slides or a budget and you get a proper Word, PDF, PowerPoint or Excel file with a Preview button, a download, and the text one tap away. Files stay in the chat after you reload and the AI can edit them when you ask",
    "Much better looking slides (dark brand design, columns, tables, speaker notes), Word and PDF files with page numbers, real tables and clean headings, and Excel sheets with proper numbers, money formats and working formulas",
    "Answers look better and stream smoothly: code blocks with copy, download and wrap, tables you can copy or save as CSV, tip and warning boxes, tick lists, maths formulas and tidy source links",
    "New chats name themselves after the first answer, and \"Save as\" lets you download any reply as Word, PDF, Markdown, web page or text",
    "Light mode now uses the new blue design, the same picture prompt now gives a new image each time, and the AI is more honest about news and live facts it can't check",
    "Offline mode was removed — when you lose connection you'll see a simple notice and the chat picks up again when you're back",
    "20.6 AI videos are here: Pro members can turn a sentence into a short video with sound — tap the new Video button or just say \"make a video of...\". Attach a photo and say \"animate this\" to bring it to life",
    "A fresh new look: a brighter blue design across the app, with a glowing message box, cleaner answer cards and a redesigned welcome page",
    "Uploaded files and generated documents now stay put after updates — no more broken downloads",
    "20.0 Zelpophai AI: everything you loved is still here — same features, same chats — under a brand-new name. Say hello to Zelpophai AI!",
    "Files finally open up to the AI: upload a PDF, Word, Excel, PowerPoint, audio or video and Zelpophai AI actually reads it — it can summarize, answer questions about, edit, replicate and rewrite whatever you send",
    "Way more file types are welcome: Office docs, spreadsheets, slides, audio files, videos and code files all upload and get read",
    "Videos get processed too — Zelpophai AI grabs key frames from the video so it can describe what's on screen, plus audio transcription when a transcription key is configured",
    "Audio files report their metadata (duration, bitrate, format) and transcribe their speech when a Whisper-compatible key is set",
    "What's New finally stops repeating itself — you now only see features that were freshly added since the last time you checked",
    "Used invite links get their own flashy page: a spinning neon ticket portal that tells you the seat's already taken",
    "The invite page now scrolls smoothly on short screens instead of clipping its content",
    "The whole app got the vibrant neon makeover — deep purple, cyan and pink-gold gradients across the board, and your Theme & Accent settings now drive that look (owners keep the signature neon)",
    "Invite links are now locked to the device AND the network — incognito, clearing site data or swapping browsers won't let the same person farm multiple invites, so the 5-friend Pro reward stays honest",
    "Shared links now explain themselves — if a linked chat is private, deleted or you're logged out, you get a clear message with the right way back, instead of a blank redirect",
    "Shared-chat pages got a refresh: real chat bubbles with your name on it, a link you can copy straight from the top bar, and a cleaner conversation view",
    "Share popup polished: a live 'Public' status pill, one-tap copy, prettier social buttons and a clearer preview of who can see your chat",
    "Invites are now one per device — once a device joins Zelpophai it can't use another invite link, and it gets a friendly 'already joined' page if it tries",
    "Folders & pinning: organize chats into custom folders and pin favorites to the top of the sidebar",
    "Shared chats now collect reactions! People who view your shared link can tap emojis on any message, and you'll see viewer reactions in the chat",
    "Unlimited invites are now single-use — an invite link is consumed the moment someone registers, so it can't be replayed",
    "Billing back on Stripe — global card payments (Visa, Mastercard, AMEX) with automatic currency handling",
    "Invited friends land straight inside the app after creating their account (no extra login step)",
    "Brand-new redesigned invite page — crisp, animated and ready to show off",
    "Reminders: pick 'Today' for same-day alerts, plus the usual weekdays or next-day",
    "Voice speed control: tune how fast Zelpophai AI speaks the replies out loud",
    "Long replies get a friendly 'ready for you' nudge the moment they finish",
    "Per-chat model picker: choose a different AI for each conversation without changing your global default",
    "Share & export polished: one-tap social sharing, txt/md/pdf export and a cleaner shared-chat view",
    "Security hardening: password resets now use emailed one-time links, failed logins are rate-limited, and sessions use secure cookies",
    "Time-based limits: after heavy use your account takes a cooling break — from 1 hour up to 18 hours, tuned to your activity",
    "Media window: chats with lots of images/files get a 15-message allowance, then a long rest",
    "Voice: logged-in users get 30 minutes of voice chat per day, then it pauses until midnight (UTC)",
    "Files & documents: logged-in users can create/edit up to 10 files a day, then a 1-hour break — guests need to log in first",
    "Clear countdown popups: whenever a limit kicks in you'll see exactly how long to wait",
    "Just ask for an image: type something like 'generate a pic of...' and Zelpophai AI creates it automatically",
    "Changelog is now split — normal users see what affects them; staff see the deep technical notes",
    "Personal Requests: ask the admin for anything personally (a feature, a fix, a custom item) — they reply right here in the sidebar",
    "Personality Mirror: Zelpophai AI studies how you write and matches your tone, energy and vibe in its replies (tunable in Settings → System Prompt)",
    "19.6 busy-proof downloads: if Zelpophai AI is busy when you ask for a file/doc generation, you get a test file you can still download (choose md/docx/pdf/pptx/xlsx/csv) to verify downloads work",
    "19.7 vibrant upgrade & guest login: the upgrade plans popup got a neon makeover; guests are told instantly why invites/sharing are off-limits with a colorful login prompt that never hides behind other popups",
]

# Staff/admin changelog: current + technical notes (owners & admins see these too).
STAFF_CHANGELOG = [
    *USER_CHANGELOG,
    "22.6.1 Owner: your account now holds Ultimate for good — it shows as your plan everywhere (Settings, the account card, your Vault profile) and never runs out or needs renewing",
    "22.6 Owner: delete feedback in bulk — Vault → Feedback → “Delete many…” removes finished items, star ratings only, one status, or everything, with a count before you confirm and an option to keep ideas that are on the public board",
    "22.5.1 Owner and helpers: maintenance and lock no longer shut you out. On the paused screen there is now an \"Owner or helper? Sign in\" button, and once you're in you keep using Zelpophai normally with a small yellow notice at the top instead of the full-screen block",
    "22.5 Vault: Settings is rebuilt into four tabs — My Vault (theme, lock after 2, 5 or 15 minutes, starting time range, desktop alerts, PIN), Site setup (email, paid plans and Google sign-in with a status strip on top), Data & exports, and About",
    "22.4 Owner: detailed admin permissions. Vault → Staff & permissions → Edit permissions opens a full page for each admin with 21 switches in 7 groups (people, conversations, feedback, safety, broadcasts and team chat, stats and logs, site controls), four quick setups (Full admin, Moderator, Support, Read-only), copy from another admin, daily limits for bans, password resets, deletions and broadcasts, an end date after which they stop being an admin by themselves, and a private note. Every change is written to the activity log",
    "22.4 Admins: the Vault now only shows the pages you're allowed to use, and Settings has a new \"What I'm allowed to do\" card with your switches and today's limits. Downloading data (exports) is now off for admins until the Owner switches it on",
    "22.3.1 Vault: opening a chat now shows the real conversation, full screen — formatted text, tables, code blocks, pictures, videos and file cards exactly as the person saw them, with exact times, day dividers and their thumbs up/down. It updates live while they chat, lists the person's other chats on the left, and has search inside the chat, copy and Download. Each time a chat is opened it is written to the activity log",
    "22.3 Staff: the Banned, Deleted, Locked and Maintenance screens are redesigned (reason shown in its own box, who did it, a contact email on the banned screen). Maintenance and Locked screens tell people the page reopens by itself. Broadcast pop-ups count as read however they are closed. Staff sign-in is now a small link at the bottom of the login page",
    "22.2 Owner: the Sign in with Google button is hidden for now because Google refuses it on this site (\"origin not allowed\"). Vault → Settings → Sign in with Google has the exact steps to fix it in your Google account and a switch to show the button again",
    "22.1 Staff: Live Chat is now Team chat — message bubbles, who is online, replies, reactions, edit/delete your own messages, typing dots, links and @mentions. Vault → Settings shows whether email sending works (with a test button and setup steps) and who asked to be told when paid plans open",
    "22.1 Security check: Google sign-in now only accepts sign-ins made for Zelpophai with a verified Google email; plans can no longer be switched on without a real payment (the old demo checkout is gone) and free trials/invite rewards now end when their time is up; banning, deleting, role changes, password resets and reading users' chats all need the Vault PIN; a Vault unlock only works for the person who typed the PIN; a password reset signs out old sessions; the public API listing (/docs) is off; and every page now sends anti-clickjacking and no-sniff headers",
    "22.0 Feedback moved into the Vault (People → Feedback): one inbox for feedback and personal requests with search, filters, statuses, quick replies and screenshots; manage the Ideas board (publish/hide, official answers, optional approve-first); Answer ratings (thumbs up/down over time, reasons, and the exact question and answer for each thumbs down); and an AI summary of what people are saying. Old feedback and personal requests were moved over. The in-app inbox popups and the Personal Request button are gone",
    "21.9.2 Everything from the classic Vault now lives in the new one (the old address opens the new Vault): Conversations (read any chat), Security & emergency (sign-in health, server health, lock every account, maintenance, emergency backup, new owner password, sign everyone out), Staff & permissions (add/remove admins, trusted, per-admin permissions, chosen helpers), Settings & exports (change your Vault PIN, download users/chats/messages), bulk-delete in Users and Export data on every profile",
    "User profiles now show their exact plan (e.g. Pro · monthly, Ultimate gift) with a live countdown — tap it to see days, hours, minutes and seconds until it renews or ends, the renewal date (live from Stripe when available), price and last payment",
    "21.9.1 Vault charts fixed: the chart library is now served by Zelpophai itself instead of an outside site, so charts no longer show up as empty boxes when a browser or network blocks that site. If a chart ever can't be drawn it now says so instead of staying blank",
    "21.9 Brand-new Vault (/vault; the old one stays at /vault/classic): Overview with live KPIs and charts for 24h/7d/30d/90d, Growth & revenue (DAU/WAU/MAU, retention cohorts, invites, MRR and payments), AI cost & usage (spend per day, feature, model and user, OpenRouter credit and days left), Live monitor (who's online and on which app, live activity, errors), and Ctrl+K search to jump anywhere",
    "Vault people tools: Users list with filters (online, new, Pro, paying, friends, staff, guests, banned), a full User 360 profile (activity, usage, chats, logins, apps, payments, invites, flags, private notes) with ban, reset password, gift/change plan, Friend tag and role actions, plus a Friends & customers page listing friends, paying customers, gifted plans, trials and staff",
    "Vault safety and system: Content safety queue (auto-flagged messages and reported shares — nothing is blocked automatically), Alerts with browser notifications (low credit, error or AI-failure spikes, sign-up spikes, new safety flags), Controls & broadcast, App releases (drag-and-drop upload + versions in use), Backups (automatic daily backup, newest 14 kept, download and restore) and the Activity log. Dark and light themes, works on phones. Revenue is tracked from this release on; AI costs are estimates from OpenRouter prices",
    "20.2 Stripe billing restored: reverted PesaPal -> Stripe Checkout (stripe==12.5.0 re-added to requirements.txt); env vars STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET/STRIPE_PRICE_PRO_MONTHLY etc/APP_BASE_URL; create-checkout returns {url,mock,plan}; mock mode when stripe unconfigured; webhook processes checkout.session.completed (checkout.session.completed) + customer.subscription.deleted; keep OfflineDirectory untouched; VERSION -> 20.2",
    "20.1 Zelpophai AI rebrand: user-affecting 'Quolvex/Quolvex AI' branding replaced with 'Zelpophai AI' (titles, headers, meta/og tags, About text, share/invite/status pages, AI prompts); functional identifiers unchanged (zenith_token cookie, zenith_device_id localStorage, DB filename, Railway domain) so sessions/logins keep working; window.QuolvexDirectory -> window.ZelpophaiDirectory; VERSION -> 20.1",
    "20.0 Zelpophai AI rebrand: user-visible 'Zenith' branding replaced with Zelpophai (titles, headers, meta/og tags, About text, share/invite/status pages); functional identifiers unchanged (zenith_token cookie, zenith_device_id localStorage, DB filename, Railway domain) so sessions/logins keep working; VERSION -> 20.0",
    "20.0 billing fix: clicking an upgrade option in dev mode (PesaPal unconfigured) no longer hard-reloads the page — billing.js now honors res.mock (success toast + close modal) and only navigates on a real PesaPal redirect_url; plan buttons show 'Processing…' and re-enable on failure; create-checkout wraps auth/IPN/order failures as 502 with a clear detail instead of a bare 500 'Internal Server Error'",
    "19.7 upgrade/login vibrancy: billing.showUpgrade() fully restyled (zp-* scoped classes, gradient title/glows/top bar, plan cards cyan vs gold with POPULAR/SAVE 17%/ONE-TIME badges, animated gradient buttons, grid auto-fit for mobile) and modal z-index bumped 500→10000 so guest popups never sit behind the share (700) / invite (9999) modals; chat-share-btn and invite-btn now gate guests up-front to Billing.showUpgrade('Guest ...'); guest branch shows a bobbing rocket + vibrant Login/Register; limit popup (api.js) guest login button switched to cyan→violet→magenta animated gradient with limitDrift keyframes",
    "19.8 PesaPal billing: replaced Stripe with PesaPal API 3.0 (auth token caching, IPN webhook registration per order, SubmitOrderRequest with subscription_details for monthly/yearly, GetTransactionStatus verification); env vars PESAPAL_CONSUMER_KEY/PESAPAL_CONSUMER_SECRET/PESAPAL_SANDBOX; mock mode when unconfigured; stripe.py removed from requirements.txt; supports Visa/Mastercard/AMEX + MTN/Airtel mobile money in Uganda",
    "19.6 busy fallback: chat.js detects a streamed busy/too-many-requests error AND a generation-like user message (_looksLikeGenerationRequest regex) then _renderBusyFallback() injects the busy note + a .file-pill.ftest card with 6 format download buttons (md/docx/pdf/pptx/xlsx/csv) calling downloadAs() → /api/generate/document; .fp-dls styles in style.css (wraps full-width under 480px); also applied on regenerate()",
    "19.5 file-read pipeline: files.py extractors (docx/xlsx/pptx via python-docx/openpyxl/python-pptx, audio metadata via mutagen, video frames via imageio_ffmpeg, whisper-compatible transcription via WHISPER_API_KEY/WHISPER_BASE_URL/WHISPER_MODEL env); ALLOWED_TYPES + EXT_ALLOWLIST widened; chat.js auto-fetches /api/files/{id}/read for binary attachments and embeds content + video frames into the model context; each optional lib is import-guarded so the server keeps running without them",
    "changelog is now per-user 'seen' (users.changelog_seen_user/changelog_seen_staff); GET /api/changelog returns only newly-added entries (unseen prefix) when authed, POST /api/changelog/seen marks them; guests fall back to a local counter in app.js",
    "TEMPORARY owner tool: POST /api/referral/admin/reset {username} wipes a user's referral progress (deletes Referral rows + revokes referral_pro); exposed as a dashed button inside the owner's Invite Friends modal — remove in a later version",
    "SECURITY 18.2: code sandbox gated to Owner-only + shell execution removed; hardcoded admin/owner passwords removed (env-bootstrapped) + known-compromised creds auto-rotated on boot; SECRET_KEY auto-generated (persisted, never 'zenith-dev'); forgot-password now issues expiring emailed tokens (SMTP via SMTP_* env, link logged when unconfigured); new POST /api/auth/reset-password; brute-force protection (per-IP + per-username, 429 + Retry-After) on login/admin-login/guest/register/forgot; secure=True session cookies (except localhost); /api/debug/keys now Owner-only; pending_password encrypted at rest (Fernet) and shown once then cleared",
    "limits.py engine: cooldown_until column; dynamic free timer 60-1080 min from usage intensity (msgs today/1h/10m bounce + media volume); pro 10-30 min, 60 min on exploit",
    "chat media window: [Image xN]/[File: markers per chat; 15-msg allowance from 5th image/15th file; images+files logged as 'message' usage",
    "file_tool system: guests 403 on edit/document_gen; free logged-in 10/day combined upload+edit+gen then fixed 60-min cooldown",
    "image.py persists generated images as assistant messages (survives reload, counted in media window)",
    "client showLimitPopup (api.js) with live countdown; billing interceptor routes cooldown/pause messages to the popup",
    "voice 30-min/day meter (localStorage, resets UTC midnight) — voice mode blocks + popup after the cap",
    "auto image-gen: detectImageRequest() regex in chat prompts ('generate a pic of...', 'i want a pic of...')",
    "changelog endpoint returns user_changes + staff_changes; app shows per role",
    "personal requests: /api/requests (create/my/admin/respond/delete); UserRequest table; staff reply in the Request Inbox with badge, device push + Discord toast; users get reply popups",
    "personality mirror: /api/personality (profile/settings/refresh/reset); analyzer openai/gpt-4o-mini on last 40 user msgs (>=5 to trigger), REFRESH_MINUTES=15; first analysis synchronous in chats.py hook, later refreshes backgrounded; injected into build_system_prompt; columns personality_enabled/profile/updated_at",
]


# One-time Owner Vault PIN reset (requested by the Owner, who forgot the PIN).
# Only the bcrypt hash is stored here; it runs once, then a marker file on the
# volume stops it from running again, so a PIN changed later in the Vault stays.
_OWNER_PIN_RESET_HASH = "$2b$12$yDgGjwq5oYUI5dInMTdMbeO9HahFvA//1NofkAbua.rRtjx6f0UOC"
_OWNER_PIN_RESET_ID = "owner-pin-reset-2026-11-10"


async def _owner_pin_reset_once():
    try:
        from appdist import _dir
        marker = _dir() / f".{_OWNER_PIN_RESET_ID}"
        if marker.exists():
            return
        from database import async_session as _as, User as _U
        from sqlalchemy import select as _sel
        async with _as() as db:
            owners = (await db.execute(_sel(_U).where(_U.role == "owner"))).scalars().all()
            for o in owners:
                o.pin_hash = _OWNER_PIN_RESET_HASH
            await db.commit()
        marker.write_text("done")
        print(f"[vault] Owner PIN reset for {len(owners)} owner account(s)")
    except Exception as e:
        print(f"[vault] owner PIN reset skipped: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from vault_jobs import apply_pending_restore
        apply_pending_restore()          # a restore chosen in the Vault happens here, before the DB opens
    except Exception as e:
        print(f"[vault] restore check skipped: {e}")
    try:
        await init_db()
    except Exception as e:
        print(f"init_db failed (non-fatal): {e} — continuing, app will be live but DB may be ephemeral")
    await _owner_pin_reset_once()
    reminder_task = asyncio.create_task(_reminder_loop())
    from vault_jobs import alert_loop, backup_loop
    from feedback import migrate_legacy
    await migrate_legacy()            # old Feedback + Personal Requests → new inbox (once)
    from invites import migrate_once as _invite_migrate
    await _invite_migrate()
    vault_tasks = [asyncio.create_task(backup_loop()), asyncio.create_task(alert_loop())]
    asyncio.create_task(_indexnow_ping())
    try:
        await _resume_videos()   # keep watching clips that were rendering during a restart
    except Exception as e:
        print(f"video resume skipped: {e}")
    try:
        yield
    finally:
        reminder_task.cancel()
        for _t in vault_tasks:
            _t.cancel()
        try:
            await reminder_task
        except asyncio.CancelledError:
            pass


# The interactive API listing (/docs, /openapi.json) stays off in production: it maps every endpoint for an attacker.
_API_DOCS = os.getenv("API_DOCS", "").strip() == "1"
app = FastAPI(title="Zelpophai AI", version=VERSION, lifespan=lifespan,
              docs_url="/docs" if _API_DOCS else None, redoc_url="/redoc" if _API_DOCS else None,
              openapi_url="/openapi.json" if _API_DOCS else None)

app.include_router(auth_router)
app.include_router(chats_router)
app.include_router(memories_router)
app.include_router(settings_router)
app.include_router(knowledge_router)
app.include_router(search_router)
app.include_router(files_router)
app.include_router(generate_router)
app.include_router(security_router)
app.include_router(codeexec_router)
app.include_router(codeagent_router)
app.include_router(miniagent_router)
app.include_router(showcase_router)
app.include_router(vault_router)
app.include_router(appdist_router)
app.include_router(image_router)
app.include_router(video_router)
app.include_router(feedback_vault_router)   # before the vault router so /api/vault/feedback/* is matched here
app.include_router(feedback_router)
app.include_router(persona_router)
app.include_router(email_router)
app.include_router(invites_router)
app.include_router(staff_router)
app.include_router(announcements_router)
app.include_router(billing_router)
app.include_router(google_router)
app.include_router(system_router)
app.include_router(analytics_router)
app.include_router(global_controls_router)
app.include_router(personality_router)
app.include_router(audit_router)


# ─────────────────────────────────────────────────────────────────────────────
# REFERRAL SYSTEM
# ─────────────────────────────────────────────────────────────────────────────

from database import User, Referral, Chat, Message, Reminder, async_session
from sqlalchemy import select, func, update, delete
from database import InviteToken, UsedDevice


def _generate_token():
    return secrets.token_urlsafe(32)


@app.post("/api/referral/generate")
async def referral_generate(request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if user.username.startswith("guest_"):
        raise HTTPException(status_code=403, detail="Guests cannot generate invite links")
    existing = await db.execute(
        select(InviteToken).where(InviteToken.referrer_id == user.id, InviteToken.used == False)
    )
    active = existing.scalar_one_or_none()
    if active:
        return {"token": active.token, "created_at": active.created_at.isoformat()}
    token = InviteToken(token=_generate_token(), referrer_id=user.id)
    db.add(token)
    await db.commit()
    await db.refresh(token)
    return {"token": token.token, "created_at": token.created_at.isoformat()}


@app.get("/api/referral/stats")
async def referral_stats(request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if user.username.startswith("guest_"):
        raise HTTPException(status_code=403, detail="Guests cannot view referral stats")
    total_result = await db.execute(
        select(func.count()).where(Referral.referrer_id == user.id)
    )
    total = total_result.scalar() or 0
    rewarded_result = await db.execute(
        select(func.count()).where(Referral.referrer_id == user.id, Referral.rewarded == True)
    )
    rewarded = rewarded_result.scalar() or 0
    pending = total - rewarded
    has_pro = getattr(user, "is_pro", False) and getattr(user, "pro_plan", "") == "referral_pro"
    earned_from_referrals = has_pro or rewarded > 0
    return {
        "total": total,
        "rewarded": rewarded,
        "pending": pending,
        "required": REFERRAL_REQUIRED,
        "has_pro": has_pro,
        "earned_from_referrals": earned_from_referrals,
        "pro_days": REFERRAL_PRO_DAYS,
    }


@app.post("/api/referral/admin/reset")
async def referral_admin_reset(request: Request, db=Depends(get_db)):
    """TEMPORARY owner tool: wipe a user's referral progress so they can earn the
    invite-friends reward again. Owner-only; removed in a later version."""
    user = await get_current_user_from_cookie(request, db)
    if not (user.role == "owner" or user.username == "WANZU-IBRAHIM"):
        raise HTTPException(status_code=403, detail="Owner only")
    body = await request.json()
    target_name = (body.get("username") or "").strip()
    if not target_name:
        raise HTTPException(status_code=400, detail="username required")
    tgt = (
        await db.execute(select(User).where(User.username == target_name))
    ).scalar_one_or_none()
    if not tgt:
        raise HTTPException(status_code=404, detail="User not found")
    deleted = (
        await db.execute(
            select(func.count()).where(Referral.referrer_id == tgt.id)
        )
    ).scalar() or 0
    await db.execute(delete(Referral).where(Referral.referrer_id == tgt.id))
    if getattr(tgt, "pro_plan", "") == "referral_pro":
        tgt.is_pro = False
        tgt.pro_plan = ""
        tgt.trial_end = None
    await db.commit()
    return {"message": f"Reset invite progress for {target_name}", "deleted": deleted}


@app.get("/api/referral/link")
async def referral_link(request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if user.username.startswith("guest_"):
        raise HTTPException(status_code=403, detail="Guests cannot get invite links")
    existing = await db.execute(
        select(InviteToken).where(InviteToken.referrer_id == user.id, InviteToken.used == False)
    )
    active = existing.scalar_one_or_none()
    if not active:
        active = InviteToken(token=_generate_token(), referrer_id=user.id)
        db.add(active)
        await db.commit()
        await db.refresh(active)
    base = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    if not base:
        # Build from the incoming request so scheme + host + port are correct
        base = str(request.base_url).rstrip("/")
    return {"link": f"{base}/i/{active.token}", "token": active.token}


@app.get("/i/{token}")
async def invite_page(token: str, request: Request):
    async with async_session() as db:
        result = await db.execute(
            select(InviteToken).where(InviteToken.token == token)
        )
        invite = result.scalar_one_or_none()
        if not invite or invite.used:
            return RedirectResponse(url="/")
        try:
            invite.clicks = (invite.clicks or 0) + 1      # "your link was opened N times"
            await db.commit()
        except Exception:
            pass
        ref_result = await db.execute(
            select(User).where(User.id == invite.referrer_id)
        )
        referrer = ref_result.scalar_one_or_none()
        if not referrer:
            return RedirectResponse(url="/")
    resp = RedirectResponse(url=f"/invite.html?token={token}")
    resp.set_cookie(
        key="zenith_invite_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=(request.url.scheme == "https"),
        max_age=7 * 24 * 3600,
    )
    return resp


@app.get("/invite.html", response_class=HTMLResponse)
async def serve_invite_page():
    return FileResponse("static/invite.html")


@app.get("/api/referral/validate")
async def validate_invite_token(request: Request, db=Depends(get_db)):
    token = request.query_params.get("token", "")
    device_id = request.query_params.get("device_id", "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token required")
    # Device already joined Zelpophai AI → it can never use another invite link.
    # Client device_ids are spoofable, so the server-side network fingerprint
    # (IP + User-Agent) counts too — same network that already joined via an
    # invite gets the same "already joined" treatment even after incognito.
    if device_id:
        dev_result = await db.execute(
            select(UsedDevice).where(UsedDevice.device_id == device_id)
        )
        used = dev_result.scalar_one_or_none()
        if used:
            user_result = await db.execute(select(User).where(User.id == used.user_id))
            owner = user_result.scalar_one_or_none()
            if owner and not owner.is_deleted:
                return {
                    "device_already_joined": True,
                    "detail": "This device already joined Zelpophai AI",
                    "username": owner.username,
                }
    net_fp = _server_fingerprint(request)
    if net_fp:
        net_result = await db.execute(
            select(UsedDevice).where(
                UsedDevice.ip_fp == net_fp,
                UsedDevice.source == "invite",
            )
        )
        used_net = net_result.scalar_one_or_none()
        if used_net:
            user_result = await db.execute(select(User).where(User.id == used_net.user_id))
            owner = user_result.scalar_one_or_none()
            if owner and not owner.is_deleted:
                return {
                    "device_already_joined": True,
                    "detail": "This device already joined Zelpophai AI",
                    "username": owner.username,
                }
    result = await db.execute(
        select(InviteToken).where(InviteToken.token == token)
    )
    invite = result.scalar_one_or_none()
    if invite and invite.used:
        raise HTTPException(status_code=410, detail="This invite link has already been used")
    if not invite:
        raise HTTPException(status_code=404, detail="Invite link not found or invalid")
    ref_result = await db.execute(
        select(User).where(User.id == invite.referrer_id)
    )
    referrer = ref_result.scalar_one_or_none()
    return {
        "referrer_name": referrer.username if referrer else "Someone",
        "created_at": invite.created_at.isoformat(),
    }


app.mount("/static", StaticFiles(directory="static"), name="static")
from files import UPLOAD_DIR as _UPLOAD_DIR
app.mount("/uploads", StaticFiles(directory=_UPLOAD_DIR), name="uploads")


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC CHAT SHARES
# ─────────────────────────────────────────────────────────────────────────────

_FILE_MARK_RE = re.compile(r"\n*\[File(?: content)?:\s*([^\]\n]+)\]\n?")


def _public_message_text(content: str, role: str) -> str:
    """What a shared page may show. Users' attached files are summarised as
    "📎 name" — their contents were sent to the AI, not meant for the public."""
    text = content or ""
    if role == "user" and "[File" in text:
        parts = _FILE_MARK_RE.split(text)
        names = []
        for n in parts[1::2]:
            n = n.strip()
            if n and n not in names:
                names.append(n)
        text = parts[0].rstrip()
        if names:
            text = (text + "\n\n" if text else "") + "  ·  ".join("📎 " + n for n in names)
    return text


async def _load_share(db, share_id: str):
    chat = (await db.execute(select(Chat).where(Chat.share_id == share_id))).scalar_one_or_none()
    if not chat:
        return None, []
    q = select(Message).where(Message.chat_id == chat.id)
    if chat.share_upto:
        q = q.where(Message.id <= chat.share_upto)
    msgs = (await db.execute(q.order_by(Message.id))).scalars().all()
    return chat, msgs


def _share_snippet(msgs) -> str:
    for m in msgs:
        if m.role == "assistant" and (m.content or "").strip():
            t = re.sub(r"<zfile\b[^>]*name=\"([^\"]+)\"[^>]*>.*?(</zfile>|$)", r"[\1]", m.content, flags=re.S)
            t = re.sub(r"!\[[^\]]*\]\([^)]*\)|```.*?```|<[^>]+>", " ", t, flags=re.S)
            t = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)
            t = re.sub(r"[#*_>`|-]+", " ", t)
            t = re.sub(r"\s+", " ", t).strip()
            if t:
                return (t[:157] + "…") if len(t) > 160 else t
    return "A conversation shared from Zelpophai AI — the AI that chats, makes files, images and videos."


@app.get("/s/{share_id}", response_class=HTMLResponse)
async def shared_chat_page(share_id: str, request: Request):
    """Serve the share page with real link-preview tags (WhatsApp, X, Telegram
    and Facebook read these from the HTML; they never run the page's JS)."""
    import html as _h
    page = open("static/share.html", encoding="utf-8-sig").read()
    async with async_session() as db:
        chat, msgs = await _load_share(db, share_id[:64])
    if chat:
        title = f"{chat.title or 'Shared chat'} — Zelpophai AI"
        desc = _share_snippet(msgs)
    else:
        title, desc = "Shared chat — Zelpophai AI", "This shared chat isn't available."
    base = (os.getenv("FRONTEND_URL", "").strip().rstrip("/") or str(request.base_url).rstrip("/"))
    url = f"{base}/s/{_h.escape(share_id[:64])}"
    t, d = _h.escape(title, quote=True), _h.escape(desc, quote=True)
    # (lambdas, so backslashes in a chat title can't be read as regex escapes)
    page = re.sub(r'<meta property="og:title"[^>]*>', lambda _m: f'<meta property="og:title" id="og-title" content="{t}">', page, count=1)
    page = re.sub(r'<meta property="og:description"[^>]*>', lambda _m: f'<meta property="og:description" content="{d}">', page, count=1)
    page = re.sub(r"<title>.*?</title>", lambda _m: f"<title>{t}</title>", page, count=1, flags=re.S)
    extra = (f'<meta name="description" content="{d}">\n    <meta property="og:url" content="{url}">\n'
             f'    <meta name="twitter:card" content="summary_large_image">\n    <meta name="twitter:title" content="{t}">\n'
             f'    <meta name="twitter:description" content="{d}">\n    <meta name="robots" content="noindex">\n')
    page = re.sub(r'\s*<meta name="description"[^>]*>', "", page)
    if 'name="robots"' in page:
        extra = extra.replace('    <meta name="robots" content="noindex">\n', "")
    page = page.replace("</head>", "    " + extra + "</head>", 1)
    return HTMLResponse(page)


_report_hits: dict = {}


@app.post("/api/s/{share_id}/report")
async def report_shared_chat(share_id: str, request: Request, db=Depends(get_db)):
    """Anyone can report a shared chat; it goes to the Vault's Safety queue."""
    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else ""))
    now = time.time()
    hits = [t for t in _report_hits.get(ip, []) if now - t < 3600]
    if len(hits) >= 5:
        raise HTTPException(status_code=429, detail="Thanks — you've already sent several reports. Please try later.")
    _report_hits[ip] = hits + [now]
    try:
        body = await request.json()
    except Exception:
        body = {}
    reason = re.sub(r"\s+", " ", str(body.get("reason") or "")).strip()[:400]
    chat, msgs = await _load_share(db, share_id[:64])
    if not chat:
        raise HTTPException(status_code=404, detail="Shared chat not found")
    excerpt = " | ".join((m.content or "")[:150] for m in msgs[:3])
    from vault_events import report_share
    report_share(share_id[:64], chat.id, chat.user_id, reason or "Reported by a visitor", excerpt)
    return {"ok": True}


@app.post("/api/s/{share_id}/continue")
async def continue_shared_chat(share_id: str, request: Request, db=Depends(get_db)):
    """Copy a shared conversation (only the public snapshot, with attached
    files reduced to their names) into the visitor's own chats so they can keep
    talking to the AI from where it left off."""
    from chats import _new_link_id
    from database import UsageLog
    user = await get_current_user_from_cookie(request, db)
    chat, msgs = await _load_share(db, share_id[:64])
    if not chat:
        raise HTTPException(status_code=404, detail="Shared chat not found")
    if chat.user_id == user.id:
        return {"link_id": chat.link_id, "own": True}
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    used = (await db.execute(select(func.count()).select_from(UsageLog).where(
        UsageLog.user_id == user.id, UsageLog.action == "share_continue", UsageLog.created_at >= start))).scalar() or 0
    if used >= 30:
        raise HTTPException(status_code=429, detail="You've continued a lot of shared chats today. Try again tomorrow.")
    msgs = [m for m in msgs if m.role in ("user", "assistant") and (m.content or "").strip()][-200:]
    if not msgs:
        raise HTTPException(status_code=400, detail="This shared chat is empty")
    new = Chat(user_id=user.id, title=((chat.title or "Shared chat")[:90]), link_id=_new_link_id())
    db.add(new)
    await db.flush()
    for m in msgs:
        text = _public_message_text(m.content, m.role)
        if m.role == "assistant" and "<zfile" in text:
            # The original files belong to the sharer; keep their text, not their links.
            text = re.sub(r'<zfile\b[^>]*?name="([^"]*)"[^>]*>(.*?)(?:</zfile>|$)',
                          lambda x: "\n\n**📄 " + x.group(1) + "** (file from the shared chat)\n\n" + x.group(2).strip() + "\n\n",
                          text, flags=re.S)
        db.add(Message(chat_id=new.id, role=m.role, content=text))
    db.add(UsageLog(user_id=user.id, action="share_continue"))
    await db.commit()
    return {"link_id": new.link_id, "chat_id": new.id}


@app.get("/api/s/{share_id}")
async def get_shared_chat(share_id: str):
    """Public read-only view of a shared conversation (no auth)."""
    async with async_session() as db:
        chat, msgs = await _load_share(db, share_id[:64])
        if not chat:
            raise HTTPException(status_code=404, detail="Shared chat not found")
        messages = [
            {
                "id": m.id,
                "role": m.role,
                "content": _public_message_text(m.content, m.role),
                "created_at": m.created_at.isoformat() if m.created_at else "",
                "viewer_reactions": m.viewer_reactions or "{}",
            }
            for m in msgs
        ]
        owner_name = "Anonymous"
        if not chat.share_anon:
            owner = await db.get(User, chat.user_id)
            if owner:
                owner_name = (getattr(owner, "display_name", "") or owner.username)
        return {
            "title": chat.title,
            "shared_at": chat.shared_at.isoformat() if chat.shared_at else "",
            "message_count": len(messages),
            "owner": owner_name,
            "anonymous": bool(chat.share_anon),
            "messages": messages,
        }


@app.post("/api/s/{share_id}/messages/{message_id}/react")
async def react_shared_message(share_id: str, message_id: int, request: Request):
    """Anonymous viewer reactions on a shared chat. Counts per emoji, capped to stop spam."""
    import json
    body = await request.json()
    emoji = (body.get("emoji") or "").strip()[:8]
    remove = bool(body.get("remove"))
    if not emoji:
        raise HTTPException(status_code=400, detail="Emoji required")
    async with async_session() as db:
        chat_result = await db.execute(
            select(Chat).where(Chat.share_id == share_id)
        )
        chat = chat_result.scalar_one_or_none()
        if not chat:
            raise HTTPException(status_code=404, detail="Shared chat not found")
        q = select(Message).where(Message.id == message_id, Message.chat_id == chat.id)
        if chat.share_upto:
            q = q.where(Message.id <= chat.share_upto)  # only messages in the public snapshot
        msg = (await db.execute(q)).scalar_one_or_none()
        if not msg:
            raise HTTPException(status_code=404, detail="Message not found")
        try:
            counts = json.loads(msg.viewer_reactions or "{}")
        except Exception:
            counts = {}
        current = int(counts.get(emoji, 0))
        if remove:
            counts[emoji] = current - 1
            if counts[emoji] <= 0:
                counts.pop(emoji, None)
        else:
            counts[emoji] = min(current + 1, 99)
        msg.viewer_reactions = json.dumps(counts)
        await db.commit()
        return {"viewer_reactions": counts}


# ─────────────────────────────────────────────────────────────────────────────
# USAGE METER (free-tier nudge)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/usage/meter")
async def usage_meter(request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    chat_ids = (await db.execute(select(Chat.id).where(Chat.user_id == user.id))).scalars().all()
    if chat_ids:
        msg_count = (await db.execute(
            select(func.count()).where(Message.chat_id.in_(chat_ids), Message.created_at >= today_start)
        )).scalar() or 0
    else:
        msg_count = 0
    is_pro = bool(getattr(user, "is_pro", False) or getattr(user, "is_ultimate", False))
    limit = None if is_pro else 60
    cooldown_until = getattr(user, "cooldown_until", None)
    return {
        "messages_today": msg_count,
        "limit": limit,
        "is_pro": is_pro,
        "cooldown_until": cooldown_until.isoformat() if cooldown_until else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# REMINDERS (scheduled in-app push, in-process loop)
# ─────────────────────────────────────────────────────────────────────────────

class ReminderRequest(BaseModel):
    text: str
    run_at: str  # ISO datetime
    repeat_days: int = 0


@app.get("/api/reminders")
async def list_reminders(request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Reminder).where(Reminder.user_id == user.id).order_by(Reminder.next_run_at)
    )
    return {"reminders": [
        {"id": r.id, "text": r.text, "next_run_at": (r.next_run_at if r.next_run_at.tzinfo else r.next_run_at.replace(tzinfo=timezone.utc)).isoformat(), "repeat_days": r.repeat_days}
        for r in result.scalars().all()
    ]}


@app.post("/api/reminders")
async def create_reminder(req: ReminderRequest, request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Reminder text required")
    try:
        next_run = datetime.fromisoformat(req.run_at.replace("Z", "+00:00"))
        if next_run.tzinfo is None:
            next_run = next_run.replace(tzinfo=timezone.utc)
        next_run = next_run.astimezone(timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail="run_at must be ISO datetime")
    if next_run < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="run_at must be in the future")
    reminder = Reminder(user_id=user.id, text=text[:500], next_run_at=next_run, repeat_days=max(0, int(req.repeat_days)))
    db.add(reminder)
    await db.commit()
    await db.refresh(reminder)
    return {"message": "Reminder scheduled", "id": reminder.id}


@app.patch("/api/reminders/{reminder_id}")
async def update_reminder(reminder_id: int, request: Request, db=Depends(get_db)):
    """Edit a reminder: its text, when it goes off, or how often it repeats. Also used for snooze."""
    user = await get_current_user_from_cookie(request, db)
    rem = (await db.execute(select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == user.id))).scalar_one_or_none()
    if not rem:
        raise HTTPException(status_code=404, detail="Reminder not found")
    body = await request.json()
    if "text" in body:
        text = str(body.get("text") or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="Write what to remind you about.")
        rem.text = text[:500]
    if "run_at" in body:
        try:
            nxt = datetime.fromisoformat(str(body["run_at"]).replace("Z", "+00:00"))
            nxt = (nxt if nxt.tzinfo else nxt.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)
        except Exception:
            raise HTTPException(status_code=400, detail="That date and time isn't valid.")
        if nxt < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Pick a time in the future.")
        rem.next_run_at = nxt
    if "repeat_days" in body:
        try:
            rem.repeat_days = max(0, min(365, int(body.get("repeat_days") or 0)))
        except Exception:
            rem.repeat_days = 0
    await db.commit()
    return {"id": rem.id, "text": rem.text, "next_run_at": (rem.next_run_at if rem.next_run_at.tzinfo else rem.next_run_at.replace(tzinfo=timezone.utc)).isoformat(), "repeat_days": rem.repeat_days}


@app.post("/api/reminders/{reminder_id}/delete")
async def delete_reminder(reminder_id: int, request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == user.id)
    )
    rem = result.scalar_one_or_none()
    if not rem:
        raise HTTPException(status_code=404, detail="Reminder not found")
    await db.delete(rem)
    await db.commit()
    return {"message": "Reminder deleted"}


async def _reminder_loop():
    """Checks due reminders every 30s and pushes them as in-app notifications."""
    while True:
        try:
            async with async_session() as db:
                now = datetime.now(timezone.utc)
                due = await db.execute(select(Reminder).where(Reminder.next_run_at <= now))
                for rem in due.scalars().all():
                    user = await db.get(User, rem.user_id)
                    if user:
                        existing = getattr(user, "pending_notification", "")
                        entry = f"⏰ Reminder: {rem.text}"
                        user.pending_notification = (existing + "\n" + entry).strip()
                    if rem.repeat_days > 0:
                        nxt = now + timedelta(days=rem.repeat_days)
                        rem.next_run_at = nxt
                        rem.last_run_at = now
                    else:
                        await db.delete(rem)
                await db.commit()
        except Exception as e:
            print(f"reminder loop: {e}")
        await asyncio.sleep(30)


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC STATUS PAGE
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/status", response_class=HTMLResponse)
async def status_page():
    return FileResponse("static/status.html")


@app.get("/api/status")
async def api_status(request: Request, db=Depends(get_db)):
    status = {"app": "ok", "version": VERSION, "time": datetime.now(timezone.utc).isoformat(), "database": "ok"}
    try:
        from sqlalchemy import text as _text
        await db.execute(_text("SELECT 1"))
    except Exception:
        status["database"] = "error"
    try:
        from ai import _get_openrouter_keys
        status["ai_keys"] = len(_get_openrouter_keys())
        status["ai"] = "ok" if status["ai_keys"] else "unconfigured"
    except Exception:
        status["ai"] = "error"
    try:
        from sqlalchemy import text as _text
        res = await db.execute(_text("SELECT value FROM system_settings WHERE key='ai_enabled'"))
        row = res.fetchone()
        status["ai_enabled"] = (row[0] if row else "on")
    except Exception:
        pass
    return status


@app.get("/api/debug/keys")
async def debug_keys(request: Request, db=Depends(get_db)):
    # Owner-only; exposes key rotation state (prefixes only, never full keys).
    user = await get_current_user_from_cookie(request, db)
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    from ai import _get_openrouter_keys
    keys = _get_openrouter_keys()
    return {"count": len(keys), "prefixes": [k[:12] + "..." for k in keys]}

# Changes on every deploy (Railway restarts the app), so open pages can tell
# when a newer website is live and refresh themselves (static/js/freshness.js).
BUILD_ID = os.getenv("RAILWAY_DEPLOYMENT_ID") or os.getenv("RAILWAY_GIT_COMMIT_SHA") or str(int(time.time()))


@app.get("/api/version")
async def api_version():
    return JSONResponse({"version": VERSION, "build": BUILD_ID}, headers={"Cache-Control": "no-store"})


@app.get("/api/changelog")
async def get_changelog(request: Request, db=Depends(get_db)):
    """Returns only NEWLY-ADDED changelog entries for the logged-in user (prepended
    to the top since their last 'seen' watermark), so older releases' features stop
    repeating. Guests/anon get the full lists and the app falls back to local tracking."""
    try:
        user = await get_current_user_from_cookie(request, db)
    except HTTPException:
        user = None
    if user and not user.username.startswith("guest_"):
        seen_user = getattr(user, "changelog_seen_user", 0) or 0
        seen_staff = getattr(user, "changelog_seen_staff", 0) or 0
        u_new = max(0, len(USER_CHANGELOG) - seen_user)
        user_changes = USER_CHANGELOG[:u_new]
        # STAFF list = user entries + staff extras; staff extras prepend within their block.
        extras = STAFF_CHANGELOG[len(USER_CHANGELOG):]
        extras_seen = max(0, seen_staff - len(USER_CHANGELOG))
        extra_new = max(0, len(extras) - extras_seen)
        staff_changes = user_changes + extras[:extra_new]
        authed = True
    else:
        user_changes = USER_CHANGELOG
        staff_changes = STAFF_CHANGELOG
        authed = False
    return {
        "version": VERSION,
        "changes": user_changes,
        "user_changes": user_changes,
        "staff_changes": staff_changes,
        "authed": authed,
    }


_VER_RE = re.compile(r"^(\d+\.\d+(?:\.\d+)?)\s+")


def _changelog_groups(entries):
    """Group the flat changelog into releases: an entry that starts with a
    version number opens a new release; the entries after it belong to it."""
    groups = []
    for e in entries:
        m = _VER_RE.match(e)
        if m or not groups:
            groups.append({"version": m.group(1) if m else "", "items": []})
        groups[-1]["items"].append(_VER_RE.sub("", e, count=1))
    return groups


@app.get("/api/changelog/all")
async def changelog_all():
    """Full user-facing history for the What's new page (public)."""
    return {"version": VERSION, "releases": _changelog_groups(USER_CHANGELOG)}


@app.get("/whats-new")
async def whats_new_page():
    return FileResponse("static/whats-new.html")


@app.post("/api/changelog/seen")
async def changelog_seen(request: Request, db=Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if user.username.startswith("guest_"):
        return {"ok": True}
    body = await request.json()
    which = body.get("list", "user")
    if which == "staff":
        # The staff list includes the user entries (user_changes + extras), so
        # acknowledging it must clear both watermarks or the user block would
        # keep reappearing on every reload for staff.
        user.changelog_seen_staff = len(STAFF_CHANGELOG)
        user.changelog_seen_user = len(USER_CHANGELOG)
    else:
        user.changelog_seen_user = len(USER_CHANGELOG)
    await db.commit()
    return {"ok": True}


@app.get("/", response_class=HTMLResponse)
async def landing():
    """Serve the landing page, injecting search-engine verification tags when
    the corresponding env vars are set (Railway-friendly, no code edits)."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "index.html")
    with open(path, "r", encoding="utf-8") as fh:
        html = fh.read()
    tags = []
    gsv = (os.getenv("GOOGLE_SITE_VERIFICATION") or "").strip()
    if gsv:
        tags.append(f'<meta name="google-site-verification" content="{gsv}">')
    bing = (os.getenv("BING_SITE_VERIFICATION") or "").strip()
    if bing:
        tags.append(f'<meta name="msvalidate.01" content="{bing}">')
    if tags:
        html = html.replace("</head>", "\n    ".join([""] + tags) + "\n</head>", 1)
    return HTMLResponse(html)


@app.get("/app", response_class=HTMLResponse)
async def chat_app():
    return FileResponse("static/app.html")


@app.get("/app/c/{link_id}", response_class=HTMLResponse)
async def chat_app_link(link_id: str, request: Request, db=Depends(get_db)):
    """ChatGPT-style deep link to a specific chat (/app/c/<link_id>).
    Logged-out visitors get a clear 'please log in' page instead of being silently
    bounced to the welcome screen. Ownership is enforced client-side via by-link."""
    try:
        await get_current_user_from_cookie(request, db)
    except HTTPException:
        return RedirectResponse(
            url=f"/denied.html?reason=login&link={link_id}",
            status_code=302,
        )
    return FileResponse("static/app.html")


@app.get("/denied.html", response_class=HTMLResponse)
async def denied_page():
    return FileResponse("static/denied.html")


@app.get("/admin", response_class=HTMLResponse)
async def admin_page():
    return FileResponse("static/admin.html")


@app.get("/vault", response_class=HTMLResponse)
async def vault_page():
    return FileResponse("static/vault2.html")


@app.get("/vault/classic")
async def vault_classic_page():
    # Everything from the old Vault now lives in the new one.
    return RedirectResponse(url="/vault", status_code=302)


@app.get("/app/vault-auth", response_class=HTMLResponse)
async def vault_auth_page():
    return FileResponse("static/vault-auth.html")


@app.get("/code", response_class=HTMLResponse)
async def coding_agent_app():
    # Coding AGT. is its own app with its own address, start page and install icon.
    return FileResponse("static/coding-agent.html")


@app.get("/app/coding-agent")
async def coding_agent_page(request: Request):
    # Old address: carry on to the new one (keeps ?project=…).
    q = request.url.query
    return RedirectResponse(url="/code" + (f"?{q}" if q else ""), status_code=302)


def _legal_page(name: str) -> HTMLResponse:
    """Privacy / Terms with the contact line filled in from CONTACT_EMAIL."""
    import html as _h
    page = open(os.path.join("static", "legal", name), encoding="utf-8").read()
    email = (os.getenv("CONTACT_EMAIL") or "mihariser@gmail.com").strip()
    if re.fullmatch(r"[^@\s<>\"']+@[^@\s<>\"']+\.[A-Za-z]{2,}", email):
        e = _h.escape(email)
        contact = (f'email <a href="mailto:{e}">{e}</a>, or use <b>Feedback</b> '
                   'in the app (sidebar → More).')
    else:
        contact = ('use <b>Feedback</b> in the app (sidebar → More) — '
                   '<a href="/app">open Zelpophai</a>. For account deletion, send the request while logged in to that account.')
    return HTMLResponse(page.replace("{{CONTACT}}", contact), headers={"Cache-Control": "public, max-age=600"})


@app.get("/privacy", response_class=HTMLResponse)
@app.get("/privacy-policy", response_class=HTMLResponse, include_in_schema=False)
async def privacy_page():
    return _legal_page("privacy.html")


@app.get("/terms", response_class=HTMLResponse)
@app.get("/terms-of-service", response_class=HTMLResponse, include_in_schema=False)
async def terms_page():
    return _legal_page("terms.html")


@app.get("/mini", response_class=HTMLResponse)
async def mini_page():
    # Zelpophai Mini panel (opened by Ctrl+Shift+Z in the Windows app).
    return FileResponse("static/mini.html")


@app.get("/code/{share_id}", response_class=HTMLResponse)
async def shared_code_page(share_id: str):
    # Read-only view of a shared Coding AGT. project (the page loads it by id).
    return FileResponse("static/coding-agent.html")


# ---------------------------------------------------------------- SEO ----
# Public base URL used for canonical links, Open Graph and the sitemap.
SITE_BASE = os.getenv("APP_BASE_URL", "https://zelpophai.up.railway.app").rstrip("/")


@app.get("/robots.txt", include_in_schema=False)
async def robots_txt():
    body = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /app\n"
        "Disallow: /app/\n"
        "Disallow: /api/\n"
        "Disallow: /admin\n"
        "Disallow: /vault\n"
        "Disallow: /denied.html\n"
        "\n"
        f"Sitemap: {SITE_BASE}/sitemap.xml\n"
    )
    return PlainTextResponse(body, media_type="text/plain")


# Public pages search engines should list. lastmod = when this build started,
# which on Railway is the last deploy.
_SITEMAP_PAGES = [("/", "1.0", "weekly"), ("/download", "0.8", "weekly"), ("/whats-new", "0.6", "weekly"),
                  ("/privacy", "0.3", "monthly"), ("/terms", "0.3", "monthly")]
_DEPLOYED = datetime.now(timezone.utc).strftime("%Y-%m-%d")


@app.get("/sitemap.xml", include_in_schema=False)
async def sitemap_xml():
    entries = "".join(
        f"<url><loc>{SITE_BASE}{path}</loc><lastmod>{_DEPLOYED}</lastmod>"
        f"<changefreq>{freq}</changefreq><priority>{prio}</priority></url>"
        for path, prio, freq in _SITEMAP_PAGES
    )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        f"{entries}</urlset>"
    )
    return Response(content=xml, media_type="application/xml")


# IndexNow (Bing, Yandex, Seznam, Naver…): tells them right away when the
# public pages change. The key is public by design; it only proves we own the site.
INDEXNOW_KEY = os.getenv("INDEXNOW_KEY", "da804247d282f872304442b631ee5271").strip()


@app.get("/{key}.txt", include_in_schema=False)
async def indexnow_key(key: str):
    if not INDEXNOW_KEY or key != INDEXNOW_KEY:
        raise HTTPException(status_code=404, detail="Not found")
    return PlainTextResponse(INDEXNOW_KEY)


async def _indexnow_ping():
    """Once per deploy, ask IndexNow engines to recrawl the public pages."""
    if not INDEXNOW_KEY or not SITE_BASE.startswith("https://") or os.getenv("INDEXNOW_DISABLE"):
        return
    await asyncio.sleep(60)  # let the new deploy take traffic first
    try:
        import httpx
        host = SITE_BASE.split("://", 1)[1].split("/", 1)[0]
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post("https://api.indexnow.org/indexnow", json={
                "host": host, "key": INDEXNOW_KEY, "keyLocation": f"{SITE_BASE}/{INDEXNOW_KEY}.txt",
                "urlList": [SITE_BASE + p for p, _, _ in _SITEMAP_PAGES],
            })
            print(f"IndexNow ping: {r.status_code}")
    except Exception as e:
        print(f"IndexNow ping skipped: {e}")


@app.middleware("http")
async def seo_headers(request: Request, call_next):
    """Keep private/authenticated areas out of search indexes."""
    try:
        response = await call_next(request)
    except Exception as e:
        from vault_events import log_error
        log_error("server", f"{type(e).__name__}: {e}", f"{request.method} {request.url.path}")
        raise
    path = request.url.path
    if response.status_code >= 500:
        from vault_events import log_error
        log_error("server", f"HTTP {response.status_code}", f"{request.method} {path}")
    if (
        path.startswith("/app")
        or path.startswith("/api")
        or path.startswith("/admin")
        or         path.startswith("/vault")
        or path.startswith("/denied")
        or path.startswith("/s/")
        or path.startswith("/i/")
        or path.startswith("/code/")
        or path == "/mini"
    ):
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
    # Baseline browser protections on every response.
    h = response.headers
    h.setdefault("X-Content-Type-Options", "nosniff")                 # never guess a file's type
    h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if "content-security-policy" not in h:
        # Zelpophai may only be framed by itself (stops click-jacking); no plugins; no <base> hijacking.
        h["Content-Security-Policy"] = "frame-ancestors 'self'; object-src 'none'; base-uri 'self'"
    h.setdefault("X-Frame-Options", "SAMEORIGIN")
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto", "") == "https":
        h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    if path.startswith("/api/") and "cache-control" not in h and h.get("content-type", "").startswith("application/json"):
        h["Cache-Control"] = "no-store"                                # private answers are never cached by proxies
    # Every page registers /static/sw.js with scope "/". Browsers refuse a scope
    # above the script's own folder unless this header is present, so the service
    # worker (installable app, offline cache, push notifications) never started.
    if path == "/static/sw.js":
        response.headers["Service-Worker-Allowed"] = "/"
    # Always check for a newer copy of pages and app code (a quick 304 when
    # nothing changed), so the website, the Windows app and the Android app show
    # a new design the moment it's deployed instead of an old cached copy.
    if "cache-control" not in response.headers:
        ctype = response.headers.get("content-type", "")
        if (path.endswith((".js", ".css", ".html", ".json", ".webmanifest"))
                or ctype.startswith("text/html")):
            response.headers["Cache-Control"] = "no-cache"
    return response


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
