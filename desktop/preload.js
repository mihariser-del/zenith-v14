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
});
