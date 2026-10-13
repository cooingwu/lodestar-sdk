/*!
 * InfiniteDesk Plugin SDK v0.2.0 — 运行时（双环境：宿主独立 WebView2 面板 / 页面内 iframe）
 * 用法：
 *   desk.storage.get('key')            // 异步读取，结果通过 desk.on('plugin.kv', cb) 送达
 *   desk.storage.set('key', 'value')   // 写入（宿主 SQLite，按面板实例隔离）
 *   desk.notify(title, body)           // 托盘通知
 *   desk.saveImage(name, dataUrl)      // 导出图片到 图片\InfiniteDesk
 *   desk.instance                       // 当前面板实例 id
 */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search);
  var instance = qs.get('instance') || '';
  var inWv2 = !!(window.chrome && window.chrome.webview);

  function send(m) {
    m.__desk = true;
    m.instance = instance;
    if (inWv2) window.chrome.webview.postMessage(m);
    else parent.postMessage(m, '*');
  }

  var listeners = {};
  var pending = {};   // fetch 请求回调（reqId → resolve）
  var seq = 0;
  function dispatch(e) {
    var m = e.data;
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'plugin.kv' && m.err === 'quota')
      console.warn('[desk] 插件存储已满（配额 5MB），本次写入被拒绝: ' + m.k);
    // fetch 应答走 Promise
    if (m.t === 'plugin.fetch.result' && m.reqId && pending[m.reqId]) {
      var cb = pending[m.reqId];
      delete pending[m.reqId];
      cb({ ok: m.ok, status: m.status, body: m.body });
      return;
    }
    var arr = listeners[m.t];
    if (arr) for (var i = 0; i < arr.length; i++) arr[i](m);
  }
  if (inWv2) window.chrome.webview.addEventListener('message', dispatch);
  else window.addEventListener('message', dispatch);

  // 点击面板内容区时通知画布把面板置顶（iframe 内事件不跨 frame 冒泡，画布自身收不到）。
  // 必须强制走 parent.postMessage：同源 iframe 里 chrome.webview 也存在，若走 WebView2
  // 通道会直达宿主（宿主不处理置顶——那是页面 DOM 的事，消息会石沉大海）
  document.addEventListener('pointerdown', function () {
    parent.postMessage({ __desk: true, t: '__frameActive', instance: instance }, '*');
  }, true);

  window.desk = {
    version: '0.2.0',
    instance: instance,
    storage: {
      /** 读取（异步）。结果事件：desk.on('plugin.kv', m => m.k === 'key' && ...)，m.v 为 string|null */
      get: function (k) { send({ t: 'plugin.kv.get', k: k }); },
      /** 写入（string；对象请 JSON.stringify） */
      set: function (k, v) { send({ t: 'plugin.kv.set', k: k, v: String(v) }); },
    },
    /** 订阅宿主→插件事件（v0：'plugin.kv'；后续：viewport/panel-resize/...） */
    on: function (t, cb) {
      (listeners[t] = listeners[t] || []).push(cb);
    },
    /** 托盘通知（宿主气泡） */
    notify: function (title, body) { send({ t: 'plugin.notify', title: title, body: body }); },
    /** 宿主代理网络请求（绕浏览器 CORS；需声明 net 权限）。resolve({ok, status, body}) */
    fetch: function (url) {
      return new Promise(function (resolve) {
        var id = 'f' + (++seq);
        pending[id] = resolve;
        send({ t: 'plugin.fetch', url: url, reqId: id });
      });
    },
    /** 剪贴板（需声明 clipboard 权限）；get 异步 → desk.on('clipboard.result', m=>m.text) */
    clipboard: {
      get: function () { send({ t: 'plugin.clipboard.get' }); },
      set: function (text) { send({ t: 'plugin.clipboard.set', text: String(text) }); },
    },
    /** 系统信息（需声明 system 权限）→ desk.on('system.info', m=>m.info) */
    system: {
      info: function () { send({ t: 'plugin.system.info' }); },
    },
    /** 图标操作（需声明 icons 权限）*/
    icons: {
      /** 异步 → desk.on('icons.list', m=>m.icons)：[{path,name,x,y,folder}]（仅工作区文件）*/
      list: function () { send({ t: 'plugin.icons.list' }); },
      move: function (path, x, y) { send({ t: 'plugin.icons.move', path: path, x: x, y: y }); },
      /** 更换图标显示图片（dataUrl；不影响真实文件）*/
      override: function (path, dataUrl) { send({ t: 'plugin.icons.override', path: path, data: String(dataUrl).split(',')[1] || '' }); },
    },
    /** 文件物化（需声明 files 权限）：在画布上创建真实文件 */
    files: {
      /** name=文件名，data=纯文本或 base64(dataUrl)，x/y=画布落点 */
      write: function (name, data, x, y) {
        var isDataUrl = /^data:/.test(String(data));
        send({ t: 'plugin.files.write', name: name, data: isDataUrl ? String(data).split(',')[1] : String(data), base64: isDataUrl, x: x, y: y });
      },
    },
    /** 设置画布壁纸（需声明 wallpaper 权限；dataUrl 图片）*/
    wallpaper: {
      set: function (dataUrl) { send({ t: 'plugin.wallpaper.set', data: String(dataUrl).split(',')[1] || '' }); },
    },
    /** 画布涂层绘画（需声明 canvas 权限）：世界坐标指令，随画布缩放。
     * cmds: [{op:'path',pts:[[x,y]..],stroke,w} | {op:'text',x,y,text,size,fill} | {op:'image',dataUrl,x,y,w,h}]
     * 每次 draw 追加；clear 清空本面板涂层。 */
    canvas: {
      clear: function () { parent.postMessage({ __desk: true, t: 'plugin.canvas.clear', instance: instance }, '*'); },
      draw: function (cmds) { parent.postMessage({ __desk: true, t: 'plugin.canvas.draw', instance: instance, cmds: cmds }, '*'); },
    },
    /** bare 面板（无标题栏）声明拖动把手：该元素上的拖拽 = 移动整个面板 */
    setDraggable: function (el) {
      if (!el) return;
      var dragging = false, sx = 0, sy = 0;
      el.addEventListener('pointerdown', function (e) {
        dragging = true; sx = e.clientX; sy = e.clientY;
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      el.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        parent.postMessage({ __desk: true, t: 'plugin.drag', instance: instance, dx: e.clientX - sx, dy: e.clientY - sy }, '*');
        sx = e.clientX; sy = e.clientY;
      });
      var up = function () { dragging = false; };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    },
    /** 导出图片：保存到 图片\InfiniteDesk（dataUrl = canvas.toDataURL() 等；同名自动加序号） */
    saveImage: function (name, dataUrl) {
      var b64 = String(dataUrl).split(',')[1] || '';
      send({ t: 'plugin.savefile', name: name, data: b64 });
    },
  };
})();
