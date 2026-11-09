// defineConfig 改为 type-only 引入：config 会被 CJS 打包 require，运行时 import ESM 包
// 会报 "ESM file cannot be loaded by require"（vitepress 1.6.4 实测），类型提示不受影响
import type { UserConfig } from 'vitepress';

export default {
  // GitHub Pages 项目站：https://cooingwu.github.io/lodestar-sdk/
  base: '/lodestar-sdk/',
  title: 'Lodestar 插件开发',
  description: '把 Windows 桌面变成无限画布——你的网页就是画布上的对象',
  lang: 'zh-CN',
  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/intro' },
      { text: '示例', link: '/examples' },
      { text: 'GitHub', link: 'https://github.com/cooingwu/lodestar-sdk' },
    ],
    sidebar: [
      {
        text: '指南',
        items: [
          { text: '插件是什么', link: '/guide/intro' },
          { text: 'manifest 与权限', link: '/guide/manifest' },
          { text: 'desk API 参考', link: '/guide/api' },
          { text: '开发与调试', link: '/guide/dev' },
          { text: '分发', link: '/guide/dist' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/cooingwu/lodestar-sdk' },
    ],
  },
} satisfies UserConfig;
