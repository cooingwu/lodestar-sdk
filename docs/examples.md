# 官方示例（源码即文档）

| 示例 | 演示内容 |
|---|---|
| [notes 便签](https://github.com/) (`examples/notes`) | 最小读写：textarea + desk.storage 去抖持久化 |
| [scribble 涂鸦](https://github.com/) (`examples/scribble`) | canvas 绘制 + **归一化坐标（0–1）**存储（面板缩放内容跟随）+ 工具栏 + 压感 |
| template (`sdk/template`) | 脚手架：复制即用，含 dev.html 预览 |

要点速记：

- 做画图/排版类内容，**存归一化坐标**（0–1），面板任意缩放内容不糊不变形（scribble 的做法）。
- 大内容别塞 storage（5MB 配额）：`desk.files.write` 落成真实文件、`desk.saveImage` 落图片。
- 长列表自己分页，iframe 内容像素大小随面板缩放。
