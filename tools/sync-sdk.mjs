// sync-sdk.mjs — 把主仓 lodestar/sdk 的 SDK 资产同步到本仓与 market 仓（消除三仓拷贝漂移）。
// 背景：M2 拆仓后主仓 sdk/ 仍是构建链源头（PLAN §8.2「私有仓包引用消费」待 npm 发包后切换），
//       本脚本是切换前的防漂移闸：主仓改 desk.js / dev.html / template 后，跑一次三仓追平。
// 用法：
//   node tools/sync-sdk.mjs --market <market仓路径>   # 两个仓都追平（market 可省略=只同步本仓）
// 同步后注意：market 仓需重跑 tools/market-pack.py 刷新 zip 与 index.json（sha256 会变）。
import { copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // tools/
const repo = resolve(here, '..');                     // 本仓根
const main = resolve(repo, '..', 'lodestar');         // 主仓（默认兄弟目录）
const src = f => resolve(main, 'sdk', f);

const mi = process.argv.indexOf('--market');
const market = mi > -1 ? resolve(process.argv[mi + 1] ?? '.') : null;

// （源文件相对主仓 sdk/，[目标…相对仓根]）。目标以 src/ 开头的仅在已存在时覆盖
// （market 插件源目录有的带 desk.js 拷贝、有的不带——pack 时反正从 sdk/desk.js 统一注入）。
const plan = repoTargets => {
  let n = 0;
  for (const [file, dests] of repoTargets)
    for (const d of dests) {
      const abs = d.root ? resolve(d.root, d.path) : resolve(repo, d);
      if (typeof d === 'object') { if (!existsSync(abs)) continue; }
      copyFileSync(src(file), abs); n++;
    }
  return n;
};

const n = plan([
  ['desk.js', ['sdk/desk.js', 'sdk/template/desk.js', 'packages/cli/assets/desk.js',
    'packages/cli/assets/template/desk.js', 'examples/notes/desk.js', 'examples/scribble/desk.js']],
  ['desk.d.ts', ['sdk/desk.d.ts', 'packages/cli/assets/desk.d.ts']],
  ['dev.html', ['sdk/dev.html', 'sdk/template/dev.html', 'packages/cli/assets/dev.html',
    'packages/cli/assets/template/dev.html']],
  ['template/index.html', ['sdk/template/index.html', 'packages/cli/assets/template/index.html']],
  ['template/manifest.json', ['sdk/template/manifest.json', 'packages/cli/assets/template/manifest.json']],
]);
console.log(`本仓已同步 ${n} 处 ← 主仓 ${src('')}`);

if (market) {
  const m = plan([
    ['desk.js', ['sdk/desk.js', 'sdk/template/desk.js', 'sdk/npm/cli/assets/desk.js',
      'sdk/npm/cli/assets/template/desk.js', { root: market, path: 'src/notes/desk.js' },
      { root: market, path: 'src/scribble/desk.js' }, { root: market, path: 'src/gallery/desk.js' }]],
    ['desk.d.ts', ['sdk/desk.d.ts', 'sdk/npm/cli/assets/desk.d.ts']],
    ['dev.html', ['sdk/dev.html', 'sdk/template/dev.html', 'sdk/npm/cli/assets/dev.html',
      'sdk/npm/cli/assets/template/dev.html']],
    ['template/index.html', ['sdk/template/index.html', 'sdk/npm/cli/assets/template/index.html']],
    ['template/manifest.json', ['sdk/template/manifest.json', 'sdk/npm/cli/assets/template/manifest.json']],
  ].map(([f, ds]) => [f, ds.map(d => typeof d === 'object' ? d : { root: market, path: d })]));
  console.log(`market 已同步 ${m} 处（记得重跑 tools/market-pack.py）`);
}
