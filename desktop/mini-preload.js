// Bridge for the Zelpophai Mini panel (Ctrl+Shift+Z). Only the Zelpophai
// site is loaded in that window; main.js double-checks every call comes from it,
// and controlling the PC needs the user's OK first.
const { contextBridge, ipcRenderer } = require('electron');

const shownFns = new Set();
const stopFns = new Set();
ipcRenderer.on('mini-shown', (e, info) => shownFns.forEach(fn => { try { fn(info); } catch (err) {} }));
ipcRenderer.on('mini-stop', () => stopFns.forEach(fn => { try { fn(); } catch (err) {} }));

contextBridge.exposeInMainWorld('zelpophaiMini', {
    platform: process.platform === 'win32' ? 'windows' : process.platform,
    info: () => ipcRenderer.invoke('zp-info'),
    // the screenshot taken the moment the shortcut was pressed
    lastCapture: () => ipcRenderer.invoke('mini-last-capture'),
    // a fresh screenshot (the panel hides itself while it's taken)
    capture: (opts) => ipcRenderer.invoke('mini-capture', opts || {}),
    selectArea: () => ipcRenderer.invoke('mini-select-area'),
    clipboard: () => ipcRenderer.invoke('mini-clipboard'),
    copy: (text) => ipcRenderer.invoke('mini-copy', String(text || '')),
    pasteToApp: (text) => ipcRenderer.invoke('mini-paste', String(text || '')),
    // Do mode
    controlStart: (task) => ipcRenderer.invoke('mini-control-start', String(task || '')),
    act: (action) => ipcRenderer.invoke('mini-act', action),
    controlEnd: () => ipcRenderer.invoke('mini-control-end'),
    showPanel: () => ipcRenderer.invoke('mini-show'),
    hide: () => ipcRenderer.invoke('mini-hide'),
    openInApp: (path) => ipcRenderer.invoke('mini-open-app', String(path || '/app')),
    setPinned: (on) => ipcRenderer.invoke('mini-pin', !!on),
    onShown: (fn) => { shownFns.add(fn); return () => shownFns.delete(fn); },
    onStop: (fn) => { stopFns.add(fn); return () => stopFns.delete(fn); },
});
