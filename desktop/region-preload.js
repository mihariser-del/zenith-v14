// Bridge for the "select an area" overlay (local page, no site content).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('zpRegion', {
    onImage: (fn) => ipcRenderer.on('region-image', (e, src) => fn(src)),
    done: (rect) => ipcRenderer.send('region-done', rect),
});
