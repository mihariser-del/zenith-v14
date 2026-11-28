// Zelpophai AI for Windows (Electron).
// The window shows the live Zelpophai site, so app features update the moment
// the site does. The program itself updates through GitHub Releases: it checks
// on launch and every few hours, downloads quietly, then asks to restart.
const { app, BrowserWindow, Menu, Tray, shell, dialog, globalShortcut, ipcMain, nativeImage, Notification, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const runner = require('./runner');
const mini = require('./mini');

const SITE = process.env.ZELPOPHAI_URL || 'https://zelpophai.com';
// The site moved to zelpophai.com in 24.2. The old Railway address still works,
// so treat both as ours — otherwise a link or a redirect between the two would
// open in the browser instead of the app, and Zelpophai Mini would refuse it.
const OUR_ORIGINS = new Set([new URL(SITE).origin, 'https://zelpophai.com', 'https://www.zelpophai.com', 'https://zelpophai.up.railway.app']);
const START = SITE + '/app';
const ICON = path.join(__dirname, 'build', 'icon.png');
const STATE_FILE = () => path.join(app.getPath('userData'), 'window.json');

let win = null;
let tray = null;
let quitting = false;
let updateReady = null;

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => showWindow());
}

app.setAppUserModelId('com.zelpophai.desktop');

function loadState() {
    try { return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8')); } catch (e) { return {}; }
}
function saveState() {
    if (!win || win.isDestroyed()) return;
    const s = { ...loadState(), bounds: win.getNormalBounds(), maximized: win.isMaximized() };
    try { fs.writeFileSync(STATE_FILE(), JSON.stringify(s)); } catch (e) {}
}
function getSetting(k, d) { const s = loadState(); return k in s ? s[k] : d; }
function setSetting(k, v) { const s = loadState(); s[k] = v; try { fs.writeFileSync(STATE_FILE(), JSON.stringify(s)); } catch (e) {} }

function isOurs(url) {
    try { return OUR_ORIGINS.has(new URL(url).origin); } catch (e) { return false; }
}

function createWindow() {
    const st = loadState();
    win = new BrowserWindow({
        width: (st.bounds && st.bounds.width) || 1280,
        height: (st.bounds && st.bounds.height) || 820,
        x: st.bounds && st.bounds.x, y: st.bounds && st.bounds.y,
        minWidth: 380, minHeight: 520,
        backgroundColor: '#070a17',
        icon: ICON,
        title: 'Zelpophai AI',
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: true,
        },
    });
    if (st.maximized) win.maximize();
    win.webContents.setUserAgent(win.webContents.getUserAgent() + ' ZelpophaiDesktop/' + app.getVersion());
    win.once('ready-to-show', () => win.show());

    win.loadURL(START);
    win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
        if (isMain && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'), { query: { to: url || START } });
    });

    // Links to other sites open in the normal browser; Google sign-in too
    // (Google doesn't allow signing in inside apps), so the app suggests the
    // username/password login there.
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (isOurs(url) && !/\/api\/(files|generate)\//.test(url)) return { action: 'allow' };
        shell.openExternal(url);
        return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
        if (!isOurs(url) && !url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); }
    });

    // Downloads (generated files, code .zip) ask where to save.
    session.defaultSession.on('will-download', (e, item) => {
        item.once('done', (ev, state) => {
            if (state === 'completed' && Notification.isSupported()) {
                const n = new Notification({ title: 'Download complete', body: path.basename(item.getSavePath()), icon: ICON });
                n.on('click', () => shell.showItemInFolder(item.getSavePath()));
                n.show();
            }
        });
    });

    win.on('close', (e) => {
        saveState();
        if (!quitting && getSetting('closeToTray', true)) {
            e.preventDefault();
            win.hide();
            if (!getSetting('trayHintShown', false) && Notification.isSupported()) {
                new Notification({ title: 'Zelpophai AI is still running', body: 'It lives in the tray (bottom-right) so replies and reminders can reach you. Right-click the tray icon to quit.', icon: ICON }).show();
                setSetting('trayHintShown', true);
            }
        }
    });
    win.on('resize', saveState);
    win.on('move', saveState);
}

// Choices made in the installer's "Customize" screen (written by the installer
// to %APPDATA%\\Zelpophai AI\\installer-options.json) are applied once.
function applyInstallerOptions() {
    const f = path.join(app.getPath('userData'), 'installer-options.json');
    let o = null;
    try { o = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return; }
    try { fs.unlinkSync(f); } catch (e) {}
    if (o && typeof o.startWithWindows === 'boolean') {
        app.setLoginItemSettings({ openAtLogin: o.startWithWindows, args: ['--hidden'] });
    }
}

function showWindow() {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
}

function quickAsk() {
    showWindow();
    // Start a fresh chat and focus the message box.
    win.webContents.executeJavaScript(`(function(){try{var b=document.getElementById('new-chat-btn');if(b&&location.pathname.startsWith('/app')&&!location.pathname.startsWith('/app/coding'))b.click();setTimeout(function(){var i=document.getElementById('user-input');if(i)i.focus()},150)}catch(e){}})()`).catch(() => {});
}

