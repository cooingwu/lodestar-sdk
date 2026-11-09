#!/usr/bin/env node
// desk-plugin — Lodestar 插件开发 CLI 入口（实现在 lib.mjs）
import { cmdCreate, cmdDev, cmdPack, cmdValidate, HELP } from './lib.mjs';

const [, , cmd, ...rest] = process.argv;
const flags = new Set(rest.filter(a => a.startsWith('--')));
const args = rest.filter(a => !a.startsWith('--'));

try {
  switch (cmd) {
    case 'create': await cmdCreate(args[0] ?? '.', flags); break;
    case 'dev': await cmdDev(args[0] ?? '.', { port: intFlag('--port', rest), open: !flags.has('--no-open') }); break;
    case 'pack': cmdPack(args[0] ?? '.'); break;
    case 'validate': cmdValidate(args[0] ?? '.'); break;
    default: console.log(HELP); process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  console.error('错误: ' + e.message);
  process.exit(1);
}

function intFlag(name, argv) {
  const i = argv.indexOf(name);
  const v = i >= 0 ? parseInt(argv[i + 1], 10) : NaN;
  return Number.isFinite(v) ? v : undefined;
}
