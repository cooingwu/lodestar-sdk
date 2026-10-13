# desk API 参考

SDK 版本 v0.2.0（`desk.version`）。所有异步 API 的结果都经 `desk.on` 事件送达。

## storage（基础能力，无需声明）

```js
desk.storage.get('key')            // 异步读；desk.on('plugin.kv', m => m.k === 'key' && ...)
desk.storage.set('key', 'value')   // 写（string；对象请 JSON.stringify）
```

按面板实例隔离（`desk.instance`），配额每插件 5MB，超限拒绝并警告。

## 网络请求 desk.fetch（需 `net`）

```js
const r = await desk.fetch('https://api.example.com/data.json');
if (r.ok) { const data = JSON.parse(r.body); }
```

宿主代理请求（绕浏览器 CORS）；限制：仅 http/https、禁内网地址、10s 超时、5MB 上限。

## 画布涂层 desk.canvas（需 `canvas`）

```js
desk.canvas.clear();
desk.canvas.draw([
  { op: 'path', pts: [[0,0],[100,50],[200,0]], stroke: '#ff5555', w: 3 },
  { op: 'text', x: 10, y: 80, text: '标注', size: 18, fill: '#fff' },
  { op: 'image', dataUrl: imgDataURL, x: 0, y: 100, w: 60, h: 60 },
]);
```

世界坐标（随画布缩放）；指令追加式，画布不持久化（插件自己用 storage 存，载入时重发）。

## 图标 / 文件 / 剪贴板 / 系统 / 壁纸

```js
desk.icons.list();                        // → desk.on('icons.list', m => m.icons)
desk.icons.move(path, x, y);
desk.icons.override(path, dataUrl);       // 只换显示图，不动真实文件
desk.files.write('笔记.txt', '内容', x, y);        // 画布上创建真实文件
desk.files.write('图.png', dataUrl, x, y);        // dataUrl 自动转二进制
desk.clipboard.set('文本');
desk.clipboard.get();                     // → desk.on('clipboard.result', m => m.text)
desk.system.info();                       // → desk.on('system.info', m => m.info)
desk.wallpaper.set(dataUrl);              // 立即生效（fixed/zoom 模式均跟随）
```

权限：`icons` / `files` / `clipboard` / `system` / `wallpaper`（见 manifest 页）。

## 通知与导出

```js
desk.notify(title, body);                 // 托盘气泡（需 notify）
desk.saveImage('截图.png', canvas.toDataURL());  // 落盘 图片\InfiniteDesk（需 saveImage）
```

## 面板交互

```js
desk.setDraggable(el);      // bare 面板声明拖动把手
desk.on('viewport', m => {});  // 视口变化（80ms 节流，变化通知语义）
```

## 事件一览（desk.on）

| 事件 | 载荷 | 触发 |
|---|---|---|
| `plugin.kv` | `{k, v, err?}` | storage.get 应答；err='quota' 表示写入被配额拒绝 |
| `viewport` | `{x, y, scale}` | 画布平移/缩放 |
| `plugin.fetch.result` | `{ok, status, body}` | desk.fetch 应答（Promise 化，一般不用手动订阅） |
| `icons.list` / `clipboard.result` / `system.info` | 见上 | 对应异步 API 应答 |
