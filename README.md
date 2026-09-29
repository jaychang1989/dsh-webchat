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

再点一次入口收起面板；面板关闭后访客保持挂载，重新打开不会重新加载、也不会掉登录。点侧边栏里**任何其它行**（插件、自动化任务、任务看板、会话、工作区）都会把中栏让回去——那些页面由 shell 渲染在中栏，本插件不占用它们的席位。

## 环境要求

- DeepSeek Harness **0.2.0-rc.1 或更新的 0.2.x**
- Node.js >= 22
- 桌面端（DSH Desktop）：只有它提供原生访客桥接；纯 `dsh web` 会走窗口降级

## 已知限制

- **重启桌面端后需要重新登录 DeepSeek。** 宿主给访客分配的是**进程内**分区（每次运行随机命名、不带 `persist:`），登录态不落盘。这是宿主的机制，插件无法改变。
- 官方网页端有自己的风控与登录流程，插件只负责把它承载起来，不介入其请求。
- 页面里指向外部的链接在访客内处理；插件不追加自己的导航策略。

## 排查

| 现象 | 原因 / 处理 |
| --- | --- |
| 入口没出现 | 确认 profile 的 `dsh.profile.bundles` 里有 `@jaychang1989/dsh-webchat`，然后重启桌面端 |
| 中栏提示「载入失败：…」 | 宿主拒绝了访客（桥接返回异常）。文本里带着宿主给的原因 |
| 点了入口却弹出一个浏览器窗口 | 说明当前渲染进程拿不到 `dshDesktop.browser`（例如在纯 web 环境），插件走了降级路径 |
| 重启后要求重新登录 | 见上面的「已知限制」，属于宿主分区机制 |

## 开发与测试

```bash
node --test
```

14 个用例，其中浏览器半区在 DOM 桩里**真实执行**：桌面端环境下验证入口挂载、点击后申请租约、按宿主约定生成 `about:blank#<lease>` 的 webview、`dom-ready` 后导航到目标地址、关闭重开复用同一个访客；无桥接环境下验证降级为请求宿主开窗并如实提示结果。

没有构建步骤——`lib/index.js` 与 `lib/client.js` 就是手写的运行时代码，包内**零运行时依赖**。访客机制的来龙去脉见 [MAINTAINING.md](./MAINTAINING.md)。

## 来源与许可

[Apache-2.0](./LICENSE)。本包最初由 [xmuwenxiang/dsh-web-chat](https://github.com/xmuwenxiang/dsh-web-chat) 分叉而来：沿用其插件骨架（双半区打包、`cordis.patch.yml` 行、浏览器 bundle 的 `window.__ModuleLoader__.load` 形式）与侧边栏入口的 DOM 注入思路；当前功能——中栏访客面板、窗口降级链、入口即动作——都是在这里写的。版权与许可声明见 [NOTICE](./NOTICE)。
