---
hero: true
---

# Lodestar 插件开发

把 Windows 桌面变成**无限画布**：文件图标、便签、涂鸦和一切插件都是画布上的对象。

你的插件 = 一个网页（HTML + JS），跑在画布上的沙箱 iframe 里——**会写网页就会写插件**。

## 三分钟上手

```bash
npm create @coohub/plugin my-plugin
cd my-plugin
npx serve .
# 打开 http://localhost:3000/dev.html —— 不装 Lodestar 也能预览
```

## 它能做什么

- **便签/清单类**：`desk.storage` 按面板实例持久化（SQLite）
- **信息流类**：`desk.fetch` 宿主代理网络请求（无 CORS）
- **桌面增强类**：读图标列表/移动图标/换壁纸/在画布创建文件（按权限声明）
- **画布标注类**：`desk.canvas` 在画布世界坐标上绘画
- **导出类**：`desk.saveImage` 落盘到用户图片库

下一步 → [插件是什么](/guide/intro)
