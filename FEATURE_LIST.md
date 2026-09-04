# Zenith AI — Complete Feature Inventory

Date: 2026-09-03 · Compiled from a full read of the codebase (backend routers, frontend JS, templates).

## 1. Authentication & Accounts
- Register, login, logout, logout-all (revokes all my sessions via `token_version`)
- Guest mode (username prefix `guest_`, limited features, 60-msg daily budget → 30-minute pause that also blocks image-gen)
- Google OAuth login (`google_auth.py`)
- Forgot password (`/api/auth/forgot-password`)
- Admin password reset → target user gets a "password changed" screen with the new password
- Own account protection: Owner (`WANZU-IBRAHIM`) cannot be banned/deleted (server-enforced)
- Sessions are cookie-based (`zenith_token`, HTTP-only)
- Session versioning for force logout / lock-all (token `ver` check)

## 2. Chat (core AI assistant)
- Chat CRUD: create/rename/delete chats, simple/streaming messages
- Edit messages; copy; download
- AI model selection, max tokens, temperature, personality per user (settings)
- Math engine & offline answers / offline mode (real math engine)
- Presence: live online/offline (heartbeat every 1s / 5s, last_seen)
- Voice input + AI voice reply (`voice.js`)
- Search across chats/memories/knowledge (`search.py`)
- Document generator (`generate.py` — `/api/generate/document`)

## 3. Knowledge & Memory
- Persistent memory store (add/list/edit/delete/search; `memories.py`)
- Auto memory extraction (`/api/memories/auto-extract`)
- Knowledge bases + items (create/delete KB, add items/batch upload, search; `knowledge.py`)

## 4. Files
- Upload/download/read/delete files, versioning (uploaded_files) — per user & per chat

## 5. Image Generation
- `/api/image/generate` with usage logging

## 6. Code Sandbox
- Execute user code; auto-correct snippets; copy (`codeexec.py` + `codeexec.js`)

## 7. Billing / Upgrades (Pro & Ultimate)
- Plans listing, status, Stripe-hosted checkout, subscription webhook (`billing.py`)
- 5-day Pro trial start/checkout
- Auto-assign Ultimate to Owner/admins (database init)

## 8. Security & Logging
- Login history (per user + admin all-users)
- Security dashboard, analytics exports (users/chats/messages CSV)

## 9. Admin / Owner Vault (`/vault`, `vault.js`)
- Dashboard: account totals, charts (donut, line, bar), system stats (CPU/RAM/users-over-time), activity feed, online users
- User management: ban/unban (with reason + banned-by), delete/restore, reset password, promote/demote
- View & clear chats/messages; view target user's chats
- Permission editor (ban_users, reset_password, view_messages, manage_chats, delete_users …)
- Admin management (create admins via secret, list admins, view role)
- Broadcasts: send to all, clear broadcast cache
- Backups: emergency DB backup + restore
- Audit logs; security; settings; owner command

## 10. Staff Tools (`staff.py`, `staff.js`)
- Staff live chat (chat + clear), doordash-style attention board
- Staff broadcast form (popup to all users)

## 11. Feedback
- Submit feedback; admin respond; user sees reply badge; respond/delete

## 12. Global Controls & Emergency Shutdowns (`global_controls.py`)
- System state endpoint (owner) + public state (polled by clients)
- **Chosen Helpers**: owner selects staff exempt from shutdowns; they get a live-chat popup;
  normal users get `maintenance_off`/`unlocked`, helpers get `helper_thanks`
- Emergency actions (full-screen popups to logged-in users via announcement feed + pending_notification):
  - Emergency Maintenance (🚧), Lock All Accounts (🔒), Unlock All (reversible), Force Logout,
    Disable Registrations, Disable Messaging, Disable AI, Emergency Backup
- All are reversible (maintenance/unlock-all/registrations/messaging/ai toggle both ways)
- Owner does NOT see emergency popups (removed from vault)

## 13. Notifications & Popups
- Pending-notification system (`pending_notification` column + `/me/clear-notification`)
  - promoted / demoted (role change popup)
  - locked / maintenance (persistent full-screen, self-clears when owner toggles off)
  - force_logout (popup → logout)
  - chosen / unchosen / helper_thanks (helper chat popups)
  - unlocked / maintenance_off (clear screen + reload)
- Broadcast popups (owner = titanium, staff = gold)
- Discord-style in-app toasts (icon + avatar + message)
- In-app only device push (no browser permission burst), emergency toasts

## 14. UI / App Shell
- Responsive sidebar (collapsible), owner vault styling (titanium) vs admin (gold)
- Theme/accent/message-spacing settings; display name
- Service Worker (network-first for app code, cache-bumped per deploy) — PWA manifest & icons

## 15. System / Ops
- `/api/system/stats`, users-over-time, system_settings table
- Auto DB init/migrations (additive columns) in `database.py`
- Multiple OpenRouter key rotation (`get_openrouter_keys`)
- Railway deploy via git push (Procfile, railway.json)

---

### Note
This inventory is complete as of the current commit. The only functional change since the deep audit
began is the **broadcast delivery fix** (vault receives broadcasts; app.js delivery hardened) documented
in `AUDIT_REPORT.md`.
