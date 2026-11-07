// Zelpophai Mini: the Ctrl+Shift+Z screen agent.
// - Takes a screenshot of the screen under the mouse the moment the shortcut is
//   pressed (before the panel appears), then shows a small always-on-top panel
//   that loads SITE/mini.
// - Gives that panel: fresh screenshots, "select an area", the clipboard,
//   copy / paste-into-the-app, and (Do mode) mouse + keyboard control.
// - Control only works after the user allows it, only during a task the user
//   started, and Esc stops it at any moment.
const { BrowserWindow, desktopCapturer, screen, clipboard, dialog, globalShortcut, ipcMain, shell } = require('electron');
const path = require('path');
const input = require('./input');
const fs = require('fs');
const { execFile, spawn } = require('child_process');

const MAX_SIDE = 1366;           // screenshots sent to the AI are at most this wide
const PANEL = { width: 430, height: 640 };
const MAX_ACTIONS = 120;         // per task

let opts = null;                 // { SITE, isOurs, ICON, getSetting, setSetting, showMain, loadMain }
let panel = null;
let last = null;                 // { image(nativeImage, full res), display, sent:{w,h} }
let control = null;              // { task, actions } while a Do task runs
let pinned = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function displayUnderMouse() {
    try { return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()); } catch (e) { return screen.getPrimaryDisplay(); }
}

async function grab(display) {
    const sf = display.scaleFactor || 1;
    const full = { width: Math.round(display.size.width * sf), height: Math.round(display.size.height * sf) };
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: full });
    const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
    if (!src || src.thumbnail.isEmpty()) throw new Error('Couldn\'t take a screenshot. On Windows, check Settings → Privacy → Screen capture.');
    return src.thumbnail;
}

function forAI(img, maxSide = MAX_SIDE) {
    const s = img.getSize();
    let out = img;
    if (s.width > maxSide) out = img.resize({ width: maxSide, quality: 'good' });
    const o = out.getSize();
    return { image: 'data:image/jpeg;base64,' + out.toJPEG(78).toString('base64'), width: o.width, height: o.height };
}

async function hidePanelFor(fn) {
    const wasVisible = panel && !panel.isDestroyed() && panel.isVisible();
    if (wasVisible) { panel.hide(); await sleep(180); }
    try { return await fn(); }
    finally { if (wasVisible && !control && panel && !panel.isDestroyed()) panel.showInactive(); }
}

async function captureNow(display) {
    display = display || (last && last.display) || displayUnderMouse();
    const img = await grab(display);
    const sent = forAI(img);
    last = { image: img, display, sent: { w: sent.width, h: sent.height } };
    return sent;
}

// Screenshot pixel (in the image the AI saw) → physical screen pixel.
function toScreen(x, y) {
    if (!last) throw new Error('No screenshot yet');
    const d = last.display;
    const dip = { x: d.bounds.x + (x + 0.5) * d.bounds.width / last.sent.w, y: d.bounds.y + (y + 0.5) * d.bounds.height / last.sent.h };
    const p = process.platform === 'win32' && screen.dipToScreenPoint ? screen.dipToScreenPoint(dip) : dip;
    return { x: Math.round(p.x), y: Math.round(p.y) };
}

function placePanel(display) {
    const wa = display.workArea;
    const w = Math.min(PANEL.width, wa.width - 24), h = Math.min(PANEL.height, wa.height - 24);
    panel.setBounds({ x: wa.x + wa.width - w - 16, y: wa.y + wa.height - h - 16, width: w, height: h });
}

