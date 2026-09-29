# 维护说明

## 这是什么

一个启动器：侧边栏一个入口，点一下，把 chat.deepseek.com 官方网页版开在一个窗口里。没有聊天界面、没有会话存储、没有 agent 工具，也不驱动页面——官方网页版本身就是客户端，本包只负责把它拉起来。

形态是被两条实测约束逼出来的：

- `chat.deepseek.com` 返回 `Content-Security-Policy: frame-ancestors 'none'`，任何 iframe 都host不了它；
- DSH 桌面端两个窗口都是 `webviewTag: false`，且 `will-attach-webview` 被拦截，`<webview>` 也不可用；
- 桌面端自己的 `WebContentsView` 只服务平台页面（`--dsh-platform-origin=<account.origin>`，导航被钉在该 origin）。

## 目录与"无构建"政策

**没有构建步骤。** `lib/index.js` 与 `lib/client.js` 就是手写的运行时代码，也是唯一的事实来源；没有 `src/`、没有打包器、没有工具链。因此本包**零运行时依赖**。

```
lib/index.js       宿主半区 —— 两条路由 + 窗口策略
lib/client.js      浏览器半区 —— 侧边栏入口与提示条，纯 DOM
cordis.patch.yml   profile 行
test/*.test.mjs    node --test
```

`package.json` 把两个半区钉住：`exports["."]` → `lib/index.js`，`exports["./client"]` → `lib/client.js`，`dsh.bundle.patch` → `cordis.patch.yml`，`dsh.client.platform` → `web`。

## 宿主半区

`inject: ['webServer']`；`apply(ctx)` 只注册两条 exact 路由：

| 路由 | 方法 | 返回 |
| --- | --- | --- |
| `/api/dsh-webchat/state` | GET | `{ ok, url, appWindowOpen, last }` |
| `/api/dsh-webchat/open` | POST | `{ ok, via, error, at }`，一个都没打开时 502 |

`state` 是诊断接口（浏览器半区已经不再读它），`open` 是入口调用的那条。

`openPage(strategies)` 依次走 `OPEN_STRATEGIES` 并记录胜出者；列表是参数，测试才能在不真的开任何东西的情况下驱动它。三个策略：

1. `app-window` —— `await import('electron')` 之后 `new BrowserWindow(...)`。**这个 import 是动态的、且写在调用内部**：拿不到 Electron 的宿主也必须能加载本插件，探测失败要能落到下一个策略，而不是在 import 期把整条 entry 弄死。
2. `app-window-shell` —— `msedge.exe` / `chrome.exe` 加 `--app=`，配一个私有的 `--user-data-dir`（`~/.dsh/dsh-webchat/app-window`）。
3. `system-browser` —— `cmd /c start`、`open` 或 `xdg-open`。

窗口句柄挂在 `globalThis[Symbol.for('@jaychang1989/dsh-webchat.window')]` 而不是模块状态上：否则一次热重载会交给新模块一个 `null`，把已开的窗口变成孤儿，于是每次点击都再开一个。

刻意为之：**dispose 时不关闭窗口**。设置变更会重新 apply 该 entry，为此把用户正在看的会话关掉，比留一个孤儿窗口更糟。

## 浏览器半区

产物是一个模块加载器工厂——没有 React，没有任何 import：

```js
window.__ModuleLoader__.load({
  id: '<包名>',
  factory: () => { /* … */ return module.exports },  // { apply, inject }
})
```

**`id` 必须与包名逐字一致**（含 scope）：`dsh-client-modules` 用 manifest 里的包名给每个浏览器行建索引并据此物化，不一致就会静默地永不加载。`cordis.patch.yml` 里那行的 `name` 同样要对上。这三处是包名被编码的全部位置；`/api/dsh-webchat` 路径、`data-dsh-webchat-*` 属性、`DeepSeek 网页` 文案都是插件自身身份，不跟着改。

shell 没有给外部插件留任何可注册的 slot，所以入口行是在 DOM 层注入的，并对 React 重渲染自愈：

- **入口** —— 一个 `<button data-dsh-webchat-entry>`，插在侧边栏根（`[data-pane="sidebar"], [class*="sidebarCol"]`）里 New Session 行之后；body 级 `MutationObserver` 负责发现整个侧栏被重建，根级那个负责在 React 把它挤掉后重新插入。
- **点击它** —— POST `/api/dsh-webchat/open`，结果写进一个 `<div data-dsh-webchat-toast>` 并自行移除（3 秒，失败 8 秒）。请求进行中入口会自我禁用并把文字换成"正在打开…"，所以慢策略不会被连点。

刻意保留：**没有面板**。页面进不了这个窗口，面板就只会是一张画着按钮的图。

样式表以单个 `<style id="dsh-webchat-style">` 注入，内容来自 `lib/client.js` 里的 `CSS` 数组；它使用 shell 的 `--dsw-*` token，因此入口和提示条会跟随当前主题。

## 测试

```bash
node --test
```

13 个用例：宿主半区用假 context 与假 request/response 驱动（路由、方法守卫、策略选择）；浏览器半区用 `vm` 在一个最小 DOM 桩里真实执行（`test/client.test.mjs`），覆盖 bundle 实际会调用的每一个 API——足以证明它挂载了入口、点击后请求了正确的路由，以及成功 / 兜底 / 失败（包括旧宿主半区那个光秃秃的 `HTTP 404`）都如实进了提示条，而不是被吞掉。

## 无法从 app 外部验证的部分

`app-window` 需要插件所在进程能拿到 Electron 的 `BrowserWindow`。桌面端确实把 cordis 加载器跑在 Electron 主进程里，并且自己就 import 了 `BrowserWindow`，所以这个策略预期可用；但它只能靠重启桌面端来真正验证——保留兜底链正是因为这一点在本机无法证伪。提示条会说明实际用了哪种策略，所以第一次点击就能给出答案。

改策略时要记住两条宿主事实：

- 策略 1 开的窗口会被 Electron 的 `window-all-closed` 计入：若先关掉 DSH 主窗口而它仍开着，DSH 会继续运行，直到那个窗口也关掉。
- 宿主半区每个进程只 import 一次，而客户端半区每次刷新页面都会重新下发；因此升级本包后，运行中的 app 会表现为"新入口 + 旧路由"，直到重启。提示条里那个光秃秃的 `HTTP 404` 就是这个错配。

## 来源

本包最初由 `xmuwenxiang/dsh-web-chat` 分叉而来。它至今沿用的部分是插件骨架（双半区打包、`cordis.patch.yml` 行、客户端 bundle 的形式）以及侧边栏入口的注入思路和随之而来的一套基础样式；现在插件所做的全部事情——窗口策略、入口即动作、提示条——都是在这里写的。Apache-2.0 要求的署名见 `NOTICE`。
