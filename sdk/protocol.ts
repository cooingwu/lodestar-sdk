/** L1 桥接协议 —— SDK 公开仓的 source of truth（PLAN §8.2：私有主仓通过包引用消费本定义）。
 * 注意：主仓 src/canvas/src/protocol.ts 目前为同步副本；发布前接入 CI 单向同步或改为主仓引用本文件。 */

export interface IconItem {
  path: string;
  name: string;      // 显示名（.lnk 已去后缀；虚拟项为 Shell 显示名）
  icon: string;      // dataURL PNG（缩略图优先，回退图标）
  folder: boolean;
  x: number;         // 画布世界坐标
  y: number;
  container?: string; // 所属容器 id（空 = 无）
  virtual?: boolean;  // Shell 命名空间虚拟项（回收站等，path 形如 ::{CLSID}：不可 F2/不可拖出）
}

export interface ContainerItem {
  id: string;
  name: string;
  x: number; y: number; w: number; h: number;
  collapsed: boolean;
}

/** 插件面板实例（M2）：世界坐标矩形，内容为沙箱 iframe */
export interface PluginPanelItem {
  id: string;
  plugin: string;   // 插件 id（manifest id），iframe 源 https://plugins/<id>/index.html
  x: number; y: number; w: number; h: number;
  z: number;
  collapsed: boolean;
  pinned?: boolean;  // 固定屏幕模式：坐标=屏幕像素、不随画布平移缩放（默认 false=嵌在画布）
}

export interface Viewport {
  x: number;         // 视口左上角的世界坐标
  y: number;
  scale: number;
}

export type HostToCanvas =
  | { t: 'init'; icons: IconItem[]; containers: ContainerItem[]; panels: PluginPanelItem[]; viewport: Viewport; viewportHome?: Viewport; wallpaper: string | null; plugins: { id: string; name: string; panelStyle?: string }[]; settings: Record<string, string>; spaceId?: number; spaceName?: string }
  | { t: 'icons'; icons: IconItem[]; containers: ContainerItem[]; panels?: PluginPanelItem[]; viewportHome?: Viewport; wallpaper: string | null }
  | { t: 'drag.cancel' }   // 宿主接管拖出（OLE），页面需还原本地拖拽
  | { t: 'rename.closed' } // 宿主原生重命名框已关闭（页面清跟随状态）
  | { t: 'plugin.kv'; instance: string; k: string; v: string | null; err?: string }  // storage.get 应答（err=quota：超配额拒绝）
  | { t: 'plugin.reload'; plugins: string[] }                          // 插件目录变化：重载其所有 iframe（热加载）
  | { t: 'settings'; key: string; value: string }                      // 设置变更广播（其他表面同步）
  | { t: 'suspend'; on: boolean }                                       // 全屏挂起/恢复（宿主 QUNS 独占全屏检测，M1 收尾）
  | { t: 'key'; code: string; down: boolean; ctrl: boolean; shift: boolean }; // 键盘镜像（宿主 WH_KEYBOARD_LL）
