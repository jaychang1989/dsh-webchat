# dsh-webchat

[简体中文](./README.md) | **English**

## Introduction

Opens the official [chat.deepseek.com](https://chat.deepseek.com) web app inside [DeepSeek Harness Desktop](https://github.com/deepseek-ai/deepseek-harness): click "Chat DeepSeek" in the sidebar and the real page renders in the **center column of the DSH window**, like any other full-page view. 

## Install

```bash
dsh plugin --profile desktop add @jaychang1989/dsh-webchat
```

Or straight from this repository:

```bash
dsh plugin --profile desktop add github:jaychang1989/dsh-webchat
```

**Restart the desktop app after installing.**

## Use

1. Click "Chat DeepSeek" in the sidebar — the page loads in the center column; there is no second click.
2. Sign in to DeepSeek once — **restarts will not ask again**.

- Clicking again collapses the panel. Switching to another panel (Plugins, Automation Tasks, a session …) only hides the guest, never unmounts it, so coming back neither reloads the page nor drops the session.
- The shell hands every browser guest a **process-lifetime** partition (a fresh random name per run), so this plugin carries the session itself: the page's localStorage and its own cookies travel through the page, and the partition's cookies (**HttpOnly included**) travel through the host half wherever Electron is reachable. Without Electron, the first two still work.
- **To sign out**: delete `%USERPROFILE%\.dsh\dsh-webchat\session.json`. The plugin keeps nothing else behind.

## Requirements

- DeepSeek Harness **0.2.0-rc.1 or a newer 0.2.x**
- Node.js >= 22
- The desktop app: only it provides the native guest bridge; plain `dsh web` uses the window fallback

## Development and tests

```bash
node --test
```

## License

[Apache-2.0](./LICENSE)
