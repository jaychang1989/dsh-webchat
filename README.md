# dsh-webchat

**简体中文** | [English](./README.en.md)

## 介绍

在 [DeepSeek Harness Desktop](https://github.com/deepseek-ai/deepseek-harness) 里打开 [chat.deepseek.com](https://chat.deepseek.com) 官方网页版：点侧边栏「Chat DeepSeek」，真实页面就渲染在 **DSH 窗口的中栏**里，和「自动化任务」那类整页视图一样。


## 安装

```bash
dsh plugin --profile desktop add @jaychang1989/dsh-webchat
```

或直接从仓库安装：

```bash
dsh plugin --profile desktop add github:jaychang1989/dsh-webchat
```

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

## License

[Apache-2.0](./LICENSE)

