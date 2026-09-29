# 维护说明

## 这是什么

一个入口：点侧边栏「DeepSeek 网页」，官方 chat.deepseek.com 就渲染在 **DSH 窗口内的中栏**里，和「自动化任务」那类整页视图一样。不重新实现聊天界面，不做会话存储，不做 agent 工具。

## 页面为什么能在窗口内显示

两条常规路径确实是死的：`chat.deepseek.com` 返回 `frame-ancestors 'none'`（iframe 被拒），桌面端也默认关闭 `<webview>` 标签并拦截 `will-attach-webview`。

**但桌面端给"受信任的浏览器访客"留了通道**（DSH 自带的侧栏浏览器用的是同一套）：

- 渲染进程调用 `globalThis.dshDesktop.browser.acquire(identity)`（IPC `dsh-desktop:browser-acquire`），宿主在 `DesktopBrowserGuests` 里为该 identity 分配一个**进程内**分区并返回 `{ lease, partition }`；
- 渲染进程创建 `<webview>`，`src="about:blank#<lease>"`、`partition=<partition>`、`name=<lease>`，挂进 DOM；
- 宿主在 `will-attach-webview` 里只放行这一个元素（lease 属于当前窗口、partition 匹配、且未被占用过），并替它写死一组安全 webPreferences（`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、`webviewTag: false` …），其余一律 `preventDefault()`；
- 附加成功后宿主经 `did-attach-webview` 接管输入，客户端再导航。

这是宿主的**原生访客**，不是 iframe，所以 `frame-ancestors` 约束不到它；也因此它只能存在于桌面端。宿主没有给插件提供别的"显示网页"公开 API，本插件用的是与内置浏览器相同的那条 IPC 通道，所以**升级 DSH 时要重新核对 `DesktopBrowserGuests` 的约定**（`lib/preload-app.cjs`、`lib/main.js`）。

### 访客不暴露 Electron

`chat.deepseek.com` 的前端会检查 `navigator.userAgent` 里是否含 `electron`，命中就弹「使用环境异常」，而"不再提示"记在访客分区的存储里——分区是进程内的，所以每次重启都会再弹。因此访客改用普通 Chrome UA（Chrome 大版本取自本渲染进程自己的 UA，保持真实）：既写在 `<webview useragent>` 属性上，也在 `dom-ready` 后、首次导航前用 `setUserAgent()` 再落一次（因为宿主会重写 guest 的 preferences）。

## 槽位契约

导航行与页面**都是 shell 的槽位**，插件只提供内容：

```js
ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
  name: "sidebar.panellist", id: "webchat", order: -1, label: () => copy().label,
}, WebchatIcon))                       // 只画图标
ctx.slots.inject("main", () => ctx.slots.register({
  name: "main", key: "webchat",
}, WebchatPanel))                      // 页面本体
```

- `sidebar.panellist`（list、root scope）：`id` 必填，`order`/`label` 可选。**侧边栏拥有按钮**，并按同一个 id 去 `main` 里找要显示的页面；图标组件由 owner 以 `{ size, active }` 调用。`label` 用 thunk（每次投影重读，所以跟着语言走）。
- `main`（keyed、root scope）：`key` 必填，注册同 key 会替换占位者；`conversation` 是保留 key。layout 只渲染**当前选中的 key**，所以切换面板是 shell 的事——本插件不需要隐藏别人的页面，也不需要"该让位了"的判断。
- 两个槽位分别由 `@deepseek-ai/dsh-client-ui-sidebar` 与 `@deepseek-ai/dsh-client-ui-layout` 声明，`package.json` 的 `dsh.client.inject` 里列了这两个包，用途只是**排定激活顺序**。
- 组件还会收到一批 standard props（`usePanelInfo` 等）；本插件不需要它们——是否"当前选中"由"组件是否被挂载"表达。

槽位契约的权威来源是客户端 runner 自带的槽位目录（`@deepseek-ai/dsh-cordis-client-runner`：包含每个槽位的 `registerOptions`、`ownerProps`、`standardProps`），改代码前照它核对，不要靠猜。

## 为什么访客常驻 DOM，而不是住在页面组件里

`<webview>` 一旦脱离文档就会被销毁，重新挂载等于重新加载。而 layout 只渲染当前选中的 `main` key——**切到别的面板时本页面组件会卸载**。若把访客交给组件，用户每看一眼「插件」再切回来，页面就重载一次。

所以：访客元素由本插件持有，挂在文档根上一个 `[data-dsh-webchat-overlay]` 容器里（`position: fixed`），生命周期是**整次运行**。页面组件只做两件事——拿到 shell 分配给它的格子并量出矩形（`getBoundingClientRect`），把常驻访客摆上去；卸载时**只隐藏、不摘除**：

```js
guest.container.style.display = alive ? "block" : "none"
```

矩形在 `ResizeObserver`（监听自己那个格子）与 `window resize` 时同步。面板的位置完全来自 slot 给它的空间，不去读别人的 DOM 或样式。插件被卸载时（`ctx.effect` 的清理）才移除容器并 `release(lease)`。

## 登录态为什么由插件自己保存

宿主给访客的分区是 `dsh-sidebar-browser-${randomUUID()}`：**不带 `persist:` 前缀**（Electron 里即内存分区），而且**每次运行都是新名字**。所以 cookie 与站点存储随进程一起消失——DSH 自带的侧栏浏览器也一样。插件无法申请别的分区：主进程在 `will-attach-webview` 里硬校验 `params.partition !== lease.partition → preventDefault()`。

于是本插件自己接管这件事，用**两条彼此独立的通道**：

1. **站点存储 + 页面自己的 cookie**，由浏览器半区通用搬运：`<webview>.executeJavaScript` 读写 localStorage（不依赖任何具体键名）与 `document.cookie`。**这条通道不依赖 Electron**，是底线。
2. **分区 cookie（含 HttpOnly）**，由宿主半区搬运：它跑在 **Electron 主进程**里才能 `session.fromPartition(partition).cookies`——渲染进程永远读不到 HttpOnly。

**教训（真实踩过，别再犯）**：最初 `POST /session/save` 在写文件之前先取 Electron session，拿不到就整个请求失败——于是**快照文件从来没被写出来**，连本来能独立工作的 localStorage 通道也被一起拖死了。现在的规矩是：**Electron 只是增强，不是前提**。取不到就记下原因（返回体里的 `error`），照常写快照。

关于 Electron 可达性：`import('electron')` 在本加载器下会解析出一个**没有具名导出**的命名空间（真实 API 在 `default` 上），而 `createRequire(...)('electron')` 会被拦成 `Cannot find module`。所以 `electronApi()` 会**同时接受 `mod` 与 `mod.default`** 两种形状，并把两条探测的失败原因拼起来回报。

时序（顺序是有原因的，别随意调整）：

- **回灌 cookie 必须在首次导航之前**：拿到租约 → `POST /session/restore`（宿主把快照里的 cookie 写进本次的分区）→ 才 `loadURL`。这样页面的第一个请求就带着登录态。
- **回灌存储与页面 cookie 只能在页面已在自身 origin 之后**：`dom-ready` → 导航 → `did-finish-load` 之后一次性写入，然后 `reload()` 一次；第二次 `did-finish-load` 不再刷新。写 cookie 时统一补 `; path=/`（`document.cookie` 读回来的串不带属性）。
- **恢复期间禁止快照**：刚加载完的页面存储是空的，此时保存会把正在恢复的那份快照清空。所以用 `storageState`（`pending` → `restoring` → `done`）挡住保存，直到恢复落定。
- **快照时机**：每次 `did-finish-load`、每 30 秒、窗口 `beforeunload`（`sendBeacon`，只带 partition，不带 storage/cookie）、以及插件 dispose 前最后一刻。

路由语义：

| 路由 | 语义 |
| --- | --- |
| `POST /session/restore` `{ partition }` | 校验 partition 形状（不符 → 400）→ 读快照 → 尝试把 cookie 写进该分区 → 返回 `{ ok, error, cookies, storage, cookie, savedAt }`。**没有快照也是 200**（`storage: null`）；**拿不到 Electron 只让 `ok:false` + `error`，storage/cookie 照常返回**——页面必须照常加载 |
| `POST /session/save` `{ partition, storage?, cookie? }` | 读该分区 cookie（能拿就拿）+ 传进来的 storage/cookie，原子写到快照，**永远返回 200**（`error` 里说明 cookie 为什么没拿到）。**不带 `storage`/`cookie` 时保留上一次的**——卸载时的 beacon 走的正是这条路 |

安全边界（都要保持）：

- partition 必须匹配 `/^dsh-sidebar-browser-[0-9a-f-]{8,}$/`，插件绝不触碰别的 session；
- 快照只写在 `~/.dsh/dsh-webchat/session.json`，以 `0o600` 先写临时文件再 `rename`（崩溃不会截断）；
- 内容是**明文凭据**：`GET /state` 只报**数量**，绝不回显 cookie 值——那个端点没有鉴权。

两个测试缝只在测试里使用：`setSessionFile(path)` 与 `setElectronLoader(fn)`（生产路径不设置，走真实实现）。

## 目录与"无构建"政策

**没有构建步骤。** React 取自浏览器的模块表（`factory(require)` 里的 `require('react')`），其余是手写 DOM，因此本包**零运行时依赖**。

```
lib/index.js       宿主半区 —— 四条路由（诊断 / 窗口降级 / 登录态回灌与快照）+ 窗口降级策略
lib/client.js      浏览器半区 —— 两个槽位注册 + 常驻访客 + 登录态搬运
cordis.patch.yml   profile 行
test/*.test.mjs    node --test
```

## 宿主半区

`inject: ['webServer']`，四条 exact 路由：`GET /api/dsh-webchat/state`（诊断：`{ ok, url, appWindowOpen, last, attempts, session }`）、`POST /api/dsh-webchat/open`（窗口降级）、`POST /api/dsh-webchat/session/restore` 与 `POST /api/dsh-webchat/session/save`（登录态，语义见上）。

`openPage(strategies)` 依次走 `OPEN_STRATEGIES` 并记录**整条链路**（`attempts`），所以一次点击就能看出每条策略为什么失败。策略：`app-window`（先 `await import('electron')`，失败再 `createRequire(...)('electron')`，然后 `new BrowserWindow`）、`app-window-shell`（`msedge.exe`/`chrome.exe` + `--app=`）、`system-browser`。`electronApi()` 只要拿到 `BrowserWindow` **或** `session` 就算可用，两条调用方各取所需。

窗口句柄挂在 `globalThis[Symbol.for('@jaychang1989/dsh-webchat.window')]`：否则一次热重载会交给新模块一个 `null`，把已开的窗口变成孤儿。dispose 时**不关窗口**。

桌面端正常路径走不到这三条——客户端有访客桥接，直接在中栏渲染；它们只服务于纯 `dsh web` 环境，也就是面板里那个「在窗口中打开」按钮。

## 测试

```bash
node --test
```

34 个用例。宿主半区用假 context、假 request/response 与**可注入的 Electron/cookie 替身**驱动：快照落盘往返、cookie 捕获与回灌（含 HttpOnly、拒绝一个不合法 cookie 不影响其余、缺 name/domain 的条目跳过）、两条会话路由的方法守卫与分区校验、"没有快照"是成功而非失败、拿不到 Electron 时如实报错且不影响页面。浏览器半区用一层薄的 React 测试替身（`createElement`/`useRef`/`useEffect`）+ DOM 桩**真实执行**：槽位注册契约（同一个 id、order、label thunk、按 `size` 出图标）、租约与 webview 属性、`dom-ready` 时先改 UA 再导航且顺序正确、**卸载只隐藏不摘除、重挂复用同一访客、只申请一次租约**、会话恢复只写一次存储并只刷新一次（且恢复期间不快照）、使用中/卸载前的快照与定时器清理，以及无桥接时的降级与失败提示。

## 无法从 app 外部验证的部分

- **宿主是否真的批准访客**只能在运行中的桌面端验证：测试能证明插件按约定构造了 webview，但 `will-attach-webview` 的放行发生在主进程。
- **槽位注册是否被接受**（例如 order 的落点、图标尺寸）同样要看真实渲染结果；测试只覆盖插件这一侧的参数。
- **宿主半区能否真的拿到 Electron**（决定登录态能否保存）也只能在真实进程里验证：`GET /api/dsh-webchat/state` 的 `session.electron` 就是它的自检结果；测试用的是注入替身。
- 登录态能否真正恢复，最终取决于 DeepSeek 把会话放在哪里：cookie（本插件能完整搬运，含 HttpOnly）与 localStorage（通用搬运）。若它改用其它存储，需要重新登录一次。
- 页面是否还会弹「使用环境异常」，取决于站点的检查逻辑，同样以真实页面为准。

## 来源

本包最初由 `xmuwenxiang/dsh-web-chat` 分叉而来。至今沿用的部分是插件骨架（双半区打包、`cordis.patch.yml` 行、客户端 bundle 形式）与最早的侧边栏入口注入思路；现在插件所做的全部事情——槽位注册、常驻访客面板、窗口降级链、UA 处理——都是在这里写的。Apache-2.0 要求的署名见 `NOTICE`。