function createPanel() {
    panel = new BrowserWindow({
        width: PANEL.width, height: PANEL.height, show: false, frame: false, resizable: true,
        minWidth: 340, minHeight: 420, alwaysOnTop: true, skipTaskbar: true, fullscreenable: false,
        maximizable: false, minimizable: false, backgroundColor: '#0b1020', title: 'Zelpophai Mini', icon: opts.ICON,
        webPreferences: { preload: path.join(__dirname, 'mini-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
    });
    panel.setAlwaysOnTop(true, 'floating');
    panel.webContents.setUserAgent(panel.webContents.getUserAgent() + ' ZelpophaiDesktop/' + require('electron').app.getVersion() + ' ZelpophaiMini');
    panel.loadURL(opts.SITE + '/mini');
    panel.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
        if (isMain && code !== -3) panel.loadFile(path.join(__dirname, 'offline.html'), { query: { to: opts.SITE + '/mini' } });
    });
    panel.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
    panel.webContents.on('will-navigate', (e, url) => { if (!opts.isOurs(url) && !url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
    panel.on('blur', () => { if (!pinned && !control && panel && panel.isVisible() && !regionOpen) panel.hide(); });
    panel.on('closed', () => { panel = null; });
}

async function toggle() {
    if (control) { stopControl('shortcut'); return; }
    if (panel && panel.isVisible() && panel.isFocused()) { panel.hide(); return; }
    const display = displayUnderMouse();
    let shot = null;
    try {
        if (panel && panel.isVisible()) { panel.hide(); await sleep(150); }
        shot = await captureNow(display);
    } catch (e) { shot = { error: String(e.message || e) }; }
    if (!panel) createPanel();
    listApps().catch(() => {});   // warm the installed-apps list in the background
    placePanel(display);
    panel.show();
    panel.focus();
    const send = () => panel.webContents.send('mini-shown', { hasShot: !!(shot && shot.image), error: shot && shot.error });
    if (panel.webContents.isLoading()) panel.webContents.once('did-finish-load', send); else send();
}

/* ─────────────────────────── select an area ── */
let regionOpen = false;
async function selectArea() {
    const display = (panel && screen.getDisplayMatching(panel.getBounds())) || displayUnderMouse();
    return hidePanelFor(async () => {
        const img = await grab(display);
        regionOpen = true;
        const ov = new BrowserWindow({
            x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height,
            frame: false, show: false, alwaysOnTop: true, skipTaskbar: true, resizable: false, movable: false,
            fullscreenable: false, enableLargerThanScreen: true, backgroundColor: '#000000',
            webPreferences: { preload: path.join(__dirname, 'region-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
        });
        ov.setAlwaysOnTop(true, 'screen-saver');
        ov.setBounds(display.bounds);
        await ov.loadFile(path.join(__dirname, 'region.html'));
        const preview = img.getSize().width > 2560 ? img.resize({ width: 2560 }) : img;
        ov.webContents.send('region-image', 'data:image/jpeg;base64,' + preview.toJPEG(85).toString('base64'));
        ov.show(); ov.focus();
        const rect = await new Promise((resolve) => {
            const onDone = (e, r) => { if (e.sender === ov.webContents) finish(r); };
            const finish = (r) => { ipcMain.removeListener('region-done', onDone); resolve(r); };
            ipcMain.on('region-done', onDone);
            ov.on('closed', () => finish(null));
        });
        regionOpen = false;
        if (!ov.isDestroyed()) ov.destroy();
        if (!rect) return null;
        const s = img.getSize();
        const crop = {
            x: Math.max(0, Math.round(rect.x * s.width)), y: Math.max(0, Math.round(rect.y * s.height)),
            width: Math.round(rect.w * s.width), height: Math.round(rect.h * s.height),
        };
        crop.width = Math.max(4, Math.min(crop.width, s.width - crop.x));
        crop.height = Math.max(4, Math.min(crop.height, s.height - crop.y));
        const part = img.crop(crop);
        return forAI(part, 1600);
    });
}

/* ─────────────────────────── installed apps ── */
// Everything in the Start menu (desktop programs and Store apps, e.g. Roblox,
// Minecraft Launcher, VPN apps) plus shortcuts on the desktop. Mini can only
// launch things from this list — never an arbitrary command.
let appsCache = null, appsAt = 0, appsLoading = null;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function startApps() {
    return new Promise((resolve) => {
        const cmd = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress";
        execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', cmd],
            { windowsHide: true, timeout: 25000, maxBuffer: 16 * 1024 * 1024 }, (err, out) => {
                try {
                    const j = JSON.parse(String(out || '').trim() || '[]');
                    resolve((Array.isArray(j) ? j : [j]).filter((a) => a && a.Name && a.AppID).map((a) => ({ name: String(a.Name), id: String(a.AppID) })));
                } catch (e) { resolve([]); }
            });
    });
}

function shortcutApps() {
    const env = process.env, out = [];
    const roots = [
        path.join(env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
        path.join(env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
        path.join(env.USERPROFILE || '', 'Desktop'),
        path.join(env.PUBLIC || 'C:\\Users\\Public', 'Desktop'),
        path.join(env.USERPROFILE || '', 'OneDrive', 'Desktop'),
    ];
    const walk = (dir, depth) => {
        let items = [];
        try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
        for (const it of items) {
            const full = path.join(dir, it.name);
            if (it.isDirectory()) { if (depth < 3) walk(full, depth + 1); continue; }
            if (/\.(lnk|url)$/i.test(it.name)) out.push({ name: it.name.replace(/\.(lnk|url)$/i, ''), path: full });
        }
    };
    roots.forEach((r) => r && walk(r, 0));
    return out;
}

async function listApps() {
    if (process.platform !== 'win32') return [];
    if (appsCache && Date.now() - appsAt < 10 * 60 * 1000) return appsCache;
    if (appsLoading) return appsLoading;
    appsLoading = (async () => {
        const seen = new Set(), list = [];
        const add = (a) => { const k = norm(a.name); if (!k || seen.has(k)) return; seen.add(k); list.push(a); };
        (await startApps()).forEach(add);
        shortcutApps().forEach(add);
        list.sort((a, b) => a.name.localeCompare(b.name));
        appsCache = list; appsAt = Date.now(); appsLoading = null;
        return list;
    })();
    return appsLoading;
}

async function launchApp(name) {
    const want = norm(name);
    if (!want) throw new Error('Which app?');
    const apps = await listApps();
    let hit = apps.find((a) => norm(a.name) === want)
        || apps.filter((a) => norm(a.name).startsWith(want)).sort((a, b) => a.name.length - b.name.length)[0]
        || apps.filter((a) => norm(a.name).includes(want) || want.includes(norm(a.name)) && norm(a.name).length >= 4)
            .sort((a, b) => a.name.length - b.name.length)[0];
    if (!hit) throw new Error(`"${name}" isn't installed (or isn't in the Start menu)`);
    if (hit.id) {
        const p = spawn('explorer.exe', ['shell:AppsFolder\\' + hit.id], { detached: true, stdio: 'ignore', windowsHide: true });
        p.on('error', () => {}); p.unref();
    } else {
        const err = await shell.openPath(hit.path);
        if (err) throw new Error(err);
    }
    return hit.name;
}

/* ─────────────────────────────── control ── */
function stopControl() {
    if (!control) return;
    control = null;
    try { globalShortcut.unregister('Escape'); } catch (e) {}
    if (panel && !panel.isDestroyed()) {
        panel.webContents.send('mini-stop');
        if (!panel.isVisible()) panel.showInactive();
    }
}

async function runAction(a) {
    if (!control) throw new Error('Stopped');
    if (++control.actions > MAX_ACTIONS) throw new Error('Too many actions for one task');
    if (!a || typeof a !== 'object') throw new Error('Bad action');
    const t = String(a.type || '');
    const num = (v) => { const n = Number(v); if (!Number.isFinite(n)) throw new Error('Bad position'); return n; };
    const within = (x, y) => {
        if (!last) throw new Error('No screenshot');
        if (x < 0 || y < 0 || x >= last.sent.w || y >= last.sent.h) throw new Error('Position is off the screen');
        return toScreen(x, y);
    };
    if (t === 'wait') { await sleep(Math.max(100, Math.min(3000, num(a.ms || 800)))); return; }
    if (t === 'launch') { await launchApp(String(a.app || '').slice(0, 120)); await sleep(2500); return; }
    if (t === 'open') {
        const url = String(a.url || '');
        if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new Error('Only web addresses can be opened');
        await shell.openExternal(url); await sleep(1200); return;
    }
    if (panel && panel.isVisible()) { panel.hide(); await sleep(160); }
    if (t === 'click') { const p = within(num(a.x), num(a.y)); await input.send({ op: 'click', x: p.x, y: p.y, button: a.button === 'right' ? 'right' : 'left', double: !!a.double }); }
    else if (t === 'move') { const p = within(num(a.x), num(a.y)); await input.send({ op: 'move', x: p.x, y: p.y }); }
    else if (t === 'drag') { const p = within(num(a.x), num(a.y)), q = within(num(a.x2), num(a.y2)); await input.send({ op: 'drag', x: p.x, y: p.y, x2: q.x, y2: q.y }); }
    else if (t === 'scroll') { const p = within(num(a.x), num(a.y)); await input.send({ op: 'scroll', x: p.x, y: p.y, amount: Math.max(-10, Math.min(10, Math.round(num(a.amount || -3)))) }); }
    else if (t === 'type') { const text = String(a.text || '').slice(0, 2000); if (text) await input.send({ op: 'type', text }); }
    else if (t === 'key') { const keys = String(a.keys || '').toLowerCase().replace(/\s+/g, ''); if (!/^[a-z0-9+\-]{1,40}$/.test(keys)) throw new Error('Bad keys'); await input.send({ op: 'keys', keys }); }
    else throw new Error('Unknown action');
    await sleep(t === 'type' ? 250 : 450);
}

function fromPanel(e) {
    return panel && !panel.isDestroyed() && e.sender === panel.webContents && opts.isOurs(e.senderFrame.url);
}

function setup(o) {
    opts = o;
    const guard = (fn) => async (e, ...args) => { if (!fromPanel(e)) throw new Error('Not allowed'); return fn(e, ...args); };

    ipcMain.handle('mini-last-capture', guard(async () => {
        if (!last) return null;
        const s = forAI(last.image);
        return s;
    }));
    ipcMain.handle('mini-capture', guard(async () => hidePanelFor(() => captureNow())));
    ipcMain.handle('mini-select-area', guard(async () => {
        const r = await selectArea();
        if (panel && !panel.isDestroyed()) { panel.show(); panel.focus(); }
        return r;
    }));
    ipcMain.handle('mini-apps', guard(async () => (await listApps()).map((a) => a.name).slice(0, 400)));
    ipcMain.handle('mini-clipboard', guard(async () => String(clipboard.readText() || '').slice(0, 20000)));
    ipcMain.handle('mini-copy', guard(async (e, text) => { clipboard.writeText(String(text || '')); return true; }));
    ipcMain.handle('mini-paste', guard(async (e, text) => {
        // Put it on the clipboard, step out of the way and paste into the app underneath.
        clipboard.writeText(String(text || ''));
        if (process.platform !== 'win32') return false;
        panel.hide(); await sleep(250);
        await input.send({ op: 'keys', keys: 'ctrl+v' });
        return true;
    }));
    ipcMain.handle('mini-control-start', guard(async (e, task) => {
        if (process.platform !== 'win32') throw new Error('Controlling the PC only works on Windows.');
        if (!o.getSetting('miniControlOk', false)) {
            const r = await dialog.showMessageBox(panel, {
                type: 'question', buttons: ['Allow', 'Cancel'], defaultId: 0, cancelId: 1, icon: o.ICON,
                title: 'Let Zelpophai Mini use your PC?',
                message: 'Allow Zelpophai Mini to move the mouse and type for you?',
                detail: 'It only acts during a task you start, asks you before risky steps (and before every step unless you choose otherwise), and stops the moment you press Esc. It never types passwords or payment details.',
                checkboxLabel: 'Don\'t ask me again', checkboxChecked: false,
            });
            if (r.response !== 0) return false;
            if (r.checkboxChecked) o.setSetting('miniControlOk', true);
        }
        await input.start();
        control = { task: String(task || '').slice(0, 300), actions: 0 };
        try { globalShortcut.register('Escape', () => stopControl()); } catch (err) {}
        return true;
    }));
    ipcMain.handle('mini-act', guard(async (e, a) => { await runAction(a); return { ok: true }; }));
    ipcMain.handle('mini-control-end', guard(async () => { stopControl(); return true; }));
    ipcMain.handle('mini-show', guard(async () => { if (panel && !panel.isVisible()) panel.showInactive(); return true; }));
    ipcMain.handle('mini-hide', guard(async () => { if (panel) panel.hide(); return true; }));
    ipcMain.handle('mini-pin', guard(async (e, on) => { pinned = !!on; return pinned; }));
    ipcMain.handle('mini-open-app', guard(async (e, p) => {
        const url = String(p || '/app');
        if (!url.startsWith('/')) throw new Error('Bad path');
        if (panel) panel.hide();
        o.loadMain(o.SITE + url);
        return true;
    }));
}

function register(accel) {
    try { return globalShortcut.register(accel || 'Control+Shift+Z', toggle); } catch (e) { return false; }
}
function unregister(accel) { try { globalShortcut.unregister(accel || 'Control+Shift+Z'); } catch (e) {} }

module.exports = { setup, toggle, register, unregister, stop: () => { stopControl(); input.stop(); } };
