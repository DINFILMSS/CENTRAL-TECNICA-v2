// Central Técnica by Don — aplicativo desktop (Electron)
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
let updater = null;
try { updater = require('electron-updater').autoUpdater; } catch (e) { updater = null; }
const { FolderSync } = require('./sync');

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

/* ---------- pasta compartilhada (rede / Google Drive) ---------- */
const NET_FILE = () => path.join(app.getPath('userData'), 'rede.json');
let net = readJSON(NET_FILE(), {});           // { dir, user, synced: [] }
let sync = null, syncTimers = [], lastState = null, wasOk = true;
const MACHINE = os.hostname().replace(/\.local$/, '') || 'Computador';
function netSave() { try { writeAtomic(NET_FILE(), JSON.stringify(net)); } catch (e) {} }
function toApp(type, data) { if (win && !win.isDestroyed()) win.webContents.send('sync', type, data); }
function startSync() {
  stopSync();
  if (!net.dir) return;
  sync = new FolderSync({ dir: net.dir, machine: MACHINE, user: net.user || os.userInfo().username, onEvent: (t, d) => {
    if (t === 'status') { if (d.ok && !wasOk && lastState) { try { sync.save(lastState); } catch (e) {} } wasOk = d.ok; }
    toApp(t, d);
  } });
  syncTimers = [setInterval(() => { try { sync.poll(); net.synced = sync.syncedIds(); } catch (e) {} }, 4000), setInterval(() => { try { sync.heartbeat(); } catch (e) {} }, 15000)];
  setTimeout(() => { try { sync.heartbeat(); } catch (e) {} }, 2500);
}
function stopSync() { syncTimers.forEach(clearInterval); syncTimers = []; if (sync) { try { sync.leave(); } catch (e) {} } sync = null; }
function syncInfo() { return { enabled: !!net.dir, dir: net.dir || '', user: net.user || os.userInfo().username, machine: MACHINE, ok: sync ? sync.ok : false, error: sync ? sync.lastError : '' }; }
/* ---------- leitura de PDF (importar pedido) ---------- */
ipcMain.handle('pdf:text', async (e, bytes) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, disableFontFace: true, isEvalSupported: false }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i); const tc = await pg.getTextContent(); let lastY = null;
    for (const it of tc.items) { if (lastY !== null && Math.abs(it.transform[5] - lastY) > 2) out += '\n'; out += it.str; lastY = it.transform[5]; if (it.hasEOL) out += '\n'; }
    out += '\n';
  }
  try { await doc.destroy(); } catch (_) {}
  return out;
});
ipcMain.on('sync:info', (e) => { e.returnValue = syncInfo(); });
ipcMain.handle('sync:choose', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Escolha a pasta compartilhada', properties: ['openDirectory', 'createDirectory'], defaultPath: net.dir || (process.platform === 'win32' ? 'G:\\' : app.getPath('home')) });
  if (r.canceled || !r.filePaths[0]) return syncInfo();
  const dir = r.filePaths[0];
  const probe = new FolderSync({ dir, machine: MACHINE });
  if (!probe.accessible()) { await dialog.showMessageBox(win, { type: 'warning', title: 'Pasta compartilhada', message: 'Não consegui gravar nessa pasta.', detail: 'Confira se o Google Drive (ou a rede) está conectado e se você tem permissão de escrita. Detalhe: ' + probe.lastError }); return syncInfo(); }
  const there = probe.listIds().length;
  const local = readJSON(DATA_FILE(), { projects: [] }) || { projects: [] };
  const mine = (local.projects || []).length;
  const c = await dialog.showMessageBox(win, { type: 'question', buttons: ['Conectar', 'Cancelar'], defaultId: 0, cancelId: 1, title: 'Pasta compartilhada',
    message: there ? `A pasta já tem ${there} projeto(s).` : 'A pasta está vazia.',
    detail: `${there ? 'Os projetos dela aparecem neste computador e ' : ''}os ${mine} projeto(s) deste computador ${there ? 'são juntados a eles' : 'vão para a pasta'}. Nada é apagado. Racks, kits, modelos, cases, estoque e papel timbrado também passam a ser compartilhados.\n\nPasta: ${dir}` });
  if (c.response !== 0) return syncInfo();
  net.dir = dir; net.synced = []; netSave(); startSync();
  const merged = sync.load(local, []).state;
  sync.save(merged); net.synced = sync.syncedIds(); netSave();
  lastState = merged; try { writeAtomic(DATA_FILE(), JSON.stringify(merged)); } catch (e) {}
  toApp('reload', merged);
  return syncInfo();
});
ipcMain.handle('sync:disconnect', async () => { net.dir = ''; netSave(); stopSync(); return syncInfo(); });
ipcMain.handle('sync:open', async () => net.dir ? shell.openPath(net.dir) : '');
ipcMain.handle('sync:user', async (e, name) => { net.user = String(name || '').trim().slice(0, 40); netSave(); if (sync) sync.user = net.user || os.userInfo().username; return syncInfo(); });
ipcMain.on('sync:current', (e, id, name) => { if (sync) { sync.current = id; sync.currentName = name; } });
ipcMain.handle('sync:readConflict', async (e, file) => { const d = readJSON(file, null); return d && d.project ? d.project : null; });
ipcMain.handle('sync:now', async () => { if (sync) { if (lastState) sync.save(lastState); sync.poll(); sync.heartbeat(); } return syncInfo(); });

