// Central Técnica by Don — aplicativo desktop (Electron)
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
let updater = null;
try { updater = require('electron-updater').autoUpdater; } catch (e) { updater = null; }

if (!app.requestSingleInstanceLock()) { app.quit(); }

const APP_DIR = path.join(__dirname, 'app');
const DATA_FILE = () => path.join(app.getPath('userData'), 'estado.json');
const WIN_FILE = () => path.join(app.getPath('userData'), 'janela.json');
const BACKUP_DIR = () => path.join(app.getPath('documents'), 'Central Técnica', 'Backups');
const KEEP_BACKUPS = 30;
let win = null;

function readJSON(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; } }
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function createWindow() {
  const b = readJSON(WIN_FILE(), { width: 1440, height: 900 });
  win = new BrowserWindow({
    width: b.width || 1440, height: b.height || 900, x: b.x, y: b.y,
    minWidth: 1024, minHeight: 680,
    backgroundColor: '#030504', title: 'Central Técnica', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  win.loadFile(path.join(APP_DIR, 'index.html'));
  win.once('ready-to-show', () => { win.show(); if (b.max) win.maximize(); });
  win.on('close', () => {
    try { writeAtomic(WIN_FILE(), JSON.stringify({ ...win.getNormalBounds(), max: win.isMaximized() })); } catch (e) {}
  });
  // Monitor da direção abre como janela nativa; links externos vão para o navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === 'about:blank') {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 1280, height: 720, backgroundColor: '#000000', autoHideMenuBar: true, title: 'Monitor da direção' } };
    }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
}

/* ---------- dados e backups ---------- */
ipcMain.on('state:load', (e) => { try { e.returnValue = fs.readFileSync(DATA_FILE(), 'utf8'); } catch (err) { e.returnValue = null; } });
ipcMain.on('state:save', (e, json) => {
  try {
    writeAtomic(DATA_FILE(), json);
    const day = new Date().toISOString().slice(0, 10);
    writeAtomic(path.join(BACKUP_DIR(), `central-tecnica-${day}.json`), json);
    const files = fs.readdirSync(BACKUP_DIR()).filter(f => /^central-tecnica-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    files.slice(0, Math.max(0, files.length - KEEP_BACKUPS)).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR(), f)));
  } catch (err) { console.error('Falha ao salvar', err); }
});
ipcMain.on('app:info', (e) => { e.returnValue = { version: app.getVersion(), backupDir: BACKUP_DIR(), platform: process.platform }; });
ipcMain.handle('backup:folder', async () => { fs.mkdirSync(BACKUP_DIR(), { recursive: true }); return shell.openPath(BACKUP_DIR()); });

