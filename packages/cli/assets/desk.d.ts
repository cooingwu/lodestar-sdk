/** InfiniteDesk Plugin SDK v0.1 类型定义 */
declare global {
  interface Window {
    desk: Desk;
  }

  interface Desk {
    version: string;
    /** 当前面板实例 id（持久化按实例隔离） */
    instance: string;
    storage: DeskStorage;
    /** 订阅宿主→插件事件。v0 事件：'plugin.kv'（storage.get 应答，m.k/m.v） */
    on(type: string, cb: (msg: any) => void): void;
  }

  interface DeskStorage {
    /** 异步读取；结果经 desk.on('plugin.kv', m => ...) 送达（m.v: string | null） */
    get(key: string): void;
    /** 写入（对象请 JSON.stringify） */
    set(key: string, value: string): void;
  }
}

export {};
