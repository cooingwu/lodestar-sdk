/*!
 * Lodestar Plugin SDK v0.10.2 — 运行时（双环境：宿主独立 WebView2 面板 / 页面内 iframe）
 * v0.10.2：setMenu 菜单开着时推迟到关闭补推（换血不吞正显示菜单的点击回执）；
 *   点击回执 desk.menu.run 支持上一代回调表回退、id 跨 setMenu 不再归零——插件在
 *   状态变化后重推菜单（如相册把 disabled 随 items/miss 刷新）不再丢点击（真机
 *   2026-10-24「清理失效项/移除项目有时候点不动」的两处根因之一）
 * v0.10.1：setDraggable 把手拖动新增结束信号——pointerup/自终时上报 plugin.drag {end:1}，
 *   画布侧据此立即收尾（落库+撤吸附参考线）。此前页面只能靠 200ms 增量静默猜结束，
 *   拖动中鼠标停住 200ms 即误判结束、参考线消失（真机 2026-10-24 反馈）
 * 用法：
 *   desk.storage.get('key')            // 异步读取，结果通过 desk.on('plugin.kv', cb) 送达
 *   desk.storage.set('key', 'value')   // 写入（宿主 SQLite，按面板实例隔离）
 *   desk.storage.global.get/set/del    // 插件级全局命名空间（同插件全部面板实例共享，
 *                                      //   如相册内容）。写入成功即向全部实例广播
 *                                      //   plugin.kv.sync（k 冠 g: 前缀，同串跳过防回声）
 *   desk.live.send('ch', data)         // 双屏内容直播：增量实时发到其他屏的同 id 面板（渲染级别=实时）
 *   desk.live.on('ch', cb)             // 接收其他屏发来的内容增量 cb(data)
 *   desk.live.snapshot('ch', fn)       // 注册全量快照（manifest "liveSnapshot": true）：宿主对
 *                                      //   离屏表面丢增量省资源，对屏回视/重挂时发 plugin.live.resync，
 *                                      //   这里调 fn() 生成全量按常规直播重发（接收端按"整体替换"实现）
 *   desk.notify(title, body)           // 托盘通知
 *   desk.saveImage(name, dataUrl)      // 导出图片到 图片\Lodestar
 *   desk.media.pick({folder:true})     // 选择本地文件夹/文件 → 引用式媒体条目（含可渲染 url）
 *   desk.media.list(path)              // 刷新已授权文件夹快照
 *   desk.media.onDrop(cb)              // OS 拖入面板的文件（manifest acceptDrop）
 *   desk.media.onChanged(cb)           // 授权文件夹内容变化（实时跟随）→ cb(folderPath)
 *   desk.media.onDragOver(cb)          // 拖文件悬停到本面板（松手即入册）→ cb(true|false)
 *   desk.screens()                     // 屏幕清单 Promise：[{mon,primary,w,h}]（发送到屏幕用）
 *   desk.panel.toScreen(mon)           // 在指定屏幕视口中心新建本插件面板（绑定同全局数据：
 *                                      //   宿主复制面板实例 kv——albumId 等指针随行，多屏分显同一实体）
 *   desk.spaces()                      // 工作区清单 Promise：[{id,name,current}]（发送到工作区用）
 *   desk.panel.toSpace(id)             // 在指定工作区新建本插件面板（同上，绑定指针随行——
 *                                      //   配合 storage.global 即跨工作区同显同一实体）
 *   desk.appearance.get()              // 读全局图标外观 → desk.on('appearance.info', m=>m.appearance)
 *   desk.appearance.set(k, v)          // 改图标外观（iconTextColor/iconTextShadow/iconBgColor），即时生效
 *   desk.instance                       // 当前面板实例 id
 *   desk.panel.setMenu(items)          // 自定义面板右键菜单项（action 回调在插件内执行）
 *   desk.panel.setContextMenu(false)   // 关闭系统右键菜单（插件完全自管右键）
 *   desk.panel.setCollapsed(true)      // 折叠/展开本面板（content 折叠形态的展开出口）
 *   desk.on('panel.state', cb)         // 折叠/固定状态变化（迟订阅自动补发最近一次）
 *   desk.ui.loading(el, on, color)     // 品牌加载指示（北辰三星呼吸，与宿主面板加载态/
 *                                      //   启动页同款节律）：el 内挂/撤覆盖层，on=false 撤除
 */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search);
  var instance = qs.get('instance') || '';
  var inWv2 = !!(window.chrome && window.chrome.webview);
  var inFrame = false;
  try { inFrame = window.parent !== window; } catch (e) { }

  function send(m) {
    m.__desk = true;
    m.instance = instance;
    // WebView2 的 WebMessageReceived 只收顶层文档消息：iframe 里 chrome.webview.postMessage
    // 会被静默丢弃（宿主 plugin_kv 全空实锤）。iframe 一律走 parent.postMessage，由画布页桥透传宿主。
    if (inWv2 && !inFrame) window.chrome.webview.postMessage(m);
    else parent.postMessage(m, '*');
  }

  var listeners = {};
  var pending = {};   // fetch 请求回调（reqId → resolve）
  var seq = 0;
  // 面板右键菜单状态：ctxEnabled=是否拦截右键上报系统菜单（manifest contextMenu:false
  // 由宿主经 URL ?ctx=0 静态关闭，避免插件脚本运行前的竞态窗口）；
  // menuCbs=setMenu 注册的 action 回调（id → fn）；lastPanelState=最近一次面板状态（迟订阅补发）
  var ctxEnabled = qs.get('ctx') !== '0';
  var menuCbs = {};
  var prevMenuCbs = {};   // 上一代菜单回调：点击回执（desk.menu.run）可能在 setMenu 换血后
                          // 才到达（画布点击项=先关菜单广播 menu.open off 再发回执，两条连发；
                          // off 会触发 pendMenu 补推换血）——差一代仍执行，执行即删防重
  var menuSeq = 0;        // 跨 setMenu 不归零：id 全局唯一，prevMenuCbs 回退才不会撞错 action
  var pendMenu = null;    // 菜单开着时的 setMenu 暂存（开着换血会让正显示菜单的点击回执落空）
  var lastPanelState = null;
  var snapshots = {};   // live 通道 → 快照生成函数（desk.live.snapshot 注册）
  function dispatch(e) {
    var m = e.data;
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'plugin.kv' && m.err === 'quota')
      console.warn('[desk] 插件存储已满（配额 5MB，实例+全局合计），本次写入被拒绝: ' + m.k);
    if (m.t === 'plugin.gkv' && m.err === 'quota')
      console.warn('[desk] 插件全局存储已满（配额 5MB，实例+全局合计），本次写入被拒绝: ' + m.k);
    // 画布回执：自定义菜单项被点击（action 在插件内执行）。先查当代表；查不到再查
    // 上一代（见 prevMenuCbs 注释——补推换血与回执到达的顺序不可控，回退一代兜底）
    if (m.t === 'desk.menu.run') {
      var fn = menuCbs[m.id] || prevMenuCbs[m.id];
      if (fn) { delete prevMenuCbs[m.id]; fn(); }
      return;
    }
    // 面板折叠/固定状态：缓存最近一次，desk.on('panel.state') 迟注册也能拿到当前态
    if (m.t === 'panel.state') lastPanelState = m;
    // fetch 应答走 Promise
    if (m.t === 'plugin.fetch.result' && m.reqId && pending[m.reqId]) {
      var cb = pending[m.reqId];
      delete pending[m.reqId];
      cb({ ok: m.ok, status: m.status, body: m.body });
      return;
    }
    // 媒体应答（pick/list；超时自清：宿主不在/消息丢失时 promise 不至于永挂）
    if ((m.t === 'plugin.media.pick.result' || m.t === 'plugin.media.list.result')
        && m.reqId && pending[m.reqId]) {
      var md = pending[m.reqId];
      delete pending[m.reqId];
      clearTimeout(md._timer);
      if (m.err) { md._reject(m.err); return; }
      md._resolve({
        files: Array.isArray(m.files) ? m.files : [],
        folder: m.folder || null,
        truncated: !!m.truncated,
      });
      return;
    }
    // EXIF 拍摄参数应答（超时自清）：resolve(exif 对象 | null)
    if (m.t === 'plugin.media.exif.result' && m.reqId && pending[m.reqId]) {
      var me = pending[m.reqId];
      delete pending[m.reqId];
      clearTimeout(me._timer);
      m.err ? me._reject(m.err) : me._resolve(m.exif && typeof m.exif === 'object' ? m.exif : null);
      return;
    }
    // 屏幕取色应答（超时自清：宿主不在/消息丢失时 promise 不至于永挂）
    if (m.t === 'plugin.eyedropper.result' && m.reqId && pending[m.reqId]) {
      var ed = pending[m.reqId];
      delete pending[m.reqId];
      clearTimeout(ed._timer);
      m.err ? ed._reject(m.err) : ed._resolve(m.hex);
      return;
    }
    // 屏幕清单应答（超时自清）
    if (m.t === 'plugin.screens.result' && m.reqId && pending[m.reqId]) {
      var sc = pending[m.reqId];
      delete pending[m.reqId];
      clearTimeout(sc._timer);
      m.err ? sc._reject(m.err) : sc._resolve(Array.isArray(m.screens) ? m.screens : []);
      return;
    }
    // 工作区清单应答（超时自清）
    if (m.t === 'plugin.spaces.result' && m.reqId && pending[m.reqId]) {
      var sp = pending[m.reqId];
      delete pending[m.reqId];
      clearTimeout(sp._timer);
      m.err ? sp._reject(m.err) : sp._resolve(Array.isArray(m.spaces) ? m.spaces : []);
      return;
    }
    // 画布菜单开/关状态：开→本 iframe 的下一次点击被吞掉（取消菜单专用，不给插件）。
    // 关闭时补推暂存的 setMenu（菜单开着期间的注册推迟到这里，见 setMenu 注释）
    if (m.t === 'menu.open') {
      menuOpen = !!m.on;
      swallowClick = false;
      if (!menuOpen && pendMenu) { var pm = pendMenu; pendMenu = null; window.desk.panel.setMenu(pm); }
      return;
    }
    // 回屏/重挂补快照（宿主离屏网关，2026-10-22）：宿主对离屏表面丢弃了本面板的直播增量，
    // 目标表面视口重新带上面板（或懒挂载完成）时发来此请求——逐通道调 snapshot 生成全量，
    // 按常规直播通路重发（此刻目标屏门控已开，必达）。未注册快照则忽略（manifest 未声明
    // liveSnapshot 的插件增量从未被丢，不会收到本消息——收到了也无害）。
    if (m.t === 'plugin.live.resync') {
      for (var ch in snapshots) {
        try {
          var d = snapshots[ch]();
          if (d !== undefined && d !== null) send({ t: 'plugin.live', ch: ch, d: d });
        } catch (err) { console.warn('[desk] live snapshot "' + ch + '" 生成失败: ' + err); }
      }
      return;
    }
    var arr = listeners[m.t];
    if (arr) for (var i = 0; i < arr.length; i++) arr[i](m);
  }
  // 应答通道必须与请求通道同侧：iframe 走 parent 桥，应答经 iframe window message 事件回来；
  // 若错挂 chrome.webview（WebMessageReceived 只收顶层文档），宿主回执永远收不到
  if (inWv2 && !inFrame) window.chrome.webview.addEventListener('message', dispatch);
  else window.addEventListener('message', dispatch);

  // 点击面板内容区时通知画布把面板置顶（iframe 内事件不跨 frame 冒泡，画布自身收不到）。
  // 必须强制走 parent.postMessage：同源 iframe 里 chrome.webview 也存在，若走 WebView2
  // 通道会直达宿主（宿主不处理置顶——那是页面 DOM 的事，消息会石沉大海）。
  // 菜单开着时的第一次点击=取消菜单，整只吞掉（不落插件手势——涂鸦不画点、文本不放光标），
  // 与画布页对自身点击的处理同语义；菜单开/关状态由画布推送（menu.open）
  var menuOpen = false, swallowClick = false;
  document.addEventListener('pointerdown', function (e) {
    if (menuOpen) {
      menuOpen = false;
      swallowClick = true;
      setTimeout(function () { swallowClick = false; }, 600);
      e.preventDefault();
      e.stopPropagation();
    }
    parent.postMessage({ __desk: true, t: '__frameActive', instance: instance }, '*');
  }, true);
  document.addEventListener('click', function (e) {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // 内容区右键上报（bubble 阶段）：画布按面板几何换算屏幕坐标弹"面板右键菜单"——
  // bare（无标题栏）面板没有控制按钮，右键菜单是用户关闭/折叠面板的兜底入口。
  // 插件想在局部自管右键（如文本编辑区）：在目标元素上 stopPropagation 即可跳过本拦截
  document.addEventListener('contextmenu', function (e) {
    if (!ctxEnabled) return;
    e.preventDefault();
    parent.postMessage({ __desk: true, t: '__panelMenu', instance: instance, x: e.clientX, y: e.clientY }, '*');
  }, false);

  // Esc 转发（bubble 阶段）：iframe 持焦点时画布键盘镜像被跳过，宿主页面的右键菜单
  // 收不到 Esc——这里转给画布收单。插件自己消费了 Esc 就 stopPropagation 拦下
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    parent.postMessage({ __desk: true, t: '__esc', instance: instance }, '*');
  }, false);

  window.desk = {
    version: '0.10.2',
    instance: instance,
    storage: {
      /** 读取（异步）。结果事件：desk.on('plugin.kv', m => m.k === 'key' && ...)，m.v 为 string|null */
      get: function (k) { send({ t: 'plugin.kv.get', k: k }); },
      /** 写入（string；对象请 JSON.stringify） */
      set: function (k, v) { send({ t: 'plugin.kv.set', k: k, v: String(v) }); },
      /** 插件级全局命名空间（同插件全部面板实例共享）：读取。
       *  结果事件：desk.on('plugin.gkv', m => m.k === 'key' && ...)，m.v 为 string|null。
       *  写入/删除成功后宿主向全部实例广播 plugin.kv.sync（k 冠 g: 前缀）——同插件各面板
       *  由此保持同一份数据（多相册/跨屏同显的内容基座）。配额与实例 kv 合计（5MB/插件）。 */
      global: {
        get: function (k) { send({ t: 'plugin.gkv.get', k: k }); },
        /** 写入（string）。同串跳过由插件侧比对实现（写入方收到回声=自家刚写的值） */
        set: function (k, v) { send({ t: 'plugin.gkv.set', k: k, v: String(v) }); },
        /** 删除（广播 plugin.kv.sync v=null） */
        del: function (k) { send({ t: 'plugin.gkv.del', k: k }); },
      },
    },
    /** 双屏内容直播（需宿主渲染级别=实时，设置▸工作区）：同一工作区显示在多台显示器时，
     *  把本面板的内容增量实时发到其他屏的同 id 面板。不落库——持久化仍走 storage.set 的
     *  kv 去抖；宿主排除源屏转发（无回声，增量类消息不会双加）。d 可为任意可结构化克隆的值。
     *  接收端：desk.live.on(ch, data => ...)。未接入的插件无感知（消息被静默丢弃）。 */
    live: {
      send: function (ch, d) { send({ t: 'plugin.live', ch: ch, d: d }); },
      on: function (ch, cb) {
        (listeners['plugin.live'] = listeners['plugin.live'] || []).push(function (m) {
          if (m && m.ch === ch) cb(m.d);
        });
      },
      /** 注册该通道的全量快照生成器（需 manifest "liveSnapshot": true 才会被宿主启用离屏
       *  增量门控）。fn 返回全量态（与增量同通道发送），接收端应把该消息实现为"整体替换"
       *  语义——快照可能重复到达，必须幂等。未注册快照的通道不参与 resync。 */
      snapshot: function (ch, fn) { snapshots[ch] = fn; },
    },
    /** 订阅宿主→插件事件（'plugin.kv' 'appearance.info' 'viewport' 'panel.state'…）。
     *  'panel.state' 迟注册自动补发最近一次（面板折叠/固定状态无初始事件问题） */
    on: function (t, cb) {
      (listeners[t] = listeners[t] || []).push(cb);
      if (t === 'panel.state' && lastPanelState) setTimeout(function () { cb(lastPanelState); }, 0);
    },
    /** 屏幕清单（只读系统信息，免权限声明）：resolve([{mon, primary, w, h}])。
     *  mon=屏幕序号（发给 toScreen 用）；primary=主屏。多屏分发（"发送到屏幕 N"）数据源。 */
    screens: function () {
      return new Promise(function (resolve, reject) {
        var id = 's' + (++seq);
        pending[id] = { _resolve: resolve, _reject: reject };
        pending[id]._timer = setTimeout(function () {
          if (pending[id]) { delete pending[id]; reject('timeout'); }
        }, 5000);
        send({ t: 'plugin.screens', reqId: id });
      });
    },
    /** 工作区清单（v0.9.1，只读系统信息，免权限声明）：resolve([{id, name, current}])。
     *  current=本面板当前所在工作区。id 传给 panel.toSpace（跨工作区分发同一实体）。 */
    spaces: function () {
      return new Promise(function (resolve, reject) {
        var id = 'w' + (++seq);
        pending[id] = { _resolve: resolve, _reject: reject };
        pending[id]._timer = setTimeout(function () {
          if (pending[id]) { delete pending[id]; reject('timeout'); }
        }, 5000);
        send({ t: 'plugin.spaces', reqId: id });
      });
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
    /** 屏幕取色（宿主全屏取色窗体，多屏通吃；浏览器 EyeDropper 在桌面层 WebView2 里弹不出 overlay）。
     *  resolve('#rrggbb')；取消/超时 reject('cancel'|'timeout') */
    eyedropper: function () {
      return new Promise(function (resolve, reject) {
        var id = 'e' + (++seq);
        pending[id] = { _resolve: resolve, _reject: reject };
        pending[id]._timer = setTimeout(function () {
          if (pending[id]) { delete pending[id]; reject('timeout'); }
        }, 60000);
        send({ t: 'plugin.eyedropper', reqId: id });
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
    /** 本地媒体（需声明 media 权限）：选择/枚举本地图片与视频。引用原路径展示，
     *  不复制文件。授权即范围——只有用户亲自 pick（原生对话框）或亲手拖入面板的
     *  文件所在文件夹才被授权（宿主白名单），插件凭空给路径拿不到任何东西。
     *  条目 {path,name,kind:'img'|'video',size,mtime,url}：url 是宿主虚拟域地址，
     *  <img>/<video> 直接引用（沙箱 iframe 子资源加载不受同源限制；支持 Range 流式
     *  播放大视频）；同一授权跨重启 url 稳定，可入 kv 持久化。
     *  相册化（v0.9）：授权归属面板绑定的相册（实例 kv albumId）——同相册多面板共享
     *  授权与 url。 */
    media: {
      /** 选择文件/文件夹。opts={folder:true 选文件夹, multiple:true 多选}。
       *  resolve({files:[条目], folder:{path}|null, truncated})；用户取消 reject('cancel') */
      pick: function (opts) {
        opts = opts || {};
        return new Promise(function (resolve, reject) {
          var id = 'm' + (++seq);
          pending[id] = { _resolve: resolve, _reject: reject };
          pending[id]._timer = setTimeout(function () {
            if (pending[id]) { delete pending[id]; reject('timeout'); }
          }, 600000);   // 10 分钟：原生对话框可以开很久
          send({ t: 'plugin.media.pick', reqId: id, folder: !!opts.folder, multiple: !!opts.multiple });
        });
      },
      /** 刷新已授权文件夹的快照（P0 快照语义的"手动刷新"）。
       *  resolve({files:[条目], truncated})；未授权/文件夹不在 reject('scope') */
      list: function (path) {
        return new Promise(function (resolve, reject) {
          var id = 'm' + (++seq);
          pending[id] = { _resolve: resolve, _reject: reject };
          pending[id]._timer = setTimeout(function () {
            if (pending[id]) { delete pending[id]; reject('timeout'); }
          }, 30000);
          send({ t: 'plugin.media.list', reqId: id, path: String(path) });
        });
      },
      /** 读一张授权图片的拍摄参数（EXIF 主标签）。resolve({date?,model?,f?,exp?,
       *  iso?,focal?,lens?,dim})；无标签/读失败 resolve(null)；未授权 reject('scope') */
      exif: function (path) {
        return new Promise(function (resolve, reject) {
          var id = 'm' + (++seq);
          pending[id] = { _resolve: resolve, _reject: reject };
          pending[id]._timer = setTimeout(function () {
            if (pending[id]) { delete pending[id]; reject('timeout'); }
          }, 10000);
          send({ t: 'plugin.media.exif', reqId: id, path: String(path) });
        });
      },
      /** OS 拖入面板的文件（manifest 声明 "acceptDrop":["image/*","video/*"] 后，
       *  宿主把落到面板上的文件引用原路径路由进来）。cb(files:[条目]) */
      onDrop: function (cb) {
        (listeners['plugin.drop'] = listeners['plugin.drop'] || []).push(function (m) {
          if (m && Array.isArray(m.files)) cb(m.files);
        });
      },
      /** 授权文件夹内容变化推送（宿主 FileSystemWatcher 实时跟随，去抖 ~1s）：
       *  文件夹里媒体文件增删/改名/修改稳定后触发 cb(folderPath)——插件应重新
       *  desk.media.list(folder) 收敛快照。文件夹被删也会触发一次（快照应清空该源）。 */
      onChanged: function (cb) {
        (listeners['plugin.media.changed'] = listeners['plugin.media.changed'] || []).push(function (m) {
          if (m && typeof m.folder === 'string') cb(m.folder);
        });
      },
      /** 拖入悬停反馈：拖文件悬停在本面板上（松手会被接住入册）时 cb(true)，移开/松手后
       *  cb(false)。OS 拖动期间 iframe 收不到 dragover（宿主 OLE 接管）——由宿主计算
       *  命中并推送。插件据此高亮，消除"松手才知道接不接"的盲拖。 */
      onDragOver: function (cb) {
        (listeners['plugin.dragover'] = listeners['plugin.dragover'] || []).push(function (m) {
          if (m && typeof m.on === 'boolean') cb(m.on);
        });
      },
    },
    /** 设置画布壁纸（需声明 wallpaper 权限；dataUrl 图片）*/
    wallpaper: {
      set: function (dataUrl) { send({ t: 'plugin.wallpaper.set', data: String(dataUrl).split(',')[1] || '' }); },
    },
    /** 全局图标外观（需声明 appearance 权限）。改动即时广播生效，设置页同源。 */
    appearance: {
      /** 异步读取 → desk.on('appearance.info', m => m.appearance)：{iconTextColor:'#rrggbb', iconTextShadow:'0'~'100', iconBgColor:'#rrggbb'|''} */
      get: function () { send({ t: 'plugin.appearance.get' }); },
      /** 修改：key='iconTextColor'|'iconTextShadow'|'iconBgColor'（空串=关闭背景色块） */
      set: function (key, value) { send({ t: 'plugin.appearance.set', key: key, value: String(value) }); },
    },
    /** 系统字体（v0.5）：宿主枚举本机已安装字体族。list() 异步读取，结果经
     *  desk.on('plugin.fonts', m => m.fonts) 送达：string[]（本地化族名，宿主已排序）。
     *  只读系统信息，无需权限声明。 */
    fonts: {
      list: function () { send({ t: 'plugin.fonts.get' }); },
    },
    /** 画布涂层绘画（需声明 canvas 权限）：世界坐标指令，随画布缩放。
     * cmds: [{op:'path',pts:[[x,y]..],stroke,w} | {op:'text',x,y,text,size,fill} | {op:'image',dataUrl,x,y,w,h}]
     * 每次 draw 追加；clear 清空本面板涂层。 */
    canvas: {
      clear: function () { parent.postMessage({ __desk: true, t: 'plugin.canvas.clear', instance: instance }, '*'); },
      draw: function (cmds) { parent.postMessage({ __desk: true, t: 'plugin.canvas.draw', instance: instance, cmds: cmds }, '*'); },
    },
    /** bare 面板（无标题栏）声明拖动把手：该元素上的拖拽 = 移动整个面板。
     *  上报位移（cx/cy）= 本条事件的位移增量，单位=面板世界单位，轴向=屏幕轴向
     *  （画布侧帧内求和后直接平移，旋转面板也正确——平移与旋转正交）。
     *  位移源 = screenX/screenY 增量 ÷ 实时联测的单位比 r。两点缺一不可：
     *  ① screenX 是稳定外部系（面板移动不改变它）——client 系随面板一起动，反馈
     *    经渲染管线（深度 ≥2-3 帧）回授时任何消费方式都振荡（逐条应用=帧内批处理
     *    过冲回拉；每帧应用最新=管线深度 ≥3 时发散，真机 2026-10-20 两轮视频实录
     *    "拖动来回抖动"）。稳定系下逐条增量永不重复计入，帧内求和=精确。
     *  ② screenX 的"物理→DIP"换算所用 DPI 在 WebView2 多屏下与该屏渲染 DPI 不一致
     *    （副屏单位错），不能裸用——r=|Δscreen|/|Δclient| 在悬停期联测（面板静止
     *    时 client 无反馈污染，鼠标扫过把手的动作就是标定数据；滚动窗口 30px 保持
     *    新鲜，换屏/缩放后自然重标）。拖动启动时用"按下→阈值"两点粗校验，与联测值
     *    偏差 >30% 则以粗测为准（防悬停后改缩放的陈旧 r）。
     *  合成事件注意：dispatchEvent 造的事件须显式携带 screenX/screenY（受信输入
     *  ——真实鼠标与 CDP/Playwright 输入路径——浏览器自动填写；缺省恒 0 会让拖动
     *  无位移，自测脚本必须带上）。
     *  生命周期（便签自实现的真机实证，2026-10-18）：move/up 挂 window——把手
     *  元素级监听在指针滑出把手后收不到 move（拖动冻结）、up 落在元素外收不到 up
     *  （监听器残留 → 之后鼠标掠过把手就"无按键幽灵拖动"，真机 2026-10-20 涂鸦
     *  边框按下复现）。window 级 + buttons 无左键即自终 + 新按压无条件重置，三重
     *  防泄漏。收尾只认 pointerup/pointercancel——blur 与 lostpointercapture 不能
     *  当结束信号（拖动一开始宿主注入键盘焦点、iframe window 即 blur，当结束会
     *  当场杀死拖动）。
     *  捕获必须等位移超过 4px 阈值再上：pointerdown 即 setPointerCapture 会把后续
     *  click 重定向到把手，把手内的按钮（工具切换/撤销等）全部点不动（真机
     *  2026-10-17"能拖不能点"）。阈值内松手 = 原生 click 照常冒泡到按钮。 */
    setDraggable: function (el) {
      if (!el) return;
      var rVal = 0, accS = 0, accC = 0, hPrev = null;   // r 联测（悬停期滚动窗口）
      var calib = function (ev) {   // 面板静止期的 move 才喂（悬停/阈值前），拖动中禁用
        if (hPrev) {
          var ds = Math.hypot(ev.screenX - hPrev[0], ev.screenY - hPrev[1]);
          var dc = Math.hypot(ev.clientX - hPrev[2], ev.clientY - hPrev[3]);
          if (dc > 0.5 && ds > 0.5) { accS += ds; accC += dc; }
          if (accC > 30 && accS > 30) { rVal = accS / accC; accS = 0; accC = 0; }
        }
        hPrev = [ev.screenX, ev.screenY, ev.clientX, ev.clientY];
      };
      var dAct = null;   // { sx0, sy0, cx0, cy0, px, py, started }（px/py=上次已上报点）
      // 拖动结束上报（v0.10.1）：松手/自终即通知画布收尾——阈值后才算真拖动过（点击不发）
      var dEnd2 = function () {
        if (dAct && dAct.started)
          parent.postMessage({ __desk: true, t: 'plugin.drag', instance: instance, end: 1 }, '*');
        dAct = null;
      };
      el.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        dAct = { sx0: e.screenX, sy0: e.screenY, cx0: e.clientX, cy0: e.clientY,
                 px: e.screenX, py: e.screenY, started: false };
      });
      window.addEventListener('pointermove', function (ev) {
        if (!dAct) { calib(ev); return; }
        if (!(ev.buttons & 1)) { dEnd2(); calib(ev); return; }   // 无左键却在动=幽灵态，自终（顺带校准）
        var dsx = ev.screenX - dAct.sx0, dsy = ev.screenY - dAct.sy0;
        if (!dAct.started) {
          if (Math.abs(dsx) < 4 && Math.abs(dsy) < 4) { calib(ev); return; }   // 阈值内=点击（面板未动，继续联测）
          dAct.started = true;
          var dcs = Math.hypot(ev.clientX - dAct.cx0, ev.clientY - dAct.cy0);
          var rs = dcs > 1 ? Math.hypot(dsx, dsy) / dcs : 0;   // 按下→阈值两点粗测（~4px 基线，仅作校验）
          if (!rVal || (rs > 0 && Math.abs(rs / rVal - 1) > 0.3)) rVal = rs || 1;
          try { el.setPointerCapture(ev.pointerId); } catch (err) { /* 合成事件无活动指针：窗口级派发仍可拖 */ }
          if (ev.cancelable) ev.preventDefault();
        }
        // 稳定系：screen 增量 ÷ r = 世界单位增量（屏幕轴向；旋转面板由画布侧直接平移，无需换轴）
        parent.postMessage({ __desk: true, t: 'plugin.drag', instance: instance,
          cx: (ev.screenX - dAct.px) / rVal, cy: (ev.screenY - dAct.py) / rVal }, '*');
        dAct.px = ev.screenX; dAct.py = ev.screenY;
      });
      window.addEventListener('pointerup', dEnd2);
      window.addEventListener('pointercancel', dEnd2);
    },
    /** 面板控制（v0.4）：右键菜单自定义 + 折叠/展开。
     *  面板右键菜单 = 插件自定义项（setMenu，在前）+ 系统通用项（折叠/固定屏幕/关闭，在后）。
     *  bare 面板没有标题栏按钮，这里既是扩展点也是用户关闭面板的兜底入口。 */
    panel: {
      /** 注册自定义右键菜单项（全量替换；传 [] 清空）。
       *  items: [{label, accel?, danger?, disabled?, check?, sub?: [...], action: fn} | {sep: true}]
       *  点击时画布回执 desk.menu.run，action 在插件 iframe 内执行 */
      setMenu: function (items) {
        // 菜单开着时不换血：正显示菜单的项点击回执带旧 id，此刻换表会落空（点了没
        // 反应）。暂存，菜单关闭（menu.open off）时补推；off 后紧跟到达的回执由
        // prevMenuCbs 一代回退兜底
        if (menuOpen) { pendMenu = items; return; }
        prevMenuCbs = menuCbs; menuCbs = {};
        var norm = function (list) {
          var out = [];
          (list || []).forEach(function (it) {
            if (!it || it.sep) { out.push({ sep: true }); return; }
            var def = {
              id: 'm' + (++menuSeq),
              label: String(it.label || '').slice(0, 64),
              danger: !!it.danger, disabled: !!it.disabled, check: !!it.check,
            };
            if (it.accel) def.accel = String(it.accel).slice(0, 20);
            if (typeof it.action === 'function') menuCbs[def.id] = it.action;
            if (it.sub) def.sub = norm(it.sub);
            out.push(def);
          });
          return out;
        };
        parent.postMessage({ __desk: true, t: 'panel.menu.items', instance: instance, items: norm(items) }, '*');
      },
      /** 运行时开关系统右键菜单（含 iframe 内容区拦截与标题栏区）。false=右键完全交给插件。
       *  静态关闭用 manifest "contextMenu": false（无脚本运行前即生效）。 */
      setContextMenu: function (on) {
        ctxEnabled = !!on;
        parent.postMessage({ __desk: true, t: 'panel.menu.enabled', instance: instance, on: ctxEnabled }, '*');
      },
      /** 折叠/展开本面板。content 折叠形态（manifest collapseStyle）的插件在自绘迷你态里
       *  调 setCollapsed(false) 展开；状态变化经 desk.on('panel.state') 广播 */
      setCollapsed: function (on) {
        parent.postMessage({ __desk: true, t: 'panel.collapse.req', instance: instance, collapsed: !!on }, '*');
      },
      /** 把本插件再放一块面板到指定屏幕（mon 来自 desk.screens()）：新面板建在目标屏
       *  视口中心（不自动固定屏幕），实例 kv 全量复制（albumId 等绑定指针随行）——
       *  配合 storage.global 即"多屏分显同一实体"。仅在真面板（页面内 iframe）可用。 */
      toScreen: function (mon) {
        send({ t: 'plugin.panel.toscreen', mon: String(mon) });
      },
      /** 把本插件再放一块面板到指定工作区（id 来自 desk.spaces()）：新面板建在该工作区
       *  视口中心，实例 kv 全量复制（绑定指针随行）——跨工作区同显同一实体。
       *  仅在真面板（页面内 iframe）可用。 */
      toSpace: function (id) {
        send({ t: 'plugin.panel.tospace', space: Number(id) | 0 });
      },
      /** 申请面板高度（px，80~4096；宽/位置不动）。如 bare 面板收起工具栏时
       *  把底部区域还给桌面——隐藏的 DOM 挡不住桌面，但 iframe 视口（宿主管的面板高度）
       *  不收缩就仍占着桌面。异步生效（经画布改面板布局并落库）。 */
      setHeight: function (h) {
        parent.postMessage({ __desk: true, t: 'panel.height.req', instance: instance, h: Number(h) || 0 }, '*');
      },
    },
    /** 品牌 UI（v0.10，纯本地 DOM——不与宿主通信） */
    ui: {
      /** 北辰三星呼吸加载指示（与宿主面板加载态/启动页同款：三颗四芒星错相呼吸，
       *  2.4s 周期、升 .96s/衰 1.44s、0.7s 错相）。在容器 el 内挂绝对定位覆盖层（居中、
       *  pointer-events:none 不挡交互）；el 为 static 定位时自动转 relative。
       *  desk.ui.loading(el) 显示（幂等不叠加）；desk.ui.loading(el, false) 撤除；
       *  color=CSS 颜色（默认北辰蓝 #6EA8FF）。返回覆盖层元素（撤除时 null）。
       *  样式经 <style data-desk-ui> 注入一次；prefers-reduced-motion 时静止半亮。 */
      loading: function (el, on, color) {
        if (!el || !el.appendChild) return null;
        if (on === false) {
          if (el.__deskLoading) { el.__deskLoading.remove(); el.__deskLoading = null; }
          return null;
        }
        if (el.__deskLoading && el.__deskLoading.isConnected) return el.__deskLoading;
        if (!document.querySelector('style[data-desk-ui]')) {
          var st = document.createElement('style');
          st.setAttribute('data-desk-ui', '');
          st.textContent = ''
            + '.desk-loading{position:absolute;inset:0;display:flex;align-items:center;'
            + 'justify-content:center;pointer-events:none;z-index:9}'
            + '.desk-loading svg{width:32px;height:32px;display:block}'
            + '.desk-loading path{fill:var(--desk-loading-color,#6EA8FF);opacity:.3;'
            + 'transform-box:fill-box;transform-origin:50% 50%;'
            + 'animation:desk-loading-star 2.4s ease-in-out infinite backwards}'
            + '.desk-loading path:nth-of-type(2){animation-delay:.7s}'
            + '.desk-loading path:nth-of-type(3){animation-delay:1.4s}'
            + '@keyframes desk-loading-star{0%,100%{opacity:.3;transform:scale(.86)}'
            + '40%{opacity:1;transform:scale(1.12)}}'
            + '@media (prefers-reduced-motion:reduce){.desk-loading path{animation:none;opacity:.6}}';
          (document.head || document.documentElement).appendChild(st);
        }
        var cs = getComputedStyle(el);
        if (cs.position === 'static') el.style.position = 'relative';
        var ov = document.createElement('div');
        ov.className = 'desk-loading';
        if (color) ov.style.setProperty('--desk-loading-color', color);
        ov.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true">'
          + '<path d="M10.5 3 12.2 8.8 18 10.5 12.2 12.2 10.5 18 8.8 12.2 3 10.5 8.8 8.8Z"/>'
          + '<path d="M24 3.8 24.9 6.9 28 7.8 24.9 8.7 24 11.8 23.1 8.7 20 7.8 23.1 6.9Z"/>'
          + '<path d="M14.2 18.5 15.5 22.7 19.7 24 15.5 25.3 14.2 29.5 12.9 25.3 8.7 24 12.9 22.7Z"/>'
          + '</svg>';
        el.appendChild(ov);
        el.__deskLoading = ov;
        return ov;
      },
    },
    /** 导出图片：保存到 图片\Lodestar（dataUrl = canvas.toDataURL() 等；同名自动加序号） */
    saveImage: function (name, dataUrl) {
      var b64 = String(dataUrl).split(',')[1] || '';
      send({ t: 'plugin.savefile', name: name, data: b64 });
    },
  };
})();
