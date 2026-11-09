# Zelpophai AI for Windows

Electron shell around https://zelpophai.up.railway.app with a tray icon,
notifications, Ctrl+Shift+Space quick ask, local code running for Coding AGT.
(`runner.js`, asks first) and self-updates from
`https://zelpophai.up.railway.app/downloads/win/latest.yml`.

## Zelpophai Mini (Ctrl+Shift+Z)
`mini.js` opens a small panel (`SITE/mini`) after taking a screenshot of the screen
under the mouse. `region.html` is the "select an area" overlay. Do mode drives the
mouse/keyboard through `input.js` (a hidden PowerShell process with a C# SendInput
helper). Control only runs during a task the user starts, after a one-time
permission dialog, and Esc stops it.

## Installer
`build/installer.nsh` customises electron-builder's NSIS wizard: a welcome page
with **Install** (quick: no other pages, opens the app) and **Customize
installation** (folder + extras). Artwork: `build/installerSidebar.bmp`
(164×314), `build/installerHeader.bmp` (150×57), `build/icon.ico`.

## Release a new version
1. Bump `version` in `package.json`.
2. Build: `npm install && npx electron-builder --win --x64 --publish never`
   (on Linux this needs `wine64` + `wine32:i386`).
3. Upload `dist/Zelpophai-Setup.exe`, `dist/Zelpophai-Setup.exe.blockmap` and
   `dist/latest.yml` (in that order — latest.yml last) to
   `POST /api/app/upload?platform=win&name=<file>` with the `X-Upload-Token`
   header (token hash lives in `appdist.py` / `APP_UPLOAD_TOKEN_SHA256`).
Installed apps pick the update up within a few hours (or via tray → Check for updates).
