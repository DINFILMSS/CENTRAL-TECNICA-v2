// Ponte segura entre a interface e o sistema (arquivos, PDF, menus).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ctDesktop', {
  loadState: () => ipcRenderer.sendSync('state:load'),
  saveState: (json) => ipcRenderer.send('state:save', json),
  savePDF: (html, name) => ipcRenderer.invoke('pdf:save', html, name),
  openBackups: () => ipcRenderer.invoke('backup:folder'),
  info: () => ipcRenderer.sendSync('app:info'),
  checkUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openDownloads: () => ipcRenderer.invoke('update:downloads'),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, cmd) => cb(cmd))
});
