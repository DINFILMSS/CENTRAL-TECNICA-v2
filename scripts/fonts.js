// Copia as fontes (licença OFL) para dentro do app, para funcionar 100% offline.
// Gera app/fonts/fonts.css com as famílias "Archivo" e "JetBrains Mono".
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'app', 'fonts');
fs.mkdirSync(OUT, { recursive: true });
let css = '/* gerado por scripts/fonts.js */\n';

function pkgDir(name) {
  try { return path.dirname(require.resolve(name + '/package.json')); } catch (e) { return null; }
}
function copyFiles(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) if (/\.(woff2?|ttf)$/.test(f)) fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
function take(pkg, folder, cssFiles, family) {
  const dir = pkgDir(pkg);
  if (!dir) { console.warn('Fonte não encontrada:', pkg); return; }
  copyFiles(path.join(dir, 'files'), path.join(OUT, folder));
  for (const file of cssFiles) {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) continue;
    let text = fs.readFileSync(p, 'utf8');
    text = text.replace(/url\(\.\/files\//g, `url(./${folder}/`).replace(/font-family:\s*'[^']+'/g, `font-family: '${family}'`);
    css += text + '\n';
    console.log('OK', pkg, file);
    break;
  }
}
take('@fontsource-variable/archivo', 'archivo', ['wdth.css', 'full.css', 'index.css'], 'Archivo');
const jb = pkgDir('@fontsource/jetbrains-mono');
if (jb) {
  copyFiles(path.join(jb, 'files'), path.join(OUT, 'jetbrains'));
  for (const w of ['400', '600', '800']) {
    const p = path.join(jb, w + '.css');
    if (fs.existsSync(p)) css += fs.readFileSync(p, 'utf8').replace(/url\(\.\/files\//g, 'url(./jetbrains/') + '\n';
  }
  console.log('OK @fontsource/jetbrains-mono');
}
fs.writeFileSync(path.join(OUT, 'fonts.css'), css);