function buildTray() {
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
    tray.setToolTip('Zelpophai AI');
    const menu = () => Menu.buildFromTemplate([
        { label: 'Open Zelpophai AI', click: showWindow },
        { label: 'New chat  (Ctrl+Shift+Space)', click: quickAsk },
        { label: 'Coding AGT.', click: () => { showWindow(); win.loadURL(SITE + '/app/coding-agent'); } },
        { label: 'Zelpophai Mini  (Ctrl+Shift+Z)', click: () => mini.toggle() },
        { type: 'separator' },
        { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
          click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }) },
        { label: 'Keep running when closed', type: 'checkbox', checked: getSetting('closeToTray', true),
          click: (i) => setSetting('closeToTray', i.checked) },
        { label: 'Ctrl+Shift+Z opens Zelpophai Mini', type: 'checkbox', checked: getSetting('miniShortcut', true),
          click: (i) => { setSetting('miniShortcut', i.checked); if (i.checked) mini.register(); else mini.unregister(); } },
        { label: 'Show the Zelpophai Mini bubble', type: 'checkbox', checked: getSetting('miniBubble', true),
          click: (i) => mini.setBubble(i.checked) },
        { label: updateReady ? `Restart to update to ${updateReady}` : 'Check for updates', click: () => updateReady ? installNow() : checkUpdates(true) },
        { type: 'separator' },
        { label: `Version ${app.getVersion()}`, enabled: false },
        { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu());
    tray.on('click', showWindow);
    tray.__rebuild = () => tray.setContextMenu(menu());
}

/* ─────────────────────────── updates ── */
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
let manualCheck = false;

function checkUpdates(manual) {
    manualCheck = !!manual;
    autoUpdater.checkForUpdates().catch((e) => {
        if (manualCheck) dialog.showMessageBox(win, { type: 'warning', title: 'Update check failed', message: 'Couldn\'t check for updates right now.', detail: String(e && e.message || e) });
    });
}
function installNow() { quitting = true; autoUpdater.quitAndInstall(false, true); }

autoUpdater.on('update-not-available', () => {
    if (manualCheck) dialog.showMessageBox(win, { type: 'info', title: 'Zelpophai AI', message: 'You have the latest version.', detail: `Version ${app.getVersion()}` });
    manualCheck = false;
});
autoUpdater.on('update-available', (info) => {
    if (win) win.webContents.send('zp-update', { state: 'downloading', version: info.version });
});
autoUpdater.on('download-progress', (p) => {
    if (win) { win.setProgressBar(p.percent / 100); win.webContents.send('zp-update', { state: 'progress', percent: Math.round(p.percent) }); }
});
autoUpdater.on('update-downloaded', async (info) => {
    updateReady = info.version;
    if (win) win.setProgressBar(-1);
    if (tray && tray.__rebuild) tray.__rebuild();
    const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes.replace(/<[^>]+>/g, '').trim().slice(0, 600) : '';
    const r = await dialog.showMessageBox(win && win.isVisible() ? win : null, {
        type: 'info',
        title: 'Update ready',
        message: `Zelpophai AI ${info.version} is ready to install.`,
        detail: (notes ? 'What\'s new:\n' + notes + '\n\n' : '') + 'Restart now to update, or it will install the next time you quit the app.',
        buttons: ['Restart & update', 'Later'],
        defaultId: 0, cancelId: 1, icon: ICON,
    });
    if (r.response === 0) installNow();
});
autoUpdater.on('error', (e) => {
    if (manualCheck) dialog.showMessageBox(win, { type: 'warning', title: 'Update problem', message: 'The update couldn\'t be downloaded.', detail: String(e && e.message || e) });
    manualCheck = false;
});

/* ───────────────────── page ↔ app bridge ── */
ipcMain.handle('zp-info', () => ({ version: app.getVersion(), platform: process.platform, updateReady }));
ipcMain.handle('zp-check-updates', () => { checkUpdates(true); return true; });
ipcMain.handle('zp-install-update', () => { if (updateReady) installNow(); return !!updateReady; });
ipcMain.handle('zp-languages', () => runner.languages());
let runTrusted = false;
ipcMain.handle('zp-run', async (e, req) => {
    if (!isOurs(e.senderFrame.url)) throw new Error('Not allowed');
    if (!req || typeof req !== 'object' || typeof req.entry !== 'string' || typeof req.files !== 'object') throw new Error('Bad request');
    if (runTrusted) return runner.run(req, (chunk) => { if (!e.sender.isDestroyed()) e.sender.send('zp-run-output', chunk); });
    const r = await dialog.showMessageBox(win, {
        type: 'question', buttons: ['Run on my computer', 'Cancel'], defaultId: 0, cancelId: 1,
        title: 'Run code on this computer?',
        message: `Run ${req.entry} with ${req.lang}?`,
        detail: 'Coding AGT. wants to run this project on your computer in a temporary folder. Only do this for code you trust.',
        checkboxLabel: 'Don\'t ask again for this session', checkboxChecked: false,
    });
    if (r.response !== 0) return { cancelled: true };
    if (r.checkboxChecked) runTrusted = true;
    return runner.run(req, (chunk) => { if (!e.sender.isDestroyed()) e.sender.send('zp-run-output', chunk); });
});
ipcMain.handle('zp-stop', () => runner.stop());

