// lib.mjs — desk-plugin 实现：create / dev / pack / validate（零依赖，node ≥ 18）
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir, copyFile, stat } from 'node:fs/promises';
import { extname, join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** 资产目录（sync-assets.mjs 从主仓 sdk/ 生成：template/ dev.html desk.js desk.d.ts） */
export const ASSETS = resolve(__dirname, 'assets');

export const HELP = `desk-plugin — Lodestar 插件开发 CLI

用法：
  desk-plugin create <目录>              从模板创建插件（manifest.id 自动取目录名）
  desk-plugin dev [目录] [--port N] [--no-open]
                                         起本地服务器并打开浏览器预览（免装 Lodestar）
  desk-plugin pack [目录]                校验 manifest 并打包 dist/<id>-<version>.zip
  desk-plugin validate [目录]            只校验，不打包

预览说明：dev 页面（dev.html）实现 desk 协议的浏览器版——storage 落 localStorage、
notify/savefile/fetch 可用，icons/files/wallpaper/canvas 为 mock。
`;

// ---------- 校验 ----------

const KNOWN_PERMS = ['notify', 'saveImage', 'net', 'clipboard', 'system', 'icons', 'files', 'wallpaper', 'canvas'];

export function validateDir(dir) {
  const root = resolve(dir);
  const errors = [], warnings = [];
  let manifest = null;
  const readJson = async () => JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  return (async () => {
    try { manifest = await readJson(); }
    catch (e) { errors.push(`manifest.json 无法读取/解析：${e.message}`); return { root, manifest, errors, warnings }; }

    if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id ?? ''))
      errors.push(`id "${manifest.id}" 不合法（小写字母/数字/连字符）`);
    if (!manifest.name) errors.push('name 缺失');
    if (!/^\d+\.\d+\.\d+/.test(manifest.version ?? ''))
      errors.push(`version "${manifest.version}" 不合法（x.y.z）`);
    for (const p of manifest.permissions ?? []) {
      if (!KNOWN_PERMS.includes(p)) warnings.push(`未知权限 "${p}"（已知：${KNOWN_PERMS.join(' ')}）`);
    }
    for (const f of ['index.html', 'desk.js']) {
      try { await stat(join(root, f)); }
      catch { (f === 'desk.js' ? warnings : errors).push(`${f} 缺失${f === 'desk.js' ? '（插件运行时需要它）' : ''}`); }
    }
    return { root, manifest, errors, warnings };
  })();
}

export function cmdValidate(dir) {
  validateDir(dir).then(({ root, manifest, errors, warnings }) => {
    console.log(`校验 ${root}${manifest ? `（${manifest.id ?? '?'} v${manifest.version ?? '?'}）` : ''}`);
    for (const w of warnings) console.log('  ⚠ ' + w);
    for (const e of errors) console.log('  ✗ ' + e);
    console.log(errors.length ? `  结果：${errors.length} 个错误` : '  结果：通过');
    process.exit(errors.length ? 1 : 0);
  });
}

// ---------- create ----------

export async function cmdCreate(dest, flags = new Set()) {
  const root = resolve(dest);
  const name = basename(root) || 'my-plugin';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name))
    throw new Error(`目录名 "${name}" 需匹配小写字母/数字/连字符（将作为插件 id）`);
  await mkdir(root, { recursive: true });
  const existing = await readdir(root);
  if (existing.length && !flags.has('--force'))
    throw new Error(`目录非空：${root}（--force 忽略）`);
  await copyTree(join(ASSETS, 'template'), root);
  // manifest 个性化：id/name 取目录名
  const mfPath = join(root, 'manifest.json');
  const mf = JSON.parse(await readFile(mfPath, 'utf8'));
  mf.id = name;
  mf.name = name;
  await writeFile(mfPath, JSON.stringify(mf, null, 2) + '\n', 'utf8');
  console.log(`已创建 ${root}`);
  console.log(`  开发：node sdk/npm/cli/desk.mjs dev ${root}（或装好 CLI 后 desk-plugin dev）`);
  console.log(`  安装：把目录复制到 %LOCALAPPDATA%\\Lodestar\\plugins\\${name}`);
}

async function copyTree(src, dest) {
  await mkdir(dest, { recursive: true });
  for (const ent of await readdir(src, { withFileTypes: true })) {
    if (ent.isDirectory()) await copyTree(join(src, ent.name), join(dest, ent.name));
    else await copyFile(join(src, ent.name), join(dest, ent.name));
  }
}

// ---------- dev（静态服务器 + 注入 dev.html） ----------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

export function cmdDev(dir, { port = 5175, open = true } = {}) {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent((req.url ?? '/').split('?')[0]);
      if (path === '/dev.html') {
        // 预览页由 CLI 资产提供（插件目录里不需要有它）
        res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
        res.end(await readFile(join(ASSETS, 'dev.html')));
        return;
      }
      if (path.endsWith('/')) path += 'index.html';
      // 路径卫生：拒绝越出插件目录的访问
      const file = resolve(root, '.' + path);
      if (!file.startsWith(root)) throw new Error('forbidden');
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404');
    }
  });
  server.on('error', e => { console.error(`端口 ${port} 起不来：${e.message}`); process.exit(1); });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/dev.html`;
    console.log(`插件预览：${url}（插件目录 ${root}）`);
    console.log('  Ctrl+C 停止。storage 落浏览器 localStorage；icons/files/wallpaper/canvas 为 mock。');
    if (open) openBrowser(url);
  });
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') spawnSync('cmd', ['/c', 'start', '', url], { shell: false, detached: true, stdio: 'ignore' });
    else if (process.platform === 'darwin') spawnSync('open', [url], { detached: true, stdio: 'ignore' });
    else spawnSync('xdg-open', [url], { detached: true, stdio: 'ignore' });
  } catch { /* 打不开就让用户手动点 URL */ }
}

// ---------- pack ----------

export async function cmdPack(dir) {
  const { root, manifest, errors, warnings } = await validateDir(dir);
  for (const w of warnings) console.log('  ⚠ ' + w);
  if (errors.length) {
    for (const e of errors) console.log('  ✗ ' + e);
    throw new Error(`校验未通过（${errors.length} 个错误），不打包`);
  }
  const tag = `${manifest.id}-${manifest.version}`;
  const dist = join(root, 'dist', tag);
  await mkdir(dist, { recursive: true });
  await copyTreeFiltered(root, dist);
  console.log(`已打包目录：${dist}`);
  const zip = join(root, 'dist', tag + '.zip');
  if (process.platform === 'win32') {
    const r = spawnSync('powershell', ['-NoProfile', '-Command',
      `Compress-Archive -Path "${join(dist, '*')}" -DestinationPath "${zip}" -Force`], { encoding: 'utf8' });
    if (r.status === 0) console.log(`已打包 zip：${zip}`);
    else console.log(`  （Compress-Archive 失败，status=${r.status}——目录版已可用，可手动压缩）`);
  } else {
    console.log('  （非 Windows：请手动压缩目录为 zip）');
  }
  console.log(`分发：用户解压到 %LOCALAPPDATA%\\Lodestar\\plugins\\ 即安装`);
}

async function copyTreeFiltered(src, dest) {
  const SKIP = new Set(['dist', 'node_modules', '.git', 'dev.html']);
  for (const ent of await readdir(src, { withFileTypes: true })) {
    if (SKIP.has(ent.name)) continue;
    if (ent.isDirectory()) await copyTreeFiltered(join(src, ent.name), join(dest, ent.name));
    else await copyFile(join(src, ent.name), join(dest, ent.name));
  }
}
