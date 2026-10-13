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
- 回复里的外链（引用、来源这类会弹新窗口的链接）现在交给**系统默认浏览器**打开——之前点了毫无反应。
- 桌面端给浏览器访客的分区是**进程内**的（每次运行随机命名），所以登录态由本插件自己保存：页面的 localStorage 与页面自己的 cookie 由页面侧搬运，分区 cookie（**含 HttpOnly**）在宿主能拿到 Electron 时一并搬运。宿主拿不到 Electron 时，前两条仍然生效。
- **想退出登录**：先完全退出 DSH，再删除登录快照。默认在 `%USERPROFILE%\.dsh\dsh-webchat\session.json`；设置了 `DSH_HOME` 环境变量时跟随它：`<DSH_HOME>\dsh-webchat\session.json`（旧快照只迁移一次，旧文件保留供备份，可手动删除；请保留不含登录信息的 `session.migrated` 标记，防止旧登录再次迁入）。

在 Chat DeepSeek 面板中按 **F5 或 Ctrl+R**（macOS 为 **⌘R**）刷新官方页面，即可更新其他设备新增的会话；无需重启应用，也没有额外的刷新按钮。快捷键可在宿主的快捷键设置中调整。

## 登录兼容性

- 用户代理只移除 `Electron/<版本>` token、其余原样保留：既躲开站点对 "electron" 字样的「使用环境异常」弹窗，又不制造版本指纹失配（后者曾加重 WAF 验证循环与 Google 登录异常）。
- 登录恢复完成前暂停所有自动保存，恢复失败保留原有快照；仅在官方聊天网站读写页面登录信息，授权网站的 cookie 不进入快照。
- 自动保存时排除 AWS WAF 验证 cookie 和存储；恢复旧快照时跳过 WAF 存储。手动导入的 cookie 仍按原样恢复，但之后不会自动保存其中的 WAF cookie。
- DSH Desktop 0.2.0-rc.2 的部分环境无法提供 Electron cookie 接口：此时仍通过页面存储恢复登录，但无法保存或恢复 HttpOnly cookie。诊断接口 `/api/dsh-webchat/state` 的 `session.electron` 会报告可用性。
- 上述修复不能保证内嵌浏览器一定能通过站点验证；真实登录、Google 授权及重启恢复仍取决于宿主与站点行为。

## 环境要求

- DeepSeek Harness **0.2.0-rc.2 或更新的 0.2.x**
- Node.js >= 22
- 桌面端（DSH Desktop）：只有它提供原生访客桥接；纯 `dsh web` 会走窗口降级

## 开发与测试

```bash
node --test
```

## License

[Apache-2.0](./LICENSE)

