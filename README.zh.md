# dsh-webchat

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 里一键打开 [chat.deepseek.com](https://chat.deepseek.com) 官方网页版。

**侧边栏一个入口，点一下，官方页面就开在一个窗口里。**

仅此而已。不做聊天界面，不做会话存储，不做 agent 工具——官方网页版本身就是完整的客户端，模型选择、深度思考、智能搜索、历史记录、附件上传都在里面。

## 为什么不嵌在面板里

三条路都被封死，这是实测结果而不是取舍：

| 方式 | 实测结果 |
| --- | --- |
| `<iframe>` | `chat.deepseek.com` 返回 `Content-Security-Policy: frame-ancestors 'none'`，浏览器直接拒绝渲染 |
| Electron `<webview>` | 桌面端两个窗口都是 `webviewTag: false`，且 `will-attach-webview` 被显式拦截 |
| 桌面端内置的 `WebContentsView` | 只服务平台页面（账号/充值），导航被限制在该 origin，第三方插件拿不到 |

所以忠实呈现官方页面的唯一方式，就是开一个真实窗口。

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

1. 点侧边栏的「DeepSeek 网页」入口；
2. 在弹出的窗口里登录一次 DeepSeek，之后登录态会保留。

点击后右下角会有一条短提示说明结果。

## 它怎么打开页面

按顺序尝试，第一个成功的生效，提示条会告诉你实际用了哪一种：

1. **应用窗口** —— 由 DSH 桌面端进程自己创建的窗口（桌面端就是 Electron）。已经开着就聚焦，不会重复开。
2. **无边框窗口** —— Edge/Chrome 的 `--app=` 模式，使用独立 `--user-data-dir`（`~/.dsh/dsh-webchat/app-window`），因此登录态与你日常浏览器互不干扰。用于第 1 种拿不到 Electron 的场景。
3. **系统默认浏览器** —— 兜底，保证点击一定有反应。

三种都不需要额外配置。

## 环境要求

- DeepSeek Harness **0.2.0-rc.1 或更新的 0.2.x**
- Node.js >= 22
- 第 2 种方式需要本机装有 Edge 或 Chrome；第 1 种不需要

## 已知限制

- 官方网页端有它自己的风控和登录流程，插件只负责把页面交出去，不介入其请求。
- 第 1 种方式创建的窗口由 DSH 进程拥有：如果你先关掉 DSH 主窗口、而它仍开着，DSH 不会退出（Electron 的 `window-all-closed` 语义）。把它一起关掉即可。
- 插件被重载时不会主动关闭已经打开的窗口——否则一次设置变更就会把你正在看的会话关掉。

## 排查

| 现象 | 原因 / 处理 |
| --- | --- |
| 提示条显示 `HTTP 404` | 宿主的旧版本还在内存里（宿主半区只在进程启动时加载，客户端半区每次刷新页面重新取）。**重启桌面端**即可 |
| 提示条显示「已交给系统默认浏览器打开」 | 前两种方式都不可用；看窗口是否被宿主拒绝，或本机没装 Edge/Chrome |
| 入口没出现在侧边栏 | 确认 profile 的 `dsh.profile.bundles` 里有 `@jaychang1989/dsh-webchat`，并重启桌面端 |

## 开发与测试

```bash
node --test
```

13 个用例：宿主两条路由与窗口策略选择，以及浏览器半区在 DOM 桩里真实执行（挂载入口、点击后请求正确路由、成功/兜底/失败是否都如实提示）。

没有构建步骤——`lib/index.js` 与 `lib/client.js` 就是手写的运行时代码，包内**零运行时依赖**。细节见 [MAINTAINING.md](./MAINTAINING.md)。

## 来源与许可

[Apache-2.0](./LICENSE)。本包最初由 [xmuwenxiang/dsh-web-chat](https://github.com/xmuwenxiang/dsh-web-chat) 分叉而来：沿用了它的插件骨架（双半区打包、`cordis.patch.yml` 行、浏览器 bundle 的 `window.__ModuleLoader__.load` 形式）与侧边栏入口的 DOM 注入思路，当前功能（打开官方页面的窗口策略、入口即动作、提示条）是新写的。版权与许可声明见 [NOTICE](./NOTICE)。
