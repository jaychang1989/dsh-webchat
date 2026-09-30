# dsh-webchat

**简体中文** | [English](./README.en.md)

## 介绍

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 里打开 [chat.deepseek.com](https://chat.deepseek.com) 官方网页版：点侧边栏「Chat DeepSeek」，真实页面就渲染在 **DSH 窗口的中栏**里，和「自动化任务」那类整页视图一样。不重新实现聊天界面——模型选择、深度思考、智能搜索、历史记录、附件上传仍然都是官方那一套。

**页面凭什么能进到窗口里。** 常规两条路都是死的：`<iframe>` 会被站点的 `Content-Security-Policy: frame-ancestors 'none'` 拒绝，直接写 `<webview>` 又会被桌面端拦下。桌面端为"受信任的浏览器访客"留了通道：渲染进程向 `dshDesktop.browser` 申请一个租约，宿主只放行 `src="about:blank#<lease>"` 且 `partition` 匹配的那一个 `<webview>`，并替它写死一组安全的 webPreferences——DSH 自带的侧栏浏览器用的就是这条通道。所以这个页面**不是嵌在 iframe 里**，而是宿主的原生访客，`frame-ancestors` 管不到它。

**导航行与页面都是标准槽位。** 插件注册到 `sidebar.panellist`（按钮由侧边栏拥有）与按同一个 id 关联的 `main` 槽位（layout 只渲染当前选中的那个），因此行的位置、选中态与面板切换都由 shell 负责，插件不往别人的 DOM 里塞东西。

**没有该访客桥接的环境**（纯 `dsh web`，非桌面端）会自动降级为打开一个窗口。

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

1. 点侧边栏的「Chat DeepSeek」——页面直接在中栏载入，不需要第二次点击；
2. 在里面登录一次 DeepSeek，**之后重启也不用再登**。

- 再点一次入口收起面板；切换去别的面板（插件、自动化任务、会话……）时访客只是被隐藏、从不被卸载，所以切回来不会重新加载、也不会掉登录。
- 桌面端给浏览器访客的分区是**进程内**的（每次运行随机命名），所以登录态由本插件自己保存：页面的 localStorage 与页面自己的 cookie 由页面侧搬运，分区 cookie（**含 HttpOnly**）在宿主能拿到 Electron 时一并搬运。宿主拿不到 Electron 时，前两条仍然生效。
- **想退出登录**：删掉 `%USERPROFILE%\.dsh\dsh-webchat\session.json` 即可，本插件不会在别处留东西。

## 环境要求

- DeepSeek Harness **0.2.0-rc.1 或更新的 0.2.x**
- Node.js >= 22
- 桌面端（DSH Desktop）：只有它提供原生访客桥接；纯 `dsh web` 会走窗口降级

## 开发与测试

```bash
node --test
```

34 个用例。宿主半区用假 context、假 request/response 与可注入的 Electron/cookie 替身驱动：路由与方法守卫、分区校验、登录态快照落盘往返、cookie 捕获与回灌（含 HttpOnly、拒绝一个不合法 cookie 不影响其余）、拿不到 Electron 时如实报错而不影响页面加载。浏览器半区用一层薄的 React 测试替身 + DOM 桩**真实执行**：槽位注册契约（同一个 id、order、label、按 size 出图标）、租约与 `about:blank#<lease>` 的 webview、`dom-ready` 后先改 UA 再导航、卸载只隐藏不摘除且重挂复用同一访客、登录态恢复只写一次并只刷新一次、使用中与卸载前的快照，以及无桥接时的降级。

**没有构建步骤。** React 取自浏览器的模块表，`lib/index.js` 与 `lib/client.js` 就是手写的运行时代码，包内**零运行时依赖**。
