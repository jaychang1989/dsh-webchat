# dsh-webchat

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 里打开 [chat.deepseek.com](https://chat.deepseek.com) 官方网页版：侧边栏一个入口，面板一个按钮，点开就是官方页面。

**不再重新实现聊天界面。** 官方网页版本身就是完整的客户端——模型选择、深度思考、智能搜索、历史记录、附件上传都在里面。本插件只负责把它打开，别的一概不管。

## 为什么是「开一个窗口」，而不是「嵌在面板里」

两条路都被封死了，这是实测结论而非选择：

- `chat.deepseek.com` 返回 **`Content-Security-Policy: frame-ancestors 'none'`** —— 任何 iframe 嵌入都会被浏览器拒绝；
- DSH 桌面端两个窗口都是 **`webviewTag: false`**，且 `will-attach-webview` 被显式拦截 —— `<webview>` 也不可用。

所以忠实呈现官方页面的唯一方式就是开一个真实窗口。

## 打开顺序

按钮会按顺序尝试，第一个成功的生效，面板上会显示实际用了哪种：

1. **`app-window`** —— 由 DSH 桌面端进程直接创建的窗口（桌面端就是 Electron）。已经开着就聚焦，不会重复开第二个。
2. **`app-window-shell`** —— 无边框的 Edge/Chrome 窗口（`--app=`），使用独立 `--user-data-dir`（`~/.dsh/dsh-webchat/app-window`），因此登录态与你的日常浏览器互不干扰。用于第 1 种被宿主拒绝的场景。
3. **`system-browser`** —— 交给操作系统默认浏览器，保证按钮任何时候都有反应。

登录一次即可：窗口自己的 profile 会保留登录态。

## 安装

```bash
dsh plugin --profile desktop add @jaychang1989/dsh-webchat
```

或直接从仓库安装：

```bash
dsh plugin --profile desktop add github:jaychang1989/dsh-webchat
```

> npm 包名带 scope，因为不带 scope 的 `dsh-webchat` 属于已停止维护的上游项目。scope 不影响插件身份：entry id 仍是 `webchat`。

**从上游或本插件 0.3.x 切换过来时**：它们都插入 `id: webchat` 这一行，同一个 profile 里不能并存（entry id 重复会在启动时报错）。先移除旧的再加新的，然后重启桌面端。

## 使用

1. 点侧边栏的「DeepSeek 网页」入口；
2. 点面板里的「打开 chat.deepseek.com」；
3. 在弹出的窗口里登录一次，之后正常使用官方网页版。

## 与 0.3.x 的差异（这是一次大幅删减）

| 0.3.x | 0.4.0 |
| --- | --- |
| 用 Playwright 驱动网页，自研聊天面板重新渲染消息 | 不再驱动网页，直接开官方页面；自研面板删除 |
| 5 个 agent 工具（`webchat_status/send/recover/import/transfer`） | 全部删除 |
| 「转移到 harness」「从网页恢复」「导入」「导出」 | 全部删除 |
| 本地会话存储 `~/.dsh/dsh-webchat/transcripts.json` | 删除（只留窗口 profile 目录） |
| 15 条 `/api/dsh-webchat/*` 路由 | 只剩 2 条：`state` / `open` |
| 依赖 `playwright-core`，客户端产物需 React + 构建器 | **零运行时依赖**，客户端为纯 DOM，无构建步骤 |
| 约 3800 行（构建产物） | 约 700 行（手写 JS） |

## 环境要求

- DeepSeek Harness **0.2.0-rc.1 或更新的 0.2.x**
- Node.js >= 22
- 第 2 种策略（无边框窗口）需要本机装有 Edge 或 Chrome；第 1 种策略不需要

## 限制

- 官方网页端受 DeepSeek 官方风控；页面打不开时插件只负责把页面交出去，不介入其登录或请求。
- 第 1 种策略创建的窗口由 DSH 进程拥有：若你先关掉 DSH 主窗口、而它仍开着，DSH 不会退出（Electron 的 `window-all-closed` 语义）。关掉该窗口即可。
- 插件被重载时不会主动关闭已经打开的窗口（避免一次设置变更就关掉你正在看的会话）。

## 开发与测试

```bash
node --test        # 11 个用例：宿主路由、窗口策略选择、浏览器半区在 DOM 桩里的挂载与按钮行为
```

没有构建步骤：`lib/index.js` 与 `lib/client.js` 就是手写的运行时代码。详见 [MAINTAINING.md](./MAINTAINING.md)。

## License

[Apache-2.0](./LICENSE) — 原始版权归 [xmuwenxiang/dsh-web-chat](https://github.com/xmuwenxiang/dsh-web-chat) 作者所有，详见 [NOTICE](./NOTICE)。
