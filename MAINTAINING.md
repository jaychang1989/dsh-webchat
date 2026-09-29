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

## 目录与"无构建"政策

**没有构建步骤。** React 取自浏览器的模块表（`factory(require)` 里的 `require('react')`），其余是手写 DOM，因此本包**零运行时依赖**。

```
lib/index.js       宿主半区 —— 两条路由 + 窗口降级策略（纯 web 环境才用得上）
lib/client.js      浏览器半区 —— 两个槽位注册 + 常驻访客
cordis.patch.yml   profile 行
test/*.test.mjs    node --test
```

## 宿主半区

`inject: ['webServer']`，两条 exact 路由：`GET /api/dsh-webchat/state`（诊断：`{ ok, url, appWindowOpen, last, attempts }`）与 `POST /api/dsh-webchat/open`（`{ ok, via, error, at }`，都没打开时 502）。

`openPage(strategies)` 依次走 `OPEN_STRATEGIES` 并记录**整条链路**（`attempts`），所以一次点击就能看出每条策略为什么失败。策略：`app-window`（先 `await import('electron')`，失败再 `createRequire(...)('electron')`，然后 `new BrowserWindow`）、`app-window-shell`（`msedge.exe`/`chrome.exe` + `--app=`）、`system-browser`。

窗口句柄挂在 `globalThis[Symbol.for('@jaychang1989/dsh-webchat.window')]`：否则一次热重载会交给新模块一个 `null`，把已开的窗口变成孤儿。dispose 时**不关窗口**。

桌面端正常路径走不到这三条——客户端有访客桥接，直接在中栏渲染；它们只服务于纯 `dsh web` 环境，也就是面板里那个「在窗口中打开」按钮。

## 测试

```bash
node --test
```

19 个用例。宿主半区用假 context 与假 request/response 驱动（路由、方法守卫、策略选择与失败链路）；浏览器半区用一层薄的 React 测试替身（`createElement`/`useRef`/`useEffect`）+ DOM 桩**真实执行**：槽位注册契约（同一个 id、order、label thunk、按 `size` 出图标）、租约与 webview 属性、`dom-ready` 时先改 UA 再导航且顺序正确、**卸载只隐藏不摘除、重挂复用同一访客、只申请一次租约**、插件卸载释放租约，以及无桥接时的降级与失败提示。

## 无法从 app 外部验证的部分

- **宿主是否真的批准访客**只能在运行中的桌面端验证：测试能证明插件按约定构造了 webview，但 `will-attach-webview` 的放行发生在主进程。
- **槽位注册是否被接受**（例如 order 的落点、图标尺寸）同样要看真实渲染结果；测试只覆盖插件这一侧的参数。
- 页面是否还会弹「使用环境异常」，取决于站点的检查逻辑，同样以真实页面为准。

## 来源

本包最初由 `xmuwenxiang/dsh-web-chat` 分叉而来。至今沿用的部分是插件骨架（双半区打包、`cordis.patch.yml` 行、客户端 bundle 形式）与最早的侧边栏入口注入思路；现在插件所做的全部事情——槽位注册、常驻访客面板、窗口降级链、UA 处理——都是在这里写的。Apache-2.0 要求的署名见 `NOTICE`。
