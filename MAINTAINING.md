# 维护说明

## 这是什么

一个入口：点侧边栏「DeepSeek 网页」，官方 chat.deepseek.com 就渲染在 **DSH 窗口内的中栏**里，和「自动化任务」那类整页视图一样。不重新实现聊天界面，不做会话存储，不做 agent 工具。

## 页面为什么能在窗口内显示

两条常规路径确实是死的：

- `chat.deepseek.com` 返回 `Content-Security-Policy: frame-ancestors 'none'`，iframe 被浏览器拒绝；
- 桌面端默认关闭 `<webview>` 标签，`will-attach-webview` 一律拦截。

**但桌面端给"受信任的浏览器访客"留了通道**，也就是本插件走的路（DSH 自带的侧栏浏览器用的是同一套）：

- 渲染进程调用 `globalThis.dshDesktop.browser.acquire(workspace)`（IPC `dsh-desktop:browser-acquire`），宿主在 `DesktopBrowserGuests` 里为这个 workspace 分配一个**进程内**分区并返回 `{ lease, partition }`；
- 渲染进程创建 `<webview>`，`src="about:blank#<lease>"`、`partition=<partition>`、`name=<lease>`，然后挂进 DOM；
- 宿主在 `will-attach-webview` 里只放行 `src` 里带的 lease 属于当前窗口、`partition` 匹配、且尚未被占用过的那一个元素，并替它写死一组安全 webPreferences（`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、`webviewTag: false` …），其余一律 `preventDefault()`；
- 附加成功后宿主通过 `did-attach-webview` 接管输入，客户端再 `element.loadURL(url)` 导航。

关键点：这是宿主的**原生访客**，不是 iframe，所以 `frame-ancestors` 约束不到它。也因此它只能存在于桌面端。

宿主没有给插件提供任何"在面板里显示网页"的公开 API；本插件使用的是与内置浏览器相同的那条 IPC 通道，因此**升级 DSH 时要重新核对 `DesktopBrowserGuests` 的约定**（预加载脚本 `lib/preload-app.cjs`、主进程 `lib/main.js`）。若某天该通道收紧或改名，客户端会拿不到租约、面板显示「载入失败」，而入口本身的降级路径仍然可用。

## 目录与"无构建"政策

**没有构建步骤。** `lib/index.js` 与 `lib/client.js` 就是手写的运行时代码，也是唯一的事实来源；没有 `src/`、没有打包器、没有工具链。因此本包**零运行时依赖**。

```
lib/index.js       宿主半区 —— 两条路由 + 窗口降级策略（纯 web 环境才用得上）
lib/client.js      浏览器半区 —— 侧边栏入口 + 中栏访客面板，纯 DOM
cordis.patch.yml   profile 行
test/*.test.mjs    node --test
```

## 宿主半区

`inject: ['webServer']`，注册两条 exact 路由：

| 路由 | 方法 | 返回 |
| --- | --- | --- |
| `/api/dsh-webchat/state` | GET | `{ ok, url, appWindowOpen, last, attempts }`（诊断用） |
| `/api/dsh-webchat/open` | POST | `{ ok, via, error, at }`，一个都没打开时 502 |

`openPage(strategies)` 依次走 `OPEN_STRATEGIES` 并记录**整条链路**（`attempts`），所以一次点击就能看出每条策略为什么失败。策略：

1. `app-window` —— 先 `await import('electron')`，失败再 `createRequire(import.meta.url)('electron')`，然后 `new BrowserWindow(...)`。两条探测都必须包在调用内部：拿不到 Electron 的宿主仍要能加载插件，探测失败要能落到下一个策略。ESM 那条优先，是因为 DSH 的加载器会自行解析裸模块名、未必把它交给 Electron 的解析器，而 CJS 的 `require` 由 Electron 原生提供。
2. `app-window-shell` —— `msedge.exe` / `chrome.exe` 加 `--app=`，配私有 `--user-data-dir`。
3. `system-browser` —— `cmd /c start`、`open` 或 `xdg-open`。

窗口句柄挂在 `globalThis[Symbol.for('@jaychang1989/dsh-webchat.window')]` 而不是模块状态上：否则一次热重载会交给新模块一个 `null`，把已开的窗口变成孤儿。dispose 时**不关窗口**——设置变更会重新 apply 该 entry，为此关掉用户正在看的会话比留个孤儿窗口更糟。

桌面端正常情况下永远走不到这三条：客户端有访客桥接，直接在中栏渲染。它们只服务于纯 `dsh web` 环境。

## 浏览器半区

产物是一个模块加载器工厂——没有 React，没有任何 import：

```js
window.__ModuleLoader__.load({
  id: '<包名>',
  factory: () => { /* … */ return module.exports },  // { apply, inject }
})
```

**`id` 必须与包名逐字一致**（含 scope）：`dsh-client-modules` 用 manifest 里的包名给每个浏览器行建索引并据此物化，不一致就会静默地永不加载。`cordis.patch.yml` 里那行的 `name` 同样要对上。这三处是包名被编码的全部位置。

启动时按 `globalThis.dshDesktop` 是否存在分两条路：

- **有桥接（桌面端）**：入口切换中栏面板。面板容器按老办法注入 `[data-pane="conversation"], [class*="centerCol"]`，由 `<html data-dsh-webchat-active>` 控制显隐，并沿用"单占用中栏"的仲裁：打开时清掉 `data-dsh-taskboard-active` / `data-dsh-ssh-active` 并广播 `dsh-panel-activate`，收到别人的广播则自行关闭。访客**懒创建**：首次打开时 `acquire` 租约、建 webview、`dom-ready` 后 `loadURL`；关闭面板只是隐藏，访客保持挂载，所以重开不重载、不掉登录。卸载时移除元素并 `release(lease)`。
- **无桥接（纯 web）**：入口退化为请求宿主 `POST /api/dsh-webchat/open`，并用提示条如实反馈成功/降级/失败（含旧宿主半区那个光秃秃的 `HTTP 404`）。

`applyActive` 里先挂载再广播仲裁事件：事件会同步分发到其它插件，一个抛异常的监听者不该让本面板停在半开状态。

样式表以单个 `<style id="dsh-webchat-style">` 注入，使用 shell 的 `--dsw-*` token；webview 的规则照抄内置浏览器（`-webkit-app-region:no-drag;border:0;flex:auto;width:100%;height:100%;display:flex`）。

## 测试

```bash
node --test
```

14 个用例：宿主半区用假 context 与假 request/response 驱动（路由、方法守卫、策略选择与失败链路）；浏览器半区用 `vm` 在一个最小 DOM 桩里真实执行，覆盖两种环境——桌面端（挂载入口、点击申请租约、按宿主约定生成 `about:blank#<lease>` 的 webview、`dom-ready` 后导航、关闭重开复用同一访客）与纯 web（降级为请求宿主开窗并如实提示，包括 `HTTP 404`）。

## 无法从 app 外部验证的部分

- **宿主是否真的批准访客**只能在运行中的桌面端验证：测试桩能证明插件按约定构造了 webview，但 `will-attach-webview` 的放行发生在主进程。中栏一旦出现「载入失败：…」，文本里带的就是宿主给的原因。
- 窗口降级链里的 `app-window` 需要插件进程能拿到 Electron 的 `BrowserWindow`，同样只能靠重启后的真实进程验证；提示条会说明实际用了哪种策略。

## 来源

本包最初由 `xmuwenxiang/dsh-web-chat` 分叉而来。至今沿用的部分是插件骨架（双半区打包、`cordis.patch.yml` 行、客户端 bundle 形式）以及侧边栏入口的 DOM 注入思路和随之而来的一套基础样式；现在插件所做的全部事情——中栏访客面板、窗口降级链、入口即动作——都是在这里写的。Apache-2.0 要求的署名见 `NOTICE`。