/* ---------- PDF direto, sem janela de impressão ---------- */
ipcMain.handle('pdf:save', async (e, html, name) => {
  const r = await dialog.showSaveDialog(win, { title: 'Salvar PDF', defaultPath: path.join(app.getPath('documents'), name || 'central-tecnica.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null;
  const base = pathToFileURL(APP_DIR + path.sep).href;
  const tmp = path.join(os.tmpdir(), `ct-pdf-${Date.now()}.html`);
  fs.writeFileSync(tmp, String(html).replace('<head>', `<head><base href="${base}">`), 'utf8');
  const pw = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
  try {
    await pw.loadFile(tmp);
    await new Promise(res => setTimeout(res, 400));
    const pdf = await pw.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
    fs.writeFileSync(r.filePath, pdf);
    shell.openPath(r.filePath);
    return r.filePath;
  } finally { pw.destroy(); try { fs.unlinkSync(tmp); } catch (err) {} }
});


/* ---------- atualização automática ---------- */
// Windows: baixa sozinho e pergunta se pode reiniciar. Mac: avisa e abre a página de download
// (a instalação silenciosa no Mac exige certificado pago da Apple).
const IS_MAC = process.platform === 'darwin';
let manualCheck = false, updateReady = null;
function releasesURL() {
  try {
    const y = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8');
    const o = (y.match(/owner:\s*['"]?([^\s'"]+)/) || [])[1], r = (y.match(/repo:\s*['"]?([^\s'"]+)/) || [])[1];
    if (o && r) return `https://github.com/${o}/${r}/releases/latest`;
  } catch (e) {}
  return null;
}
function box(o) { return win ? dialog.showMessageBox(win, o) : dialog.showMessageBox(o); }
function askRestart(v) {
  box({ type: 'info', buttons: ['Reiniciar e atualizar', 'Depois'], defaultId: 0, cancelId: 1, title: 'Atualização pronta',
    message: `A versão ${v} da Central Técnica já foi baixada.`,
    detail: 'Reinicie para usar a versão nova. Se escolher “Depois”, ela é instalada quando você fechar o app. Seus projetos continuam salvos.' })
    .then(r => { if (r.response === 0) { if (win) win.webContents.send('menu', 'flush'); setTimeout(() => updater.quitAndInstall(false, true), 400); } });
}
function setupUpdater() {
  if (!updater || !app.isPackaged) return;
  updater.autoDownload = !IS_MAC;
  updater.autoInstallOnAppQuit = !IS_MAC;
  updater.on('update-available', info => {
    if (IS_MAC) {
      box({ type: 'info', buttons: ['Abrir página de download', 'Depois'], defaultId: 0, cancelId: 1, title: 'Atualização disponível',
        message: `A versão ${info.version} da Central Técnica está disponível.`,
        detail: `Você está na ${app.getVersion()}. Baixe o arquivo .dmg, abra e arraste a Central Técnica para Aplicativos, substituindo a anterior. Seus projetos continuam salvos.` })
        .then(r => { if (r.response === 0) { const u = releasesURL(); if (u) shell.openExternal(u); } });
    } else if (manualCheck) {
      box({ type: 'info', buttons: ['OK'], title: 'Atualização disponível', message: `Baixando a versão ${info.version}…`, detail: 'Avisamos quando estiver pronta para instalar.' });
    }
    manualCheck = false;
  });
  updater.on('download-progress', p => { if (win) win.setProgressBar(Math.max(0.02, (p.percent || 0) / 100)); });
  updater.on('update-downloaded', info => { if (win) win.setProgressBar(-1); updateReady = info.version; askRestart(info.version); });
  updater.on('update-not-available', () => {
    if (manualCheck) box({ type: 'info', buttons: ['OK'], title: 'Central Técnica', message: 'Você já está na versão mais recente.', detail: `Versão ${app.getVersion()}` });
    manualCheck = false;
  });
  updater.on('error', err => {
    if (win) win.setProgressBar(-1);
    if (manualCheck) box({ type: 'warning', buttons: ['OK'], title: 'Não foi possível procurar atualizações', message: 'Confira a conexão com a internet e tente de novo.', detail: String(err && err.message || err).slice(0, 300) });
    manualCheck = false;
  });
  const check = () => updater.checkForUpdates().catch(() => {});
  setTimeout(check, 8000);
  setInterval(check, 4 * 60 * 60 * 1000);
}
function checkUpdatesNow() {
  if (!updater || !app.isPackaged) { box({ type: 'info', buttons: ['OK'], title: 'Central Técnica', message: 'A atualização automática só funciona no app instalado.' }); return; }
  if (updateReady) { askRestart(updateReady); return; }
  manualCheck = true;
  updater.checkForUpdates().catch(() => {});
}

/* ---------- menus ---------- */
function send(cmd) { if (win) win.webContents.send('menu', cmd); }
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const tpl = [
    ...(isMac ? [{ label: 'Central Técnica', submenu: [{ role: 'about', label: 'Sobre a Central Técnica' }, { label: 'Procurar atualizações…', click: () => checkUpdatesNow() }, { type: 'separator' }, { role: 'hide', label: 'Ocultar' }, { role: 'hideOthers', label: 'Ocultar outros' }, { type: 'separator' }, { role: 'quit', label: 'Sair' }] }] : []),
    { label: 'Arquivo', submenu: [
      { label: 'Novo projeto', accelerator: 'CmdOrCtrl+N', click: () => send('newproj') },
      { label: 'Abrir backup…', accelerator: 'CmdOrCtrl+O', click: () => send('backup-open') },
      { label: 'Salvar backup…', accelerator: 'CmdOrCtrl+S', click: () => send('backup-save') },
      { label: 'Abrir pasta de backups automáticos', click: () => { fs.mkdirSync(BACKUP_DIR(), { recursive: true }); shell.openPath(BACKUP_DIR()); } },
      { type: 'separator' },
      { label: 'Caderno técnico (PDF)', accelerator: 'CmdOrCtrl+P', click: () => send('go:report') },
      { label: 'Folhas de câmera', click: () => send('go:camsheets') },
      ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: 'Sair' }])
    ] },
    { label: 'Editar', submenu: [{ role: 'undo', label: 'Desfazer' }, { role: 'redo', label: 'Refazer' }, { type: 'separator' }, { role: 'cut', label: 'Recortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' }, { role: 'selectAll', label: 'Selecionar tudo' }] },
    { label: 'Exibir', submenu: [
      { label: 'Busca rápida', accelerator: 'CmdOrCtrl+K', click: () => send('palette') },
      { label: 'Painel do evento', accelerator: 'CmdOrCtrl+1', click: () => send('go:dash') },
      { label: 'Patch de sinais', accelerator: 'CmdOrCtrl+2', click: () => send('go:patch') },
      { label: 'Espelho do programa', accelerator: 'CmdOrCtrl+3', click: () => send('go:rundown') },
      { label: 'Monitor da direção', accelerator: 'CmdOrCtrl+4', click: () => send('go:dir') },
      { label: 'Ligar/desligar ON AIR', accelerator: 'F9', click: () => send('onair') },
      { type: 'separator' },
      { role: 'resetZoom', label: 'Tamanho real' }, { role: 'zoomIn', label: 'Aumentar' }, { role: 'zoomOut', label: 'Diminuir' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Tela cheia' }
    ] },
    { label: 'Janela', submenu: [{ role: 'minimize', label: 'Minimizar' }, { role: 'close', label: 'Fechar' }] },
    { label: 'Ajuda', submenu: [{ label: `Versão ${app.getVersion()}`, enabled: false }, { label: 'Procurar atualizações…', click: () => checkUpdatesNow() }, { label: 'Página de downloads', click: () => { const u = releasesURL(); if (u) shell.openExternal(u); } }, { type: 'separator' }, { label: 'Mostrar ferramentas de diagnóstico', accelerator: 'CmdOrCtrl+Alt+I', click: () => win && win.webContents.toggleDevTools() }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  app.setAboutPanelOptions({ applicationName: 'Central Técnica', applicationVersion: app.getVersion(), copyright: 'Central Técnica by Don' });
  session.defaultSession.on('will-download', (e, item) => {
    item.setSaveDialogOptions({ title: 'Salvar arquivo', defaultPath: path.join(app.getPath('documents'), item.getFilename()) });
  });
  buildMenu();
  createWindow();
  setupUpdater();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