/* ---------- dados e backups ---------- */
ipcMain.on('state:load', (e) => {
  let text = null; try { text = fs.readFileSync(DATA_FILE(), 'utf8'); } catch (err) {}
  if (net.dir) {
    try { if (!sync) startSync(); const local = text ? JSON.parse(text) : null; const r = sync.load(local, net.synced || []); lastState = r.state; e.returnValue = JSON.stringify(r.state); return; } catch (err) { console.error('Falha ao ler a pasta compartilhada', err); }
  }
  e.returnValue = text;
});
ipcMain.on('state:save', (e, json) => {
  try {
    if (sync) { try { const S = JSON.parse(json); lastState = S; sync.save(S); net.synced = sync.syncedIds(); } catch (err) { console.error('Falha ao sincronizar', err); } }
    writeAtomic(DATA_FILE(), json);
    const day = new Date().toISOString().slice(0, 10);
    writeAtomic(path.join(BACKUP_DIR(), `central-tecnica-${day}.json`), json);
    const files = fs.readdirSync(BACKUP_DIR()).filter(f => /^central-tecnica-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    files.slice(0, Math.max(0, files.length - KEEP_BACKUPS)).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR(), f)));
  } catch (err) { console.error('Falha ao salvar', err); }
});
ipcMain.on('app:info', (e) => { e.returnValue = { version: app.getVersion(), backupDir: BACKUP_DIR(), platform: process.platform }; });
ipcMain.handle('update:check', async () => { checkUpdatesNow(); return true; });
ipcMain.handle('update:install', async () => { if (updater && updateReady) { if (win) win.webContents.send('menu', 'flush'); setTimeout(() => updater.quitAndInstall(false, true), 400); return true; } checkUpdatesNow(); return false; });
ipcMain.handle('update:downloads', async () => { const u = releasesURL(); if (u) shell.openExternal(u); return !!u; });
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
  updater.on('update-downloaded', info => { if (win) { win.setProgressBar(-1); win.webContents.send('menu', 'update-ready:' + info.version); } updateReady = info.version; askRestart(info.version); });
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
    { label: 'Editar', submenu: [{ label: 'Desfazer', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') }, { label: 'Refazer', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('redo') }, ...(process.platform === 'darwin' ? [] : [{ label: 'Refazer', accelerator: 'Ctrl+Y', click: () => send('redo'), visible: false }]), { type: 'separator' }, { role: 'cut', label: 'Recortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' }, { role: 'selectAll', label: 'Selecionar tudo' }] },
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
    { label: 'Ajuda', submenu: [{ label: `Versão ${app.getVersion()}`, enabled: false }, { label: 'Tour rápido pelas telas', click: () => send('tour') }, { label: 'Versão e atualizações…', click: () => send('about') }, { label: 'Procurar atualizações…', click: () => checkUpdatesNow() }, { label: 'Página de downloads', click: () => { const u = releasesURL(); if (u) shell.openExternal(u); } }, { type: 'separator' }, { label: 'Mostrar ferramentas de diagnóstico', accelerator: 'CmdOrCtrl+Alt+I', click: () => win && win.webContents.toggleDevTools() }] }
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
app.on('before-quit', () => { stopSync(); netSave(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
