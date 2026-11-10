// Mouse and keyboard for Zelpophai Mini's Do mode (Windows only).
//
// Uses libnut (the open-source native module behind nut.js) inside the app
// itself. Earlier versions started a hidden PowerShell process with an encoded
// command that compiled input code at runtime — exactly the pattern antivirus
// programs treat as malware, which is why some of them blocked the app.
// Coordinates are physical screen pixels (the app is DPI aware).

let lib = null;
function load() {
    if (process.platform !== 'win32') throw new Error('Controlling the PC only works on Windows.');
    if (!lib) {
        lib = require('@nut-tree-fork/libnut-win32');
        lib.setMouseDelay(0);
        lib.setKeyboardDelay(8);
    }
    return lib;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Our key names → libnut's.
const KEY = {
    ctrl: 'control', control: 'control', alt: 'alt', shift: 'shift', win: 'win', windows: 'win', cmd: 'win',
    enter: 'enter', return: 'enter', tab: 'tab', esc: 'escape', escape: 'escape', backspace: 'backspace',
    delete: 'delete', del: 'delete', insert: 'insert', space: 'space', up: 'up', down: 'down', left: 'left', right: 'right',
    home: 'home', end: 'end', pageup: 'pageup', pagedown: 'pagedown', capslock: 'caps_lock', printscreen: 'printscreen',
    menu: 'menu', plus: '=', minus: '-', comma: ',', period: '.', dot: '.', slash: '/',
};
const MODS = new Set(['control', 'alt', 'shift', 'win']);

function keyName(k) {
    k = String(k || '').trim().toLowerCase();
    if (KEY[k]) return KEY[k];
    if (/^[a-z0-9]$/.test(k)) return k;
    if (/^f([1-9]|1[0-9]|2[0-4])$/.test(k)) return k;
    throw new Error('Unknown key: ' + k);
}

async function start() { load(); }

async function send(cmd) {
    const n = load();
    const op = cmd && cmd.op;
    if (op === 'ping') return;
    if (op === 'move') { n.moveMouse(cmd.x, cmd.y); await sleep(40); return; }
    if (op === 'click') {
        n.moveMouse(cmd.x, cmd.y); await sleep(60);
        n.mouseClick(cmd.button === 'right' ? 'right' : 'left', !!cmd.double);
        return;
    }
    if (op === 'drag') {
        n.moveMouse(cmd.x, cmd.y); await sleep(60);
        n.mouseToggle('down', 'left'); await sleep(80);
        for (let s = 1; s <= 12; s++) {
            n.moveMouse(Math.round(cmd.x + (cmd.x2 - cmd.x) * s / 12), Math.round(cmd.y + (cmd.y2 - cmd.y) * s / 12));
            await sleep(18);
        }
        await sleep(60);
        n.mouseToggle('up', 'left');
        return;
    }
    if (op === 'scroll') {
        n.moveMouse(cmd.x, cmd.y); await sleep(40);
        const steps = Math.min(10, Math.abs(cmd.amount | 0));
        for (let s = 0; s < steps; s++) { n.scrollMouse(0, cmd.amount > 0 ? 3 : -3); await sleep(25); }
        return;
    }
    if (op === 'type') {
        // New lines and tabs as real key presses, everything else as text.
        const parts = String(cmd.text || '').replace(/\r/g, '').split(/(\n|\t)/);
        for (const p of parts) {
            if (p === '\n') n.keyTap('enter');
            else if (p === '\t') n.keyTap('tab');
            else if (p) n.typeString(p);
            await sleep(10);
        }
        return;
    }
    if (op === 'keys') {
        const keys = String(cmd.keys || '').split('+').filter(Boolean).map(keyName);
        if (!keys.length) throw new Error('No keys');
        const mods = keys.filter((k) => MODS.has(k));
        const main = keys.filter((k) => !MODS.has(k));
        if (!main.length) {
            // Only modifiers, e.g. "win" to open Start: tap the last one with the rest held.
            const last = mods.pop();
            n.keyTap(last, mods);
        } else {
            for (const k of main) n.keyTap(k, mods);
        }
        return;
    }
    throw new Error('unknown op');
}

function stop() { /* nothing to clean up */ }

module.exports = { start, send, stop };
