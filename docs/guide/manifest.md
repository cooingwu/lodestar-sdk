# manifest 与权限

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "0.1.0",
  "author": "you",
  "description": "一句话描述",
  "permissions": ["notify", "saveImage"],
  "panelStyle": "default"
}
```

## 面板形态（panelStyle）

- `"default"`（缺省）：标题栏 + 背景 + 圆角 + 阴影 + 八向边缘缩放。
- `"bare"`：**无标题栏、无背景、无边框**——卡通形象 / 自由形态插件。
  bare 面板拖动需在插件内声明把手：`desk.setDraggable(document.getElementById('pet'))`，
  被声明元素上的拖拽 = 移动整个面板（音乐播放器把封面当把手、桌宠把本体当把手）。
  缩放仍可用边缘命中区（悬停出现缩放光标）。

## 权限（v0）

- `storage`（desk.storage.get/set）是基础能力，**无需声明**。
- 其余能力都需要声明，否则调用被宿主拦截：
  `notify` `saveImage` `net`（互联网） `clipboard`（剪贴板读写） `system`（电量/内存）
  `icons`（图标列表/移动/换图） `files`（在画布创建文件） `wallpaper`（换壁纸） `canvas`（画布绘画）
- **声明了 `permissions` 字段的插件首次被发现时会收到托盘气泡告知**；用户可在
  设置 → 插件中停用或清空数据。

## 音频

插件目录里的音频文件（mp3/ogg/wav…）**直接用浏览器原生能力播放**，无需 SDK API：

```js
const audio = new Audio('bgm.mp3');
audio.loop = true;
audio.play();
```

（WebView2 桌面环境允许自动播放。）将来需要"面板删除后继续播放"的后台音频再扩展
宿主侧 API。
