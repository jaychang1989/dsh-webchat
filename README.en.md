# dsh-webchat

[简体中文](./README.md) | **English**

Opens the official [chat.deepseek.com](https://chat.deepseek.com) web app inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — **click the sidebar entry and the page renders in the DSH window itself**, filling the center column like the Automation Tasks page does.

No chat UI is reimplemented: model picker, deep think, smart search, history and attachments are all the official ones.

## How it can render inside the window

The obvious routes really are closed:

| Route | Result |
| --- | --- |
| `<iframe>` | the site answers `Content-Security-Policy: frame-ancestors 'none'`, so the browser refuses |
| A plain `<webview>` | the desktop build disables the tag and blocks `will-attach-webview` |

But the desktop shell keeps a door open for **approved browser guests**: the renderer asks `globalThis.dshDesktop.browser` for a lease, and the shell approves exactly the `<webview>` whose `src` is `about:blank#<lease>` and whose `partition` matches — everything else stays blocked. This is the mechanism the built-in side-card browser uses; this plugin takes the same channel.

So the page is **not an iframe** — it is a native guest owned by the host, which is why `frame-ancestors` does not apply to it. It also means the desktop app is what makes it possible.

Where that bridge is absent (a plain `dsh web` profile) the plugin **falls back** to opening a window, so the entry always does something.

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

1. Click the "DeepSeek 网页 / DeepSeek Web" entry — the page loads in the center column; there is no second click.
2. Sign in to DeepSeek once; that holds for the rest of the run.

Click again to collapse the panel. The guest stays mounted while the panel is closed, so reopening neither reloads the page nor drops the session. Clicking **any other sidebar row** — Plugins, Automation Tasks, the task board, a session, a workspace — hands the center column back, because those pages are rendered there by the shell and this plugin does not hold their seat.

## Requirements

- DeepSeek Harness **0.2.0-rc.1 or a newer 0.2.x**
- Node.js >= 22
- The desktop app: only it provides the native guest bridge; plain `dsh web` uses the window fallback

## Known limitations

- **Restarting the desktop app means signing in to DeepSeek again.** The host hands out a **process-lifetime** guest partition (a fresh random name per run, with no `persist:` prefix), so the session is not written to disk. That is the host's mechanism, not a choice this plugin makes.
- The DeepSeek web front end has its own rate limiting and sign-in flow; the plugin only hosts it and does not mediate its requests.
- Links the page opens are handled inside the guest; the plugin adds no navigation policy of its own.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| The entry is missing | Check that `@jaychang1989/dsh-webchat` is in the profile's `dsh.profile.bundles`, then restart the desktop app |
| The center column says "载入失败：…" | The host refused the guest (the bridge threw). The text carries the host's reason |
| Clicking the entry opened a browser window instead | This renderer had no `dshDesktop.browser` (a plain web profile, for instance), so the fallback ran |
| It asks for a login again after a restart | See the limitations above — it is the host's partition behaviour |
| The page shows "Abnormal usage environment" | DeepSeek's front end checks `navigator.userAgent` for the string `electron` — which the desktop default carries — and then recommends its official product. Since 0.5.2 the guest presents a plain Chrome user agent and the dialog no longer appears |

## Development and tests

```bash
node --test
```

Fourteen cases, and the browser half really executes against a DOM stand-in: in a desktop environment it checks that the entry mounts, that clicking reserves a lease, that the webview is built the way the host requires (`about:blank#<lease>`), that navigation happens on `dom-ready`, and that closing and reopening reuses the same guest; without a bridge it checks the window fallback and its reporting.

There is no build step — `lib/index.js` and `lib/client.js` are the hand-written runtime, and the package has **zero runtime dependencies**. The guest mechanism is written up in [MAINTAINING.md](./MAINTAINING.md) (Chinese).

## Origin and license

[Apache-2.0](./LICENSE). This package started as a fork of [xmuwenxiang/dsh-web-chat](https://github.com/xmuwenxiang/dsh-web-chat): it reuses that project's plugin scaffolding (the dual-half packaging, the `cordis.patch.yml` row, the `window.__ModuleLoader__.load` bundle form) and its approach to injecting a sidebar entry, while the current behaviour — the in-window guest panel, the window fallback chain, the entry-as-action — was written here. See [NOTICE](./NOTICE) for the copyright and license statements.
