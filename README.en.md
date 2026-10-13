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

## Login compatibility

- Keep the desktop engine's native user agent; spoofing Chrome can worsen site challenges and Google sign-in rejection.
- Automatic snapshots exclude AWS WAF cookies and storage. Old WAF storage is skipped during restore. Explicitly imported cookies are still restored as supplied, but WAF cookies are not automatically saved afterwards.
- Some DSH Desktop 0.2.0-rc.2 environments expose no Electron cookie API. Page storage can still carry the login, but HttpOnly cookies cannot be saved or restored there. `/api/dsh-webchat/state` reports availability through `session.electron`.
- These fixes do not guarantee that an embedded browser passes site challenges. Real sign-in, Google authorization and restart survival still depend on the host and site.

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
