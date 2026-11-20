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
  onMenu: (cb) => ipcRenderer.on('menu', (_e, cmd) => cb(cmd)),
  sync: {
    info: () => ipcRenderer.sendSync('sync:info'),
    choose: () => ipcRenderer.invoke('sync:choose'),
    disconnect: () => ipcRenderer.invoke('sync:disconnect'),
    open: () => ipcRenderer.invoke('sync:open'),
    setUser: (n) => ipcRenderer.invoke('sync:user', n),
    current: (id, name) => ipcRenderer.send('sync:current', id, name),
    readConflict: (f) => ipcRenderer.invoke('sync:readConflict', f),
    now: () => ipcRenderer.invoke('sync:now'),
    on: (cb) => ipcRenderer.on('sync', (_e, type, data) => cb(type, data))
  }
});
