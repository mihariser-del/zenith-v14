// The Mini bubble can only say "I was clicked", "I'm being dragged" or "hide me".
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bubble', {
    click: () => ipcRenderer.send('bubble-click'),
    hide: () => ipcRenderer.send('bubble-hide'),
    drag: (dx, dy) => ipcRenderer.send('bubble-drag', { dx: Number(dx) || 0, dy: Number(dy) || 0 }),
    dragged: () => ipcRenderer.send('bubble-dragged'),
});
