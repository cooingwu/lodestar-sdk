# 开发与调试

## 方式一：浏览器预览（免装 InfiniteDesk）

```bash
cd my-plugin
npx serve .                # 任意静态服务器（Python -m http.server 也行）
# 打开 http://localhost:3000/dev.html
```

`dev.html`（在 [sdk/dev.html](https://github.com/)，模板已自带）实现 desk 协议的
浏览器版：storage 落 localStorage（刷新保留）、notify 用浏览器通知、savefile 转下载、
fetch 直连（受浏览器 CORS 限制）；icons/files/wallpaper/canvas 为 mock（回执带
`mock:true`，页面顶部有标识）。支持多实例、拖动/缩放/折叠。

或者用 CLI 一条龙：

```bash
npx desk-plugin dev        # 起服务器并自动开浏览器
```

## 方式二：真机（装 InfiniteDesk）

1. 目录放入 `%LOCALAPPDATA%\InfiniteDesk\plugins\` → 画布右键新建面板。
2. 改文件保存 → 面板自动重载（热加载）。
3. **DevTools**：设置 → 外观 → 开发者模式 → 开启并重启应用（或启动加 `--devtools`
   参数）；然后访问 `http://127.0.0.1:9223/json` / Chrome 的 `chrome://inspect`——
   画布页与各插件 iframe 都是可调试 target，console、断点、元素检查全可用（配额
   警告等 desk.js 输出在插件 iframe 的 console 里）。
4. 宿主日志：`%LOCALAPPDATA%\InfiniteDesk\logs\`（面板生命周期、权限拦截、配额
   拒绝均有留痕）。

## 打包校验

```bash
npx desk-plugin validate   # 校验 manifest（id/版本/权限拼写/文件齐全）
npx desk-plugin pack       # 打包 dist/<id>-<version>.zip
```
