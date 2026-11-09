#!/usr/bin/env node
// npm create @coohub/plugin <目录> 的入口（复用 @coohub/cli 的 create）
import { cmdCreate } from '../cli/lib.mjs';

const target = process.argv[2];
if (!target) {
  console.log('用法：npm create @coohub/plugin <目录名>');
  process.exit(1);
}
cmdCreate(target).catch(e => { console.error('错误: ' + e.message); process.exit(1); });
