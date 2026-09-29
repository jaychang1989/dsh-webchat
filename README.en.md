# dsh-webchat

[简体中文](./README.md) | **English**

Opens the official [chat.deepseek.com](https://chat.deepseek.com) web app from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) in one click.

**One sidebar entry. Click it, and the official page opens in a window.**

That is the whole plugin. No chat UI, no transcript store, no agent tools — the official web app already is the client: model picker, deep think, smart search, history and attachments all live there.

## Why it opens a window instead of a pane

Three routes are closed, and these are measurements rather than preferences:

| Route | Measured result |
| --- | --- |
| `<iframe>` | `chat.deepseek.com` answers with `Content-Security-Policy: frame-ancestors 'none'`, so the browser refuses to render it in a frame |
| Electron `<webview>` | both desktop windows run with `webviewTag: false`, and `will-attach-webview` is explicitly blocked |
| The desktop app's own `WebContentsView` | reserved for platform pages (account/top-up) with navigation pinned to that origin; not reachable from a plugin |

A real window is therefore the only faithful way to show the official page.

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

1. Click the "DeepSeek 网页 / DeepSeek Web" entry in the sidebar.
2. Sign in to DeepSeek once in the window it opens; the session is kept afterwards.

A short toast in the corner reports the outcome.

## How it opens the page

Tried in order; the first that works wins, and the toast tells you which one it was:

1. **App window** — a window created by the DSH desktop process itself (the desktop app is Electron). An already-open one is focused instead of duplicated.
2. **Chromeless window** — Edge/Chrome in `--app=` mode with its own `--user-data-dir` (`~/.dsh/dsh-webchat/app-window`), so its login stays separate from your everyday browser. Used when (1) cannot reach Electron.
3. **System browser** — the fallback, so a click always does something.

None of the three needs configuration.

## Requirements

- DeepSeek Harness **0.2.0-rc.1 or a newer 0.2.x**
- Node.js >= 22
- Strategy 2 needs Edge or Chrome installed; strategy 1 does not

## Known limitations

- The DeepSeek web front end has its own rate limiting and sign-in flow; the plugin only hands the page over and does not mediate its requests.
- A strategy-1 window is owned by the DSH process: if you close the DSH main window while it is still open, DSH will not quit (Electron's `window-all-closed`). Close that window too.
- Reloading the plugin does not close a window that is already open — otherwise a settings change would close the conversation you are reading.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| The toast says `HTTP 404` | The host half in memory is an older version (the host half loads once per process; the client half is re-fetched on every page load). **Restart the desktop app** |
| The toast says it handed the page to the system browser | Strategies 1 and 2 were both unavailable — check whether the host refused a window, or whether Edge/Chrome is installed |
| The entry is missing from the sidebar | Check that `@jaychang1989/dsh-webchat` is in the profile's `dsh.profile.bundles`, then restart the desktop app |

## Development and tests

```bash
node --test
```

Thirteen cases: the host's two routes and its window-strategy selection, plus the browser half executed against a DOM stand-in (it mounts the entry, posts to the right route on click, and reports success, handoff and failure honestly).

There is no build step — `lib/index.js` and `lib/client.js` are the hand-written runtime, and the package has **zero runtime dependencies**. See [MAINTAINING.md](./MAINTAINING.md) (Chinese).

## Origin and license

[Apache-2.0](./LICENSE). This package started as a fork of [xmuwenxiang/dsh-web-chat](https://github.com/xmuwenxiang/dsh-web-chat): it reuses that project's plugin scaffolding (the dual-half packaging, the `cordis.patch.yml` row, the `window.__ModuleLoader__.load` bundle form) and its approach to injecting a sidebar entry, while the current behaviour — the window strategies, the entry-as-action, the toast — is new. See [NOTICE](./NOTICE) for the copyright and license statements.
