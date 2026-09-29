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

The sidebar row and the page are both standard DSH **slots** (`sidebar.panellist` and `main`, joined by one shared id), so the shell owns the button and the panel switching. That is why this plugin injects nothing into anyone else's DOM and never has to guess when to step aside.

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

1. Click the "Chat DeepSeek" entry — the page loads in the center column; there is no second click.
2. Sign in to DeepSeek once — the plugin keeps that login across restarts (see below).

Click again to collapse the panel. Switching to another panel (Plugins, Automation Tasks, the task board, a session …) only hides the guest, never unmounts it, so coming back neither reloads the page nor drops the session.

## Requirements

- DeepSeek Harness **0.2.0-rc.1 or a newer 0.2.x**
- Node.js >= 22
- The desktop app: only it provides the native guest bridge; plain `dsh web` uses the window fallback

## Staying signed in

The host hands browser guests a **process-lifetime** partition (a fresh random name per run, with no `persist:` prefix), so cookies and site storage would die with the app — DSH's own side-card browser behaves the same way. This plugin takes that over through **two channels**, because the host half does not always reach Electron:

1. **Site storage** (localStorage) and the **page's own cookies**: carried by the guest itself, generically — no key names, no Electron.
2. **Partition cookies, HttpOnly included**: only the Electron main process can read those. Used when reachable; `session.electron` in `GET /api/dsh-webchat/state` says plainly whether it is.

The order: reserve the lease → restore first (cookies land before the first navigation, so the page's very first request already carries them) → write storage and the page's cookies once the first load finishes → reload once → snapshot as the page is used.

- Location: `%USERPROFILE%\.dsh\dsh-webchat\session.json`
- **Deleting that file logs the plugin's guest out** — it keeps nothing else behind.
- The file holds live session credentials in **plain text**. It sits in your own profile directory (user-private by default), but it is not as protected as a browser's encrypted cookie store.
- If DeepSeek keeps the session in an HttpOnly cookie *and* the host half cannot reach Electron, only the storage part can be kept — signing in again would then still happen.

## Known limitations

- The DeepSeek web front end has its own rate limiting and sign-in flow; the plugin only hosts it and keeps the session, and does not mediate its requests.
- Links the page opens are handled inside the guest; the plugin adds no navigation policy of its own.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| No "Chat DeepSeek" row in the sidebar | Check that `@jaychang1989/dsh-webchat` is in the profile's `dsh.profile.bundles`, then restart the desktop app |
| The center column says "载入失败：…" | The host refused the guest (the bridge threw). The text carries the host's reason |
| The row opens a browser window instead of a panel | This renderer had no `dshDesktop.browser` (a plain web profile, for instance), so the fallback ran |
| The row opens but the center column is blank | The panel fills the cell the shell allocates; in a very small window, or with the sidebar dragged extremely narrow, that cell can have no area |
| It asks for a login again after a restart | Check `session` in `GET /api/dsh-webchat/state`: an `electron` value other than `ready` means the host half cannot reach Electron (so nothing can be saved), and `saved: null` means no snapshot exists yet. Use the page for a moment and look again ~30s later |
| You want to sign out for good | Delete `%USERPROFILE%\.dsh\dsh-webchat\session.json` |
| The page shows "Abnormal usage environment" | DeepSeek's front end checks `navigator.userAgent` for the string `electron` — which the desktop default carries — and then recommends its official product. Since 0.5.2 the guest presents a plain Chrome user agent and the dialog no longer appears |

## Development and tests

```bash
node --test
```

Thirty-four cases. The host half is driven through a fake context, fake request/response objects and injectable Electron/cookie stand-ins: the snapshot round-trip through disk, cookie capture and restore (HttpOnly included, one refused cookie not aborting the rest), the session routes' method guards and partition validation, and a host without Electron reporting why without hurting the page. The browser half really executes against a thin React test double plus a DOM stand-in: the slot contract (one shared id, order, the label thunk, the icon honouring the requested size), the lease and the `about:blank#<lease>` webview, the user agent landing before navigation, **hiding the guest without detaching it on unmount and reusing it on remount**, the login restore writing storage once and reloading once, snapshots while in use and on disposal, and the window fallback.

There is no build step — `lib/index.js` and `lib/client.js` are the hand-written runtime, and the package has **zero runtime dependencies**. The guest mechanism is written up in [MAINTAINING.md](./MAINTAINING.md) (Chinese).

## Origin and license

[Apache-2.0](./LICENSE). This package started as a fork of [xmuwenxiang/dsh-web-chat](https://github.com/xmuwenxiang/dsh-web-chat): it reuses that project's plugin scaffolding (the dual-half packaging, the `cordis.patch.yml` row, the `window.__ModuleLoader__.load` bundle form) and its approach to injecting a sidebar entry, while the current behaviour — the in-window guest panel, the window fallback chain, the entry-as-action — was written here. See [NOTICE](./NOTICE) for the copyright and license statements.
