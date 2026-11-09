import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Lodestar 插件开发',
  description: '把 Windows 桌面变成无限画布——你的网页就是画布上的对象',
  lang: 'zh-CN',
  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/intro' },
      { text: '示例', link: '/examples' },
      { text: 'GitHub', link: 'https://github.com/' },
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
    socialLinks: [],
  },
});
