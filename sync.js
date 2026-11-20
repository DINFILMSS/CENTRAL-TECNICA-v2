// Central Técnica — sincronização por pasta compartilhada (Google Drive, OneDrive, Dropbox, rede).
// Cada projeto vira um arquivo em <pasta>/projetos/<id>.json; a biblioteca (racks, kits, modelos,
// cases, estoque, papel timbrado) fica em <pasta>/biblioteca.json. Cada computador grava só o que
// mudou, com um número de revisão. Se dois computadores salvarem o mesmo projeto ao mesmo tempo,
// o segundo não sobrescreve: a versão dele vai para <pasta>/conflitos/ e ele recebe a versão da pasta.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIB_KEYS = ['templates', 'kits', 'racks', 'caseLib', 'inv', 'brand'];
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const hash = s => crypto.createHash('sha1').update(s).digest('hex');
const safe = id => String(id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);

function readJSON(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } }
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), '.~' + path.basename(file) + '.' + process.pid + '.tmp');
  fs.writeFileSync(tmp, text, 'utf8');
  try { fs.renameSync(tmp, file); }
  catch (e) { fs.copyFileSync(tmp, file); try { fs.unlinkSync(tmp); } catch (_) {} }
}
function mtime(file) { try { return fs.statSync(file).mtimeMs; } catch (e) { return 0; } }

class FolderSync {
  constructor({ dir, machine, user, onEvent }) {
    this.dir = dir; this.machine = machine; this.user = user || machine;
    this.onEvent = onEvent || (() => {});
    this.known = {};          // id -> { rev, hash, mt }
    this.lib = { rev: 0, hash: null, mt: 0 };
    this.synced = new Set();  // ids que já estiveram na pasta (para reconhecer exclusões)
    this.appIds = null;       // ids que o app tinha no último salvamento (só esses podem ser apagados)
    this.current = null; this.currentName = '';
    this.ok = false; this.lastError = '';
  }
  get pdir() { return path.join(this.dir, 'projetos'); }
  pfile(id) { return path.join(this.pdir, safe(id) + '.json'); }
  get libfile() { return path.join(this.dir, 'biblioteca.json'); }

  accessible() {
    try { fs.mkdirSync(this.pdir, { recursive: true }); fs.accessSync(this.dir, fs.constants.W_OK); this.ok = true; this.lastError = ''; return true; }
    catch (e) { this.ok = false; this.lastError = e.code || String(e.message || e); return false; }
  }
  listIds() {
    try { return fs.readdirSync(this.pdir).filter(f => f.endsWith('.json') && !f.startsWith('.')).map(f => f.slice(0, -5)).filter(id => ID_RE.test(id)); }
    catch (e) { return []; }
  }
  readProject(id) { const d = readJSON(this.pfile(id)); return d && d.project && d.meta ? d : null; }

  // Monta o estado a partir da pasta + o estado local (o que é só deste computador).
  load(local, syncedIds) {
    this.synced = new Set(syncedIds || []);
    if (!this.accessible()) return { state: local, from: 'local' };
    const S = { ...(local || {}) };
    const disk = {};
    this.listIds().forEach(id => { const d = this.readProject(id); if (d) disk[d.project.id || id] = d; });
    const localProjects = (local && local.projects) || [];
    const out = [];
    const seen = new Set();
    Object.values(disk).forEach(d => { out.push(d.project); seen.add(d.project.id); this.remember(d.project.id, d.meta.rev, d.project); this.synced.add(d.project.id); });
    localProjects.forEach(p => {
      if (seen.has(p.id)) return;
      if (this.synced.has(p.id)) return;          // estava na pasta e foi apagado em outro computador
      out.push(p);                                 // projeto novo, ainda só neste computador
    });
    S.projects = out.length ? out : localProjects;
    this.appIds = new Set(S.projects.map(p => p.id));
    const lib = readJSON(this.libfile);
    if (lib && lib.lib) { LIB_KEYS.forEach(k => { if (k in lib.lib) S[k] = lib.lib[k]; }); this.lib = { rev: lib.meta.rev || 0, hash: hash(JSON.stringify(this.libOf(S))), mt: mtime(this.libfile) }; }
    if (S.current && !S.projects.some(p => p.id === S.current)) S.current = S.projects[0] && S.projects[0].id;
    return { state: S, from: 'pasta' };
  }
  remember(id, rev, project) { this.known[id] = { rev: rev || 0, hash: hash(JSON.stringify(project)), mt: mtime(this.pfile(id)) }; }
  libOf(S) { const o = {}; LIB_KEYS.forEach(k => { if (S[k] !== undefined) o[k] = S[k]; }); return o; }
  meta(rev) { return { rev, by: this.machine, user: this.user, at: new Date().toISOString(), format: 1 }; }

