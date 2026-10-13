# 插件是什么

一个**目录**，内含至少两个文件：

```
my-plugin/
├── manifest.json   # 清单（必需）
└── index.html      # 插件 UI（必需）
```

把目录放进 `%LOCALAPPDATA%\InfiniteDesk\plugins\` 即完成安装——**无需重启**，画布
空白处右键菜单立刻出现"新建<你的插件名>"。（开发期直接把目录放进去，改文件保存即热加载。）

## 运行环境（安全模型）

- 你的 `index.html` 运行在画布页内的**沙箱 iframe**：`sandbox="allow-scripts"`。
  **无同源权限**：碰不到画布 DOM、碰不到用户任何本地资源（无 localStorage、无网络域
  绑定限制之外的能力——本质就是个普通网页）。
- 与宿主的唯一通道是 `postMessage`（SDK 已封装）。
- 一个插件可以在画布上放多个面板实例，每个实例有独立的持久化命名空间。
- URL 参数 `?instance=<面板id>` 标识当前实例。

## SDK（desk.js）

把 [sdk/desk.js](https://github.com/) 复制进你的插件目录，页面里 `<script src="desk.js"></script>`。
TypeScript 类型定义：`sdk/desk.d.ts`。

```js
desk.version            // '0.2.0'
desk.instance           // 当前面板实例 id

desk.storage.get('key')            // 异步读；结果经事件送达
desk.storage.set('key', 'value')   // 写（string；对象请 JSON.stringify）

desk.on('plugin.kv', m => {        // 订阅宿主事件
  // m.k = 键名, m.v = string | null
})
```

典型读写模式：

```js
// 读
desk.storage.get('text');
desk.on('plugin.kv', m => { if (m.k === 'text' && m.v && !t.value) t.value = m.v; });

// 写（去抖）
let timer;
input.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => desk.storage.set('text', input.value), 400);
});
```

**存储配额**：每插件 5MB（k+v 字符总量，跨其全部面板实例合计）。超限写入被宿主拒绝
（数据不落库，console 出 `[desk] 插件存储已满` 警告，宿主日志同时留痕）——大对象请
压缩或改用 `desk.saveImage` / `desk.files.write` 落成文件。

## 面板行为（宿主提供，插件零代码）

- 用户从右键菜单"新建<插件名>"创建面板（默认 260×200，可建任意多个）。
- 面板标题栏拖动 = 画布上移动；右下角手柄 = 缩放；点击 = 置顶；× = 删除（实例数据一并删除）。
- 面板随画布平移/缩放（面板外框几何跟随；**iframe 内容像素大小随面板缩放**——
  做画图类内容请用归一化坐标（0–1）存储，参考涂鸦插件）。
- **离屏挂起**：面板被平移出当前视口后自动 `display:none`——iframe 渲染与 rAF 暂停
  （省资源），回到视口恢复、内容不丢。不要依赖"离屏期间仍每帧执行的 rAF"做逻辑。
- **视口事件**：`desk.on('viewport', m => { /* m.x, m.y, m.scale */ })`——画布平移/缩放
  时广播（80ms 节流）。变化通知语义：面板刚创建/加载时没有初始事件，插件自己记住
  最近一次即可。
