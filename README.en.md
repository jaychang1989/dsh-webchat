# dsh-webchat

[简体中文](./README.md) | **English**

## Introduction

Opens the official [chat.deepseek.com](https://chat.deepseek.com) web app inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): click "Chat DeepSeek" in the sidebar and the real page renders in the **center column of the DSH window**, like any other full-page view. No chat UI is reimplemented — the model picker, deep think, smart search, history and attachments are all the official ones.

**Why the page can render inside the window.** Both obvious routes are closed: an `<iframe>` is refused by the site's `Content-Security-Policy: frame-ancestors 'none'`, and a plain `<webview>` is blocked by the desktop build. The shell keeps a door open for **approved browser guests**: the renderer asks `dshDesktop.browser` for a lease, and the shell approves exactly the one `<webview>` whose `src` is `about:blank#<lease>` and whose `partition` matches, rewriting its web preferences for it — the same channel the built-in side-card browser uses. So the page is **not an iframe**; it is a native guest owned by the host, and `frame-ancestors` does not apply to it.

**The row and the page are both standard slots.** The plugin registers into `sidebar.panellist` (the sidebar owns the button) and into the keyed `main` cell under the same id (the layout renders only the selected one), so placement, the selected state and panel switching all belong to the shell. Nothing is injected into another plugin's DOM.

**Where no guest bridge exists** (a plain `dsh web` profile) the plugin falls back to opening a window.

## Install

```bash
dsh plugin --profile desktop add @jaychang1989/dsh-webchat
```

Or straight from this repository:

```bash
dsh plugin --profile desktop add github:jaychang1989/dsh-webchat
```

> The npm package is scoped because the unscoped `dsh-webchat` name is taken. The scope does not change the plugin's identity: the entry id stays `webchat`.

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

Thirty-four cases. The host half is driven through a fake context, fake request/response objects and injectable Electron/cookie stand-ins: routes and method guards, partition validation, the session snapshot round-trip through disk, cookie capture and restore (HttpOnly included, one refused cookie not aborting the rest), and a host without Electron reporting why without hurting the page. The browser half really executes against a thin React test double plus a DOM stand-in: the slot contract (one shared id, order, the label, the icon honouring the requested size), the lease and the `about:blank#<lease>` webview, the user agent landing before navigation, hiding the guest without detaching it on unmount while reusing it on remount, the login restore writing once and reloading once, snapshots while in use and before disposal, and the window fallback.

**There is no build step.** React comes from the browser module table, `lib/index.js` and `lib/client.js` are the hand-written runtime, and the package has **zero runtime dependencies**.
