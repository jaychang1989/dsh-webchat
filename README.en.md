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
- External reply links (citations and sources that would open a new window) now open in the **system default browser** — before, clicking them did nothing.
- The shell hands every browser guest a **process-lifetime** partition (a fresh random name per run), so this plugin carries the session itself: the page's localStorage and its own cookies travel through the page, and the partition's cookies (**HttpOnly included**) travel through the host half wherever Electron is reachable. Without Electron, the first two still work.
- **To sign out**: delete the snapshot file — the plugin keeps nothing else behind. It lives at `%USERPROFILE%\.dsh\dsh-webchat\session.json` by default, or follows `DSH_HOME` when that variable is set: `<DSH_HOME>\dsh-webchat\session.json`. A pre-existing snapshot under `~/.dsh` is carried over once on upgrade; the old file is kept and can be deleted manually afterwards.

## Login compatibility

- The user agent only drops the `Electron/<version>` token; everything else passes through byte-for-byte. This dodges the site's literal "electron" substring check (the 使用环境异常 dialog) without the version-fingerprint mismatch that once worsened WAF challenges and Google sign-in.
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