/* ── 1.6.0: Coding AGT. working in a folder on this PC (see localfs.js) ── */
const localfs = require('./localfs');
const trustedRoots = new Set();       // folders where commands may run without asking again (this session)
const guard = (e) => { if (!isOurs(e.senderFrame.url)) throw new Error('Not allowed'); };
ipcMain.handle('zp-fs-pick', async (e, opts) => {
    guard(e);
    const r = await dialog.showOpenDialog(win, {
        title: 'Choose a folder for Coding AGT. to work in',
        buttonLabel: 'Use this folder',
        defaultPath: opts && typeof opts.defaultPath === 'string' ? opts.defaultPath : app.getPath('documents'),
        properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return { cancelled: true };
    return localfs.addRoot(r.filePaths[0]);
});
ipcMain.handle('zp-fs-list', (e, id, sub, opts) => { guard(e); return localfs.list(id, sub, opts); });
ipcMain.handle('zp-fs-read', (e, id, rel) => { guard(e); return localfs.read(id, rel); });
ipcMain.handle('zp-fs-write', (e, id, rel, content) => { guard(e); if (typeof content !== 'string' || content.length > 5e6) throw new Error('Too big'); return localfs.write(id, rel, content); });
ipcMain.handle('zp-fs-delete', (e, id, rel) => { guard(e); return localfs.remove(id, rel, (abs) => shell.trashItem(abs)); });
ipcMain.handle('zp-fs-open', async (e, id, rel, how) => {
    guard(e);
    const abs = localfs.resolve(id, rel || '');
    if (how === 'show') { shell.showItemInFolder(abs); return { ok: true }; }
    // Opening a file with its program: only documents, never programs or scripts.
    if (/\.(exe|bat|cmd|ps1|vbs|js|jse|wsf|msi|com|scr|lnk|reg|hta|jar)$/i.test(abs)) { shell.showItemInFolder(abs); return { ok: true, shown: true }; }
    const err = await shell.openPath(abs);
    return { ok: !err, error: err || undefined };
});
ipcMain.handle('zp-fs-exec', async (e, id, command, opts) => {
    guard(e);
    command = String(command || '').trim();
    if (!command || command.length > 4000) throw new Error('Bad command');
    const r0 = localfs.root(id);
    const risky = localfs.dangerous(command);
    if (risky || !trustedRoots.has(id)) {
        const r = await dialog.showMessageBox(win, {
            type: risky ? 'warning' : 'question',
            buttons: risky ? ['Run it', 'Cancel'] : ['Run', 'Cancel'], defaultId: risky ? 1 : 0, cancelId: 1,
            title: risky ? 'This command could delete or change things' : 'Let Coding AGT. run a command?',
            message: command.length > 400 ? command.slice(0, 400) + '…' : command,
            detail: `In the folder: ${r0.real}${risky ? '\n\nThis looks like it could delete files or change system settings. Only run it if you are sure.' : '\n\nOnly allow commands you understand or trust.'}`,
            checkboxLabel: risky ? undefined : 'Don\'t ask again for this folder (until the app closes)', checkboxChecked: false,
        });
        if (r.response !== 0) return { cancelled: true };
        if (!risky && r.checkboxChecked) trustedRoots.add(id);
    }
    return localfs.exec(id, command, opts, (chunk) => { if (!e.sender.isDestroyed()) e.sender.send('zp-run-output', chunk); });
});
ipcMain.handle('zp-fs-stop', (e) => { guard(e); return localfs.stop(); });
ipcMain.handle('zp-fs-command-for', (e, rel) => { guard(e); return localfs.commandFor(String(rel || '')); });

app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    // Start every launch with fresh pages, scripts and styles from the website
    // (sign-ins and settings are kept — those live in cookies and storage).
    try { await session.defaultSession.clearCache(); } catch (e) {}
    applyInstallerOptions();
    createWindow();
    buildTray();
    if (process.argv.includes('--hidden')) win.once('ready-to-show', () => win.hide());
    globalShortcut.register('Control+Shift+Space', quickAsk);
    mini.setup({ SITE, isOurs, ICON, getSetting, setSetting, loadMain: (url) => { showWindow(); win.loadURL(url); } });
    if (getSetting('miniShortcut', true) && !mini.register() && Notification.isSupported()) {
        new Notification({ title: 'Zelpophai Mini', body: 'Ctrl+Shift+Z is used by another app, so open Mini from the tray icon instead.', icon: ICON }).show();
    }
    setTimeout(() => checkUpdates(false), 8000);
    setInterval(() => checkUpdates(false), 4 * 60 * 60 * 1000);
});

app.on('before-quit', () => { quitting = true; saveState(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); mini.stop(); });
app.on('window-all-closed', () => { /* stays in tray */ });
