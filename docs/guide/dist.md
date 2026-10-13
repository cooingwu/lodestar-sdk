# 分发

v0：插件目录直接 zip 分发，用户解压到 plugins 目录即可：

```
%LOCALAPPDATA%\InfiniteDesk\plugins\
└── my-plugin\
    ├── manifest.json
    ├── index.html
    └── desk.js
```

用 `desk-plugin pack` 产出的 zip 解压后即此结构（dev.html / dist / node_modules
不会被打进包）。

包管理器、插件市场与签名校验在 v2 规划中（见 InfiniteDesk 路线图）。

**红线**：第三方插件的安装与使用永不进付费墙。
