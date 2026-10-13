# infinitedesk-sdk

[InfiniteDesk](https://github.com/) 的插件开发 SDK（MIT 开源）：把 Windows 桌面变成
无限画布，你的网页就是画布上的对象。

> InfiniteDesk 本体（闭源）开发中；本仓先以源码形式提供 SDK 与工具链。

## 仓库内容

| 目录 | 说明 |
|---|---|
| `sdk/desk.js` | 插件运行时（纯静态 JS，`<script>` 引入即用） |
| `sdk/desk.d.ts` | TypeScript 类型定义 |
| `sdk/protocol.ts` | 宿主↔画布桥接协议（source of truth，见 PLAN §8.2） |
| `sdk/dev.html` | 浏览器版插件调试器（免装 InfiniteDesk 预览） |
| `sdk/template/` | 脚手架模板（复制即用，含 dev.html） |
| `packages/cli` | `desk-plugin` CLI：create / dev / pack / validate |
| `packages/create-plugin` | `npm create @infinitedesk/plugin` 入口 |
| `examples/` | 官方示例插件源码（notes 便签 / scribble 涂鸦）——源码即文档 |
| `docs/` | 文档站（VitePress） |

## 快速开始（不装 InfiniteDesk 也能开发）

```bash
npm create @infinitedesk/plugin my-plugin   # 脚手架（或复制 sdk/template）
cd my-plugin
npx serve .                                  # 任意静态服务器
# 打开 http://localhost:3000/dev.html 预览（storage/notify/savefile 可用）
```

装了 InfiniteDesk 的真机调试：把目录复制到 `%LOCALAPPDATA%\InfiniteDesk\plugins\`
即生效（热加载）；DevTools 见文档站「开发与调试」。

## 文档

文档站：`docs/`（`npm i && npm run docs:dev` 本地起）。
最简阅读路径：`docs/guide/intro.md` → `manifest.md` → `api.md`。

## 同步说明（发布前待办）

desk.js / dev.html / template / CLI 的源头目前仍在私有主仓 `InfiniteDesk/sdk/`
（构建链在那里），本仓为发布镜像。发布前需要：CI 单向同步，或主仓改为包引用消费
本仓（协议文件 protocol.ts 已按"本仓为 source of truth"标注）。

## License

MIT（见 LICENSE）。官方示例插件源码同为 MIT，可自由改造分发。
