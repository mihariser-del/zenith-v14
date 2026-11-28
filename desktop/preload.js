// Gives the Zelpophai site a small, safe bridge to the desktop app.
// Only the Zelpophai site is loaded in this window, and every call that runs
// code asks the user first (see main.js).
const { contextBridge, ipcRenderer } = require('electron');

const listeners = new Set();
ipcRenderer.on('zp-run-output', (e, chunk) => listeners.forEach(fn => { try { fn(chunk); } catch (err) {} }));
const updListeners = new Set();
ipcRenderer.on('zp-update', (e, info) => updListeners.forEach(fn => { try { fn(info); } catch (err) {} }));

contextBridge.exposeInMainWorld('zelpophaiDesktop', {
    platform: 'windows',
    info: () => ipcRenderer.invoke('zp-info'),
    checkForUpdates: () => ipcRenderer.invoke('zp-check-updates'),
    installUpdate: () => ipcRenderer.invoke('zp-install-update'),
    onUpdate: (fn) => { updListeners.add(fn); return () => updListeners.delete(fn); },
    // Coding AGT.: run a project on this computer
    languages: () => ipcRenderer.invoke('zp-languages'),
    run: (req) => ipcRenderer.invoke('zp-run', req),
    stop: () => ipcRenderer.invoke('zp-stop'),
    onOutput: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    // 1.6.0: Coding AGT. in a folder you choose (it can't reach anything else)
    fs: {
        pick: (opts) => ipcRenderer.invoke('zp-fs-pick', opts || {}),
        list: (id, sub, opts) => ipcRenderer.invoke('zp-fs-list', id, sub || '', opts || {}),
        read: (id, rel) => ipcRenderer.invoke('zp-fs-read', id, rel),
        write: (id, rel, content) => ipcRenderer.invoke('zp-fs-write', id, rel, content),
        remove: (id, rel) => ipcRenderer.invoke('zp-fs-delete', id, rel),
        open: (id, rel, how) => ipcRenderer.invoke('zp-fs-open', id, rel, how || ''),
        exec: (id, command, opts) => ipcRenderer.invoke('zp-fs-exec', id, command, opts || {}),
        stop: () => ipcRenderer.invoke('zp-fs-stop'),
        commandFor: (rel) => ipcRenderer.invoke('zp-fs-command-for', rel),
    },
});
