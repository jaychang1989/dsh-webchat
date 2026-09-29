# dsh-webchat

Opens the official [chat.deepseek.com](https://chat.deepseek.com) web app from inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): one sidebar entry, one button, and the official page itself.

**It no longer reimplements the chat UI.** The official web app is the client — model picker, deep think, smart search, history and attachments all live there. This plugin opens it and nothing else.

## Why a window, and not a pane

Both embedding routes are closed, and that is a measurement rather than a choice:

- `chat.deepseek.com` answers with **`Content-Security-Policy: frame-ancestors 'none'`**, so no iframe can host it;
- the desktop build runs both windows with **`webviewTag: false`** and blocks `will-attach-webview`, so `<webview>` is unavailable too.

A real window is therefore the only faithful way to show the official page.

## What opens, in order

The button tries these in order and reports which one worked:

1. **`app-window`** — a window created by the DSH desktop process itself (the desktop app is Electron). An already-open one is focused instead of duplicated.
2. **`app-window-shell`** — a chromeless Edge/Chrome window (`--app=`) with its own `--user-data-dir` (`~/.dsh/dsh-webchat/app-window`), so its login stays separate from your everyday browser. Used when the host refuses (1).
3. **`system-browser`** — handed to the OS default browser, so the button always does something.

Sign in once; the window's own profile keeps the session.

## Install

```bash
dsh plugin --profile desktop add @jaychang1989/dsh-webchat
```

Or straight from this repository:

```bash
dsh plugin --profile desktop add github:jaychang1989/dsh-webchat
```

> The npm package is scoped because the unscoped `dsh-webchat` name belongs to the unmaintained upstream project. The scope does not change the plugin's identity: the entry id stays `webchat`.

**Switching from upstream, or from this plugin's 0.3.x:** all of them insert the same `id: webchat` row, and one profile cannot hold the same entry id twice — boot fails on the duplicate. Remove the old package first, then add this one, then restart the desktop app.

## Use

1. Click the "DeepSeek 网页 / DeepSeek Web" entry in the sidebar.
2. Click "Open chat.deepseek.com" in the panel.
3. Sign in once in the window it opens; afterwards just use the official web app.

## Difference from 0.3.x — this release deletes most of the plugin

| 0.3.x | 0.4.0 |
| --- | --- |
| Drove the page with Playwright and re-rendered messages in a custom panel | Does not drive the page; opens it. Custom panel removed |
| Five agent tools (`webchat_status/send/recover/import/transfer`) | All removed |
| "Transfer to Harness", "recover from web", "import", "export" | All removed |
| Local transcript store at `~/.dsh/dsh-webchat/transcripts.json` | Removed (only the window profile directory remains) |
| Fifteen `/api/dsh-webchat/*` routes | Two: `state` and `open` |
| Depended on `playwright-core`; the client half needed React and a bundler | **No runtime dependencies**; plain-DOM client, no build step |
| ~3800 lines of build output | ~700 lines of hand-written JS |

## Requirements

- DeepSeek Harness **0.2.0-rc.1 or a newer 0.2.x**
- Node.js >= 22
- Strategy 2 needs Edge or Chrome installed; strategy 1 does not

## Limitations

- The DeepSeek web front end applies its own rate limiting; the plugin hands the page over and does not mediate its login or requests.
- A strategy-1 window is owned by the DSH process: if you close the DSH main window while it is still open, DSH will not quit (Electron's `window-all-closed`). Close that window too.
- Reloading the plugin does not close a window that is already open, so a settings change cannot close the conversation you are reading.

## Development and tests

```bash
node --test        # 11 cases: host routes, window-strategy selection, and the browser half mounted into a DOM stand-in
```

There is no build step: `lib/index.js` and `lib/client.js` are the hand-written runtime. See [MAINTAINING.md](./MAINTAINING.md).

## License

[Apache-2.0](./LICENSE). Original copyright belongs to the authors of [xmuwenxiang/dsh-web-chat](https://github.com/xmuwenxiang/dsh-web-chat); see [NOTICE](./NOTICE).
