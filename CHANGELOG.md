# Changelog

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
- Document title updated to Zenith AI (was Zenith)

## 14.0 — Previous

- Initial 14.0 release
