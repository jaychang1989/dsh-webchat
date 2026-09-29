# dsh-webchat

**简体中文** | [English](./README.en.md)

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 里打开 [chat.deepseek.com](https://chat.deepseek.com) 官方网页版——**点侧边栏入口，页面就直接显示在 DSH 窗口里**，占满中栏，和「自动化任务」那些页面一样。

不重新实现聊天界面：模型选择、深度思考、智能搜索、历史记录、附件上传，全都还是官方那一套。

## 它凭什么能显示在窗口内

iframe 和 `<webview>` 常规路径确实都被封死了：

| 方式 | 结果 |
| --- | --- |
| `<iframe>` | 站点返回 `Content-Security-Policy: frame-ancestors 'none'`，浏览器拒绝渲染 |
| 直接写 `<webview>` | 桌面端默认关闭该标签，且 `will-attach-webview` 一律拦截 |

但桌面端为**受信任的浏览器访客**留了通道：渲染进程向 `globalThis.dshDesktop.browser` 申请一个租约，宿主只放行 `src="about:blank#<lease>"` 且 `partition` 匹配的那一个 `<webview>`，其余照旧拦截。DSH 自带的侧栏浏览器用的就是这套机制，本插件走同一条通道。

所以这个页面**不是嵌在 iframe 里**，而是宿主的原生访客——`frame-ancestors` 管不到它。这也解释了为什么它必须由 DSH 桌面端承载。

而「侧边栏那一行」和「中栏那一页」都是 DSH 的**标准槽位**（`sidebar.panellist` 与 `main`，同一个 id 关联），按钮和面板切换都由 shell 自己掌管——所以这个插件不往别人的 DOM 里塞东西，也不需要去猜什么时候该让位。

在没有该桥接的环境（纯 `dsh web`，非桌面端）会**自动降级**为打开一个窗口，保证入口永远有反应。

## 安装

```bash
dsh plugin --profile desktop add @jaychang1989/dsh-webchat
```

或直接从仓库安装：

```bash
dsh plugin --profile desktop add github:jaychang1989/dsh-webchat
```

> npm 包名带 scope，因为不带 scope 的 `dsh-webchat` 已被占用。scope 不影响插件身份：entry id 仍是 `webchat`。

安装后**重启桌面端**。

## 使用

1. 点侧边栏的「DeepSeek 网页」入口 —— 页面直接在中栏载入，不需要第二次点击；
2. 在里面登录一次 DeepSeek，当前这次运行内一直有效。

再点一次入口收起面板。切换去别的面板（插件、自动化任务、任务看板、会话……）时访客只是被隐藏、从不被卸载，所以切回来不会重新加载、也不会掉登录。

## 环境要求

- DeepSeek Harness **0.2.0-rc.1 或更新的 0.2.x**
- Node.js >= 22
- 桌面端（DSH Desktop）：只有它提供原生访客桥接；纯 `dsh web` 会走窗口降级

## 登录状态

桌面端给浏览器访客的分区是**进程内**的（每次运行随机命名、不带 `persist:`），所以 cookie 和站点存储本来会随退出一起消失——DSH 自带的侧栏浏览器也是这样。本插件把这个接管了，用**两条通道**——因为宿主半区不一定拿得到 Electron：

1. **站点存储**（localStorage）与**页面自己的 cookie**：由页面侧通用搬运，不依赖任何键名，也不依赖 Electron；
2. **分区 cookie（含 HttpOnly）**：只有宿主的 Electron 主进程读得到。能拿到就走这条；`GET /api/dsh-webchat/state` 的 `session.electron` 会如实说明。

顺序：拿到租约 → 回灌（cookie 在首次导航前写回，页面第一个请求就带着它）→ 首次加载完成后再写入存储与 cookie → 刷新一次 → 之后按使用情况快照。

- 文件位置：`%USERPROFILE%\.dsh\dsh-webchat\session.json`
- **删掉这个文件就等于退出登录**（本插件不会再有别的残留）。
- 文件里是**明文**会话凭据。它在你自己的用户目录下（默认只有你的账户可读），但确实不如浏览器那种加密 cookie 库。
- 如果 DeepSeek 的登录态是 HttpOnly cookie、而宿主又拿不到 Electron，就只能保留存储部分——那种情况下重登仍会发生。

## 已知限制

- 官方网页端有自己的风控与登录流程，插件只负责把它承载起来并保留登录态，不介入其请求。
- 页面里指向外部的链接在访客内处理；插件不追加自己的导航策略。

## 排查

| 现象 | 原因 / 处理 |
| --- | --- |
| 侧边栏没出现「DeepSeek 网页」这一行 | 确认 profile 的 `dsh.profile.bundles` 里有 `@jaychang1989/dsh-webchat`，然后重启桌面端 |
| 中栏提示「载入失败：…」 | 宿主拒绝了访客（桥接返回异常）。文本里带着宿主给的原因 |
| 这一行点了但中栏没有页面，反而弹出浏览器窗口 | 说明当前渲染进程拿不到 `dshDesktop.browser`（例如在纯 web 环境），插件走了降级路径 |
| 这一行点了但中栏是空白 | 面板显示的空间是 shell 分配的那个格子；若窗口极小或侧栏被拖到极窄，格子可能没有面积 |
| 重启后要求重新登录 | 先看 `GET /api/dsh-webchat/state` 的 `session`：`electron` 不是 `ready` 说明宿主半区拿不到 Electron（登录态无法保存），`saved` 为 `null` 说明还没产生过快照。正常情况下用一次、等 30 秒再看，文件就会出现 |
| 想彻底退出登录 | 删掉 `%USERPROFILE%\.dsh\dsh-webchat\session.json` |
| 页面弹出「使用环境异常」 | DeepSeek 前端会检查 `navigator.userAgent` 里是否含 `electron`（桌面端默认 UA 就含），命中就提示"建议使用官方产品"。0.5.2 起访客改用普通 Chrome UA，不再触发 |

## 开发与测试

```bash
node --test
```

34 个用例。宿主半区用假 context、假 request/response 与可注入的 Electron/cookie 替身驱动：快照落盘往返、cookie 捕获与回灌（含 `HttpOnly`、拒绝一个不合法 cookie 不影响其余）、两条会话路由的方法守卫与分区校验、无 Electron 时如实报错而不影响页面加载。浏览器半区用一层薄的 React 测试替身 + DOM 桩**真实执行**：槽位注册契约（同一个 id、order、label thunk、按 size 出图标）、租约与 `about:blank#<lease>` 的 webview、`dom-ready` 后先改 UA 再导航、**卸载只隐藏不摘除 / 重挂复用同一访客 / 只申请一次租约**、登录态恢复只回灌一次并只刷新一次、使用中与卸载时的快照、无桥接时的降级。

没有构建步骤——`lib/index.js` 与 `lib/client.js` 就是手写的运行时代码（React 取自浏览器的模块表），包内**零运行时依赖**。访客机制、槽位契约与登录态保存见 [MAINTAINING.md](./MAINTAINING.md)。

## 来源与许可

[Apache-2.0](./LICENSE)。本包最初由 [xmuwenxiang/dsh-web-chat](https://github.com/xmuwenxiang/dsh-web-chat) 分叉而来：沿用其插件骨架（双半区打包、`cordis.patch.yml` 行、浏览器 bundle 的 `window.__ModuleLoader__.load` 形式）与侧边栏入口的 DOM 注入思路；当前功能——中栏访客面板、窗口降级链、入口即动作——都是在这里写的。版权与许可声明见 [NOTICE](./NOTICE)。
