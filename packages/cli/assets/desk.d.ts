/** Lodestar Plugin SDK v0.10.2 类型定义 */
declare global {
  interface Window {
    desk: Desk;
  }

  interface Desk {
    version: string;
    /** 当前面板实例 id（持久化按实例隔离） */
    instance: string;
    storage: DeskStorage;
    /** 屏幕清单（v0.9，只读系统信息免权限）：resolve([{mon, primary, w, h}])。
     *  多屏分发（"发送到屏幕"）数据源，mon 传给 panel.toScreen。 */
    screens(): Promise<DeskScreen[]>;
    /** 工作区清单（v0.9.1，只读系统信息免权限）：resolve([{id, name, current}])。
     *  current=本面板所在工作区；id 传给 panel.toSpace（跨工作区分发同一实体）。 */
    spaces(): Promise<DeskSpaceEntry[]>;
    /** 双屏内容直播（渲染级别=实时；离屏门控见 manifest liveSnapshot） */
    live: DeskLive;
    /** 全局图标外观（需声明 appearance 权限）；改动即时广播生效 */
    appearance: DeskAppearance;
    /** 系统字体（v0.5）：本机已安装字体族 */
    fonts: DeskFonts;
    /** 面板控制：右键菜单自定义 / 折叠展开 */
    panel: DeskPanel;
    /** 品牌 UI（v0.10，纯本地 DOM） */
    ui: DeskUI;
    /** 订阅宿主→插件事件。常见：'plugin.kv'（storage.get 应答，m.k/m.v）、'appearance.info'、
     *  'viewport'（m.x/m.y/m.scale）、'panel.state'（m.collapsed/m.pinned/m.locked/m.w/m.h，迟注册自动补发最近一次；
     *  m.locked=面板被用户锁定，输入穿透、不可拖动/缩放/关闭）、
     *  'plugin.fonts'（fonts.list 应答，m.fonts: string[]） */
    on(type: string, cb: (msg: any) => void): void;
  }

  /** 双屏内容直播：同一工作区显示在多台显示器时，把本面板内容增量实时发到其他屏的
   *  同 id 面板（宿主排除源屏转发，无回声）。不落库——持久化走 storage.set。 */
  interface DeskLive {
    /** 发送增量（任意可结构化克隆的值） */
    send(ch: string, d: any): void;
    /** 接收其他屏发来的增量 */
    on(ch: string, cb: (d: any) => void): void;
    /** 注册全量快照生成器（需 manifest "liveSnapshot": true）：宿主对离屏表面丢弃增量，
     *  对屏回视/重挂时发 resync，宿主调 fn() 生成全量按常规直播重发。接收端须把快照消息
     *  实现为"整体替换"语义（幂等，重复到达无害）。 */
    snapshot(ch: string, fn: () => any): void;
  }

  interface DeskFonts {
    /** 异步读取本机已安装字体族；结果经 desk.on('plugin.fonts', m => m.fonts) 送达
     *  （string[]，本地化族名，宿主已排序）。只读系统信息，无需权限。 */
    list(): void;
  }

  interface DeskStorage {
    /** 异步读取；结果经 desk.on('plugin.kv', m => ...) 送达（m.v: string | null） */
    get(key: string): void;
    /** 写入（对象请 JSON.stringify） */
    set(key: string, value: string): void;
    /** 插件级全局命名空间（v0.9）：同插件全部面板实例共享。写入/删除成功即向全部
     *  实例广播 plugin.kv.sync（键冠 g: 前缀，插件侧同串跳过防回声）。配额与实例
     *  kv 合计（5MB/插件）。 */
    global: DeskStorageGlobal;
  }

  interface DeskStorageGlobal {
    /** 读取；结果经 desk.on('plugin.gkv', m => ...) 送达（m.v: string | null） */
    get(key: string): void;
    /** 写入（string）；广播 plugin.kv.sync {k:'g:'+key, v} */
    set(key: string, value: string): void;
    /** 删除；广播 plugin.kv.sync {k:'g:'+key, v:null} */
    del(key: string): void;
  }

  /** 屏幕清单条目（desk.screens() 应答） */
  interface DeskScreen {
    /** 屏幕序号（panel.toScreen 参数） */
    mon: number;
    primary: boolean;
    w: number;
    h: number;
  }

  /** 工作区清单条目（desk.spaces() 应答） */
  interface DeskSpaceEntry {
    /** 工作区 id（panel.toSpace 参数） */
    id: number;
    name: string;
    current: boolean;
  }

  interface DeskAppearance {
    /** 异步读取；结果经 desk.on('appearance.info', m => m.appearance) 送达：
     *  { iconTextColor: '#rrggbb'; iconTextShadow: '0'~'100'; iconBgColor: '#rrggbb' | '' } */
    get(): void;
    /** 修改并全局生效（与设置页外观同源）：
     *  iconTextColor=#rrggbb 文字颜色；iconTextShadow='0'~'100' 文字阴影强度；iconBgColor=#rrggbb 或 ''（关闭背景色块） */
    set(key: 'iconTextColor' | 'iconTextShadow' | 'iconBgColor', value: string): void;
  }

  /** 面板右键菜单项（desk.panel.setMenu）。分隔符传 { sep: true } */
  interface DeskMenuItem {
    label: string;
    /** 右侧快捷键读数（纯展示，如 'Ctrl+Z'） */
    accel?: string;
    /** 危险态（红色，用于删除类操作） */
    danger?: boolean;
    /** 禁用保位 */
    disabled?: boolean;
    /** ✓ 前缀标记（勾选态） */
    check?: boolean;
    /** 子菜单（一层） */
    sub?: DeskMenuEntry[];
    /** 点击回调（在插件 iframe 内执行） */
    action?: () => void;
  }

  type DeskMenuEntry = DeskMenuItem | { sep: true };

  interface DeskPanel {
    /** 注册面板右键菜单自定义项（全量替换；[] = 清空）。显示在系统通用项（折叠/固定/关闭）之前 */
    setMenu(items: DeskMenuEntry[]): void;
    /** 运行时开关系统右键菜单（false = 右键完全交给插件自管；静态关闭用 manifest "contextMenu": false） */
    setContextMenu(on: boolean): void;
    /** 折叠/展开本面板（content 折叠形态的插件在自绘迷你态里用于展开） */
    setCollapsed(on: boolean): void;
    /** 把本插件再放一块面板到指定屏幕（v0.9，mon 来自 desk.screens()）：新面板建在
     *  目标屏视口中心（不自动固定屏幕），实例 kv 全量复制——配合 storage.global
     *  即「多屏分显同一实体」。仅真面板（页面内 iframe）可用。 */
    toScreen(mon: number): void;
    /** 把本插件再放一块面板到指定工作区（v0.9.1，id 来自 desk.spaces()）：新面板建在
     *  该工作区视口中心，实例 kv 全量复制——跨工作区同显同一实体。仅真面板可用。 */
    toSpace(id: number): void;
  }

  /** 品牌 UI（v0.10） */
  interface DeskUI {
    /** 北辰三星呼吸加载指示（与宿主面板加载态/启动页同款节律）。在容器 el 内挂绝对
     *  定位覆盖层（居中、不挡交互；el 为 static 定位时自动转 relative）。
     *  loading(el) 显示（幂等不叠加）；loading(el, false) 撤除；color=CSS 颜色
     *  （默认北辰蓝 #6EA8FF）。返回覆盖层元素（撤除时 null）。 */
    loading(el: HTMLElement, on?: boolean, color?: string): HTMLDivElement | null;
  }
}

export {};
