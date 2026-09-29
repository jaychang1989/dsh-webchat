# dsh-webchat

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供的「Codex ChatGPT 模式」插件：通过真实浏览器驱动 [chat.deepseek.com](https://chat.deepseek.com)，用你的 DeepSeek 网页登录会话与网页模型对话，**无需 API 额度**。对话可「转移到 Harness」——蒸馏成可执行任务简报并新建 harness 会话作为开发上下文，也可把网页对话导入为 markdown 上下文，或让 harness agent 直接通过同一个网页会话提问。

> **这是 [xmuwenxiang/dsh-web-chat](https://github.com/xmuwenxiang/dsh-web-chat) 的维护分支（fork）**，已停止维护的上游版本在 dsh 0.2.x 上**无法启动**。本分支把插件重新对准 dsh 0.2.x 的插件 API，许可证沿用 Apache-2.0。
> 差异与原因见 [MAINTAINING.md](./MAINTAINING.md) 与 [NOTICE](./NOTICE)。

## 与上游的差异

| 问题 | 上游（dsh 0.2.x 上） | 本分支 |
| --- | --- | --- |
| 启动 | `installSettingsSection` / `settingsNamespace` 在 dsh 0.1.7 起已从 `@deepseek-ai/dsh-settings` 移除，宿主半区在 ESM 链接期报错，整条 `webchat` entry `failed to import`，插件**完全不加载** | 改为使用 Loader 自带的设置表单（命名空间 = profile entry id，schema = 本包导出的 `Config`），插件不再自行注册设置段 |
| 转移到 harness | `sessionPersistence.load(id)` / `persistence.append(id, events)` 在 dsh 0.2.x 已改为**句柄式** API，调用即抛错 | 迁到 `open(id, 'write')` / `create(header)` 返回的 `SessionHandle`，用 `handle.read` / `append` / `flush` / `close` |
| 依赖声明 | `devDependencies` 停留在 `@deepseek-ai/*: ^0.1.0-rc.7` | 更新到 0.2.x，并补上运行时 `peerDependencies` 与 `engines.dsh` |

## 安装

```bash
dsh plugin --profile desktop add github:jaychang1989/dsh-webchat
```

> 仓库已提交编译产物 `lib/`，从 git 安装无需额外构建。

**从上游切换过来时**：上游包与本包都插入 `id: webchat` 这一行，同一个 profile 里同时存在会因 entry id 重复而在启动时报错。请先移除上游包：

```bash
dsh plugin --profile desktop remove dsh-webchat
dsh plugin --profile desktop add github:jaychang1989/dsh-webchat
```

改完请**重启 DSH 桌面端**（启动期已判定失败的 entry 不会热重载）。

## 首次使用

1. 打开 Web GUI 侧边栏「网页聊天」入口。
2. 点击「打开登录窗口」，在弹出的浏览器中完成 DeepSeek 网页登录。
3. 登录成功后窗口会自动关闭，之后即可正常聊天 / 转移。

## 特性

- **网页聊天**：复用 DeepSeek 网页端登录，流式获取回复，支持「深度思考（R1）」与「智能搜索」开关。
- **转移到 Harness**：一键把当前网页对话蒸馏成任务简报（首条消息即简报）并创建新 harness 会话继续开发，或「延续到已有会话」——把简报作为新消息追加进指定会话；转移时可选择目标工作区（未选则归入「未分组」）。
- **从网页恢复会话**：把网页端已存在但本地未收录的会话拉回本地存储（面板「从网页恢复」按钮 / `webchat_recover`）。
- **导入为上下文**：把存储的网页对话导出为 markdown 上下文。
- **Agent 工具**：`webchat_status` / `webchat_send` / `webchat_recover` / `webchat_import` / `webchat_transfer`，harness agent 可直接调用。
- **无感登录**：首次使用弹出可见浏览器窗口完成登录，登录后窗口自动关闭，后续聊天在无头浏览器中进行。

## 配置

插件设置跟随 profile entry（`webchat`）自动生成，可调整：`browserChannel`（浏览器渠道，默认 auto）、`browserExecutablePath`（显式浏览器路径）、`browserProxy`（代理）、`browserHeadless`（聊天是否无头，默认 true——登录窗口始终可见且登录后自动关闭）、`replyTimeoutMs`（回复等待上限）、`transferDistill` / `transferProvider` / `transferModel`（转移时的蒸馏模型）、`transferMaxTokens`（最终简报输出上限，默认 4096）、`transferChunkTokens`（长对话分块摘要每段上限，默认 1024）。

## 环境要求

- DeepSeek Harness **0.2.0-rc.1 或更新的 0.2.x**
- Node.js >= 22
- 已安装 Google Chrome 或 Microsoft Edge
- 首次登录需要可交互的图形环境（弹出登录窗口）

## 限制

- 网页端受 DeepSeek 官方风控；页面改版或操作失败时返回错误而非崩溃。
- 密码/会话凭据保存在本地私有目录（profile），请勿外泄。
- 「延续到已有会话」在 dsh 0.2.x 上需要该会话未被其它写入方占用（例如未在界面上打开并持有写租约）；被占用时会返回明确错误而不是静默失败。

## 开发

`lib/` 是随仓库提交的编译产物，从 git 安装直接使用它。宿主半区改动需要同步 `src/` 与 `lib/`（构建流水线尚未恢复，见 [MAINTAINING.md](./MAINTAINING.md)）。

```bash
node --test        # 运行单元测试（Node 内置测试运行器）
```

## License

[Apache-2.0](./LICENSE) — 原始版权归 [xmuwenxiang/dsh-web-chat](https://github.com/xmuwenxiang/dsh-web-chat) 作者所有，详见 [NOTICE](./NOTICE)。