export type CanvasToHost =
  | { t: 'ready'; mon?: string }
  | { t: 'focus'; mon?: string }   // 页面被点击：宿主需注入键盘焦点（桌面层子窗口收不到 WM_ACTIVATE，Chromium 内部不激活）
  | { t: 'diag'; mon?: string; iw: number; ih: number; dpr: number;
       cw: number; ch: number; ccw: number; cch: number;
       vx: number; vy: number; vs: number; icons: number; firstIcon: { x: number; y: number } | null }
  | { t: 'launch'; path: string }
  | { t: 'icon.move'; moves: { path: string; x: number; y: number }[] }
  | { t: 'icon.delete'; paths: string[]; system?: boolean }   // system=true 从系统删除：文件直接进回收站，无视其他工作区引用
  | { t: 'contextmenu'; paths: string[] }
  | { t: 'icon.rename'; path: string; name: string; x: number; y: number }
  | { t: 'container.create'; id: string; name: string; x: number; y: number; w: number; h: number; paths: string[] }
  | { t: 'container.move'; id: string; x: number; y: number }
  | { t: 'container.rename'; id: string; name: string }
  | { t: 'container.collapse'; id: string; collapsed: boolean }
  | { t: 'container.disband'; id: string }
  | { t: 'icon.container'; paths: string[]; container: string }
  | { t: 'drag.local'; paths: string[] }   // 画布内图标拖拽开始（宿主开始监测是否拖出）
  | { t: 'drag.end' }
  | { t: 'canvas.snapshot'; data: string }   // 纯 base64 PNG（页面 canvas.toBlob 导出）
  | { t: 'icons.importnative' }   // 手动导入原生桌面布局
  | { t: 'icons.importdesktop' }  // 从系统桌面导入文件到工作区
  | { t: 'icons.exportdesktop' }  // 导出工作区全部文件到系统桌面
  | { t: 'recyclebin.empty' }     // 清空回收站（虚拟项菜单）
  | { t: 'icon.copypath'; paths: string[] }  // 复制完整路径到剪贴板（HTML 菜单）
  | { t: 'rename.begin'; path: string; name: string; x: number; y: number; sx: number; sy: number; fs: number; w: number; maxW: number; mon?: string }  // 请求宿主弹原生重命名框（maxW=标签展示最大宽 CSS——输入框上限与展示一致）
  | { t: 'rename.beginc'; id: string; name: string; sx: number; sy: number; fs: number; w: number; mon?: string }    // 容器同款
  | { t: 'rename.move'; sx: number; sy: number; fs: number; w: number; mon?: string }   // 画布平移/缩放时浮层跟随
  | { t: 'panel.create'; plugin: string; x?: number; y?: number }          // 创建插件面板（空白菜单/SDK）
  | { t: 'panel.move'; id: string; x: number; y: number }                  // 拖动结束
  | { t: 'panel.resize'; id: string; w: number; h: number }                // 缩放结束
  | { t: 'panel.focus'; id: string }                                       // 点击面板置顶
  | { t: 'panel.collapse'; id: string; collapsed: boolean }                // 收起/展开
  | { t: 'panel.pin'; id: string; pinned: boolean }                       // 切换 跟随画布/固定屏幕
  | { t: 'panel.delete'; id: string }
  | { t: 'plugin.notify'; instance: string; title: string; body: string }  // 托盘通知
  | { t: 'plugin.savefile'; instance: string; name: string; data: string } // 保存图片到 图片\Lodestar（data=纯 base64）
  | { t: 'plugin.diag'; instance: string; s: string }                      // 插件 iframe 生命周期诊断（load/error）
  | { t: 'plugin.drag'; instance: string; dx: number; dy: number }         // bare 面板拖动（desk.setDraggable 声明的把手）
  | { t: 'settings.set'; key: string; value: string }                      // UI 设置持久化（壁纸模式/网格等，kv 存储+跨表面广播）
  | { t: 'app.settings' }                                                   // 打开设置窗
  | { t: 'space.copy' }                                                     // 复制当前工作区全部布局
  | { t: 'space.copySel'; paths: string[]; containers: string[]; panels: string[] }  // 复制选中内容（含相交分组/面板）
  | { t: 'space.paste'; x?: number; y?: number }                            // 粘贴到当前工作区（x/y=右键点世界坐标）
  | { t: 'plugin.kv.set'; instance: string; k: string; v: string }         // 插件存储写
  | { t: 'plugin.kv.get'; instance: string; k: string }                    // 插件存储读（应答=HostToCanvas plugin.kv）
  | { t: 'viewport'; mon?: string; x: number; y: number; scale: number; vw?: number; vh?: number; dpr?: number }
  | { t: 'panel.log'; s: string };   // 面板操作诊断日志（宿主转写入应用日志）
