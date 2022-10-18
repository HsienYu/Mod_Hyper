// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

console.log('setting preload');
contextBridge.exposeInMainWorld('electronAPI', {
  saveImage: (data) => ipcRenderer.send('save-image', data),
});