# Maintaining this fork

## What this package is now

A launcher. `0.3.x` drove chat.deepseek.com with Playwright and re-rendered the
conversation in a custom React panel; `0.4.0` deletes all of that and opens the
official page in a window instead. Nothing but the launcher survived.

Two hard constraints forced the shape, and both are measurements, not choices:

- `chat.deepseek.com` answers with `Content-Security-Policy: frame-ancestors 'none'`
  — no iframe can host it;
- the DSH desktop build runs its windows with `webviewTag: false` and blocks
  `will-attach-webview` — no `<webview>` either.

The desktop shell does own a `WebContentsView`, but it is reserved for platform
pages (`--dsh-platform-origin=<account.origin>`, navigation restricted to that
origin), so it is not a route to an arbitrary URL.

## Layout and build policy

There is **no build step**. `lib/index.js` and `lib/client.js` are the
hand-written runtime and the source of truth; there is no `src/`, no bundler
and no toolchain. The package therefore has **zero runtime dependencies**.

```
lib/index.js        host half  — two routes + the window strategies
lib/client.js       browser half — the sidebar entry and its toast, plain DOM
cordis.patch.yml    the profile row
test/*.test.mjs     node --test
```

`package.json` pins the two halves: `exports["."]` → `lib/index.js`,
`exports["./client"]` → `lib/client.js`, `dsh.bundle.patch` → `cordis.patch.yml`,
`dsh.client.platform` → `web`.

## The host half

`inject: ['webServer']`; `apply(ctx)` registers exactly two exact routes:

| route | method | answer |
| --- | --- | --- |
| `/api/dsh-webchat/state` | GET | `{ ok, url, appWindowOpen, last }` |
| `/api/dsh-webchat/open` | POST | `{ ok, via, error, at }`, 502 when nothing opened |

`openPage(strategies)` walks `OPEN_STRATEGIES` and records the winner. The list
is a parameter so the tests can drive it without spawning anything. Strategies:

1. `app-window` — `await import('electron')` then `new BrowserWindow(...)`. The
   import is **dynamic and inside the call** on purpose: a host with no Electron
   must still load the plugin, and a failed probe has to fall through to the next
   strategy rather than kill the entry at import time.
2. `app-window-shell` — `msedge.exe`/`chrome.exe` with `--app=` and a private
   `--user-data-dir` under `~/.dsh/dsh-webchat/app-window`.
3. `system-browser` — `cmd /c start`, `open`, or `xdg-open`.

The window handle lives on `globalThis[Symbol.for('@jaychang1989/dsh-webchat.window')]`
rather than in module state, so a live profile reload still finds the open
window instead of stacking a second one.

Deliberate: the plugin does **not** close the window on dispose. A settings
change re-applies the entry, and closing the user's conversation for that would
be worse than leaving an orphan window.

## The browser half

The bundle is a module-loader factory — no React, no imports:

```js
window.__ModuleLoader__.load({
  id: '<package name>',
  factory: () => { /* … */ return module.exports },  // { apply, inject }
})
```

**The `id` must equal the package name verbatim**, scoped names included:
`dsh-client-modules` keys every browser row by the manifest name and materializes
that id, so a mismatch means the panel silently never loads. `cordis.patch.yml`'s
row `name` has to match too. Those three are the only places the package name is
encoded; the `/api/dsh-webchat` paths, the `dsh-webchat` locale label and the
`data-dsh-webchat-*` attributes are the plugin's own identity and do not follow
it.

The shell exposes no slot an external plugin can register into, so the entry
row is injected at the DOM level and self-heals against React re-renders:

- **Sidebar entry** — a `<button data-dsh-webchat-entry>` placed after the New
  Session row inside the sidebar root (`[data-pane="sidebar"], [class*="sidebarCol"]`),
  with a body-level `MutationObserver` to notice a rebuilt pane and a root-level
  one to re-insert the row when React displaces it.
- **Clicking it** POSTs `/api/dsh-webchat/open` and shows the outcome in a
  `<div data-dsh-webchat-toast>` that removes itself (three seconds, eight on
  failure). The entry disables itself and swaps its label to a busy string while
  the request is in flight, so a slow strategy cannot be double-clicked.

There is deliberately **no panel**: the page cannot live in this window, so a
panel would only be a picture of a button. The old center-column takeover (the
`data-dsh-webchat-active` attribute, the injected hide rules for the column's
other children, and the `dsh-panel-activate` arbitration against the task board
and ssh panels) went with it in 0.4.1.

The stylesheet is injected as one `<style id="dsh-webchat-style">` built from the
`CSS` array in `lib/client.js`; it rides the shell's `--dsw-*` tokens so the
entry and the toast follow the active theme.

## Testing

```bash
node --test
```

Thirteen cases: the host half is driven with a fake context and fake
request/response objects (routes, method guards, strategy selection), and the
browser half is executed with `vm` against a minimal DOM stand-in
(`test/client.test.mjs`) that covers exactly the calls the bundle makes — enough
to prove it mounts the entry, that clicking it posts to the right route, and
that success, handoff and failure (including a bare `HTTP 404` from an older host
half) each reach the toast instead of being swallowed.

## Not verifiable from outside the app

`app-window` needs Electron's `BrowserWindow` in the plugin's own process. The
desktop app does run its cordis loader in the Electron main process and imports
`BrowserWindow` there itself, so the strategy is expected to work, but it cannot
be exercised without restarting the desktop app — the fallbacks exist precisely
because that expectation is untested here. The panel reports which strategy ran,
so the first click answers it.

Also known: a strategy-1 window is counted by Electron's `window-all-closed`, so
closing the DSH main window while it is open leaves DSH running until that window
closes too.

## History

The package began as a fork of `xmuwenxiang/dsh-web-chat@0.2.0`, which targets
dsh 0.1.0-rc.7 and cannot start on 0.2.x (`installSettingsSection` /
`settingsNamespace` were removed from `@deepseek-ai/dsh-settings` in 0.1.7, so
the host half failed at ESM link time). `0.3.0` retargeted it — the Loader-owned
settings form, and the handle-based `sessionPersistence` API
(`open`/`create` → `SessionHandle` `read`/`append`/`flush`/`close`). `0.4.0`
removed everything except the launcher, as described above.