  // Grava o que mudou. Devolve a lista de eventos (conflitos).
  save(S) {
    if (!this.accessible()) { this.onEvent('status', this.status()); return; }
    const ids = new Set();
    (S.projects || []).forEach(p => {
      if (!p || !p.id) return; ids.add(p.id);
      const text = JSON.stringify(p), h = hash(text), k = this.known[p.id];
      if (k && k.hash === h) return;
      const disk = this.readProject(p.id);
      const diskRev = disk ? disk.meta.rev || 0 : 0;
      const baseRev = k ? k.rev : 0;
      if (disk && diskRev > baseRev && disk.meta.by !== this.machine) {
        // outro computador salvou depois da última vez que lemos: não sobrescrever
        const cf = path.join(this.dir, 'conflitos', `${safe(p.id)}-${safe(this.machine)}-${Date.now()}.json`);
        writeAtomic(cf, JSON.stringify({ meta: this.meta(baseRev), project: p }));
        this.remember(p.id, diskRev, disk.project);
        this.onEvent('conflict', { id: p.id, name: p.name, by: disk.meta.user || disk.meta.by, file: cf, project: disk.project, meta: disk.meta });
        return;
      }
      const rev = Math.max(baseRev, diskRev) + 1;
      writeAtomic(this.pfile(p.id), JSON.stringify({ meta: this.meta(rev), project: p }));
      this.known[p.id] = { rev, hash: h, mt: mtime(this.pfile(p.id)) }; this.synced.add(p.id);
    });
    // projetos apagados aqui (só os que o app já conhecia: um projeto que acabou de chegar de outro computador não é apagado)
    const prev = this.appIds;
    this.appIds = ids;
    Object.keys(this.known).forEach(id => {
      if (ids.has(id)) return;
      if (!prev || !prev.has(id)) return;
      const f = this.pfile(id);
      if (fs.existsSync(f)) {
        const disk = this.readProject(id);
        if (disk && (disk.meta.rev || 0) > this.known[id].rev) return; // mudou em outro lugar: não apaga
        const dest = path.join(this.dir, 'lixeira', `${safe(id)}-${Date.now()}.json`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        try { fs.renameSync(f, dest); } catch (e) { try { fs.copyFileSync(f, dest); fs.unlinkSync(f); } catch (_) {} }
      }
      delete this.known[id];
    });
    // biblioteca
    const lib = this.libOf(S), lt = JSON.stringify(lib), lh = hash(lt);
    if (lh !== this.lib.hash) {
      const disk = readJSON(this.libfile);
      const dr = disk && disk.meta ? disk.meta.rev || 0 : 0;
      if (disk && dr > this.lib.rev && disk.meta.by !== this.machine) {
        // biblioteca: junta por chave, a da pasta prevalece no que mudou lá
        this.lib = { rev: dr, hash: hash(JSON.stringify(disk.lib)), mt: mtime(this.libfile) };
        this.onEvent('lib', { lib: disk.lib, meta: disk.meta });
      } else {
        const rev = Math.max(this.lib.rev, dr) + 1;
        writeAtomic(this.libfile, JSON.stringify({ meta: this.meta(rev), lib }));
        this.lib = { rev, hash: lh, mt: mtime(this.libfile) };
      }
    }
    this.lastSave = Date.now();
  }

  // Procura mudanças feitas por outros computadores.
  poll() {
    if (!this.accessible()) { this.onEvent('status', this.status()); return; }
    const ids = this.listIds();
    ids.forEach(id => {
      const f = this.pfile(id), mt = mtime(f), k = this.known[id];
      if (k && k.mt === mt) return;
      const d = this.readProject(id); if (!d) return;
      const pid = d.project.id || id;
      const kk = this.known[pid];
      if (kk && (d.meta.rev || 0) <= kk.rev) { kk.mt = mt; return; }
      this.remember(pid, d.meta.rev, d.project); this.synced.add(pid);
      this.onEvent('project', { project: d.project, meta: d.meta, isNew: !kk });
    });
    Object.keys(this.known).forEach(id => {
      if (ids.includes(safe(id))) return;
      if (fs.existsSync(this.pfile(id))) return;
      delete this.known[id];
      this.onEvent('removed', { id });
    });
    const lm = mtime(this.libfile);
    if (lm && lm !== this.lib.mt) {
      const d = readJSON(this.libfile);
      if (d && d.meta && (d.meta.rev || 0) > this.lib.rev) { this.lib = { rev: d.meta.rev, hash: hash(JSON.stringify(d.lib)), mt: lm }; this.onEvent('lib', { lib: d.lib, meta: d.meta }); }
      else this.lib.mt = lm;
    }
    this.onEvent('status', this.status());
  }

  // Quem mais está com o app aberto (atualizado a cada poucos segundos).
  heartbeat() {
    if (!this.ok) return [];
    const pd = path.join(this.dir, 'presenca');
    try { writeAtomic(path.join(pd, safe(this.machine) + '.json'), JSON.stringify({ machine: this.machine, user: this.user, project: this.current, projectName: this.currentName, at: Date.now() })); } catch (e) {}
    let list = [];
    try { list = fs.readdirSync(pd).filter(f => f.endsWith('.json') && !f.startsWith('.')).map(f => readJSON(path.join(pd, f))).filter(x => x && x.machine !== this.machine && Date.now() - x.at < 90000); } catch (e) {}
    this.onEvent('presence', list);
    return list;
  }
  leave() { try { fs.unlinkSync(path.join(this.dir, 'presenca', safe(this.machine) + '.json')); } catch (e) {} }
  status() { return { dir: this.dir, ok: this.ok, error: this.lastError, machine: this.machine, user: this.user, projects: Object.keys(this.known).length, at: Date.now() }; }
  syncedIds() { return [...this.synced]; }
}

module.exports = { FolderSync, LIB_KEYS };
