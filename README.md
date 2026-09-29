# dsh-webchat

Codex-ChatGPT-mode style web chat for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): a real browser drives [chat.deepseek.com](https://chat.deepseek.com), so you chat with the DeepSeek web model through your own web login — **no API billing**. A conversation can be transferred into Harness: it is distilled into an executable task brief and opened as a new harness session, imported as markdown context, or continued by the harness agent through the same web session.

> **This is a maintained fork of [xmuwenxiang/dsh-web-chat](https://github.com/xmuwenxiang/dsh-web-chat).** The unmaintained upstream release **cannot start** on dsh 0.2.x. This fork retargets the plugin at the dsh 0.2.x plugin APIs. License stays Apache-2.0.
> See [MAINTAINING.md](./MAINTAINING.md) and [NOTICE](./NOTICE) for the exact difference.

## Difference from upstream

| Area | Upstream on dsh 0.2.x | This fork |
| --- | --- | --- |
| Startup | `installSettingsSection` and `settingsNamespace` were removed from `@deepseek-ai/dsh-settings` in dsh 0.1.7, so the host half fails at ESM link time and the whole `webchat` entry reports `failed to import` — the plugin never loads | Uses the Loader-owned settings form (namespace = profile entry id, schema = this package's exported `Config`); the plugin no longer registers a settings section |
| Transfer to Harness | `sessionPersistence.load(id)` and `persistence.append(id, events)` became a **handle-based** API in dsh 0.2.x, so the call throws | Migrated to the `SessionHandle` returned by `open(id, 'write')` / `create(header)`, using `handle.read` / `append` / `flush` / `close` |
| Dependency declarations | `devDependencies` pinned at `@deepseek-ai/*: ^0.1.0-rc.7` | Updated to 0.2.x, plus runtime `peerDependencies` and `engines.dsh` |

## Install

From npm (prebuilt — no build step, no `allowBuilds` approval):

```bash
dsh plugin --profile desktop add @jaychang1989/dsh-webchat
```

Or straight from this repository (also prebuilt, `lib/` is committed):

```bash
dsh plugin --profile desktop add github:jaychang1989/dsh-webchat
```

> The npm package is scoped because the unscoped `dsh-webchat` name belongs to the unmaintained upstream project. The plugin's own identity is unchanged by the scope: the entry id stays `webchat`, and so do the `/api/dsh-webchat` routes, the data directory and the locale namespace.

**Switching from upstream:** both packages insert the same `id: webchat` row, and one profile cannot hold the same entry id twice — boot fails on the duplicate. Remove the upstream package first (the Plugin Manager UI, or `dsh plugin --profile desktop remove dsh-webchat`), then add this one.

**Restart the DSH desktop app afterwards** — an entry that failed during startup is not hot-reloaded.

## First use

1. Open the "网页聊天 / Web chat" entry in the Web GUI sidebar.
2. Click "打开登录窗口" and complete the DeepSeek web login in the window that opens.
3. The window closes itself once you are logged in; chatting then runs headless.

## Features

- **Web chat** — reuses your DeepSeek web login, streams replies, with "deep think (R1)" and "smart search" toggles.
- **Transfer to Harness** — distill the current web conversation into a task brief and open it as a new harness session (first message is the brief), or continue an existing session by appending the brief to it; the transfer can target a registered workspace.
- **Recover from the web** — pull web-side conversations that are not in the local store yet (panel button / `webchat_recover`).
- **Import as context** — export a stored web conversation as markdown context.
- **Agent tools** — `webchat_status`, `webchat_send`, `webchat_recover`, `webchat_import`, `webchat_transfer`, callable by the harness agent directly.
- **Effortless login** — the login window is visible once, then closes itself; chatting afterwards is headless.

## Configuration

The settings form follows the profile entry (`webchat`) and is generated from this package's `Config`: `browserChannel` (default `auto`), `browserExecutablePath`, `browserProxy`, `browserHeadless` (default `true` — the login window is always visible and closes itself), `replyTimeoutMs`, `transferDistill` / `transferProvider` / `transferModel` (distillation model for transfers), `transferMaxTokens` (final brief cap, default 4096), `transferChunkTokens` (per-chunk cap for long conversations, default 1024).

## Requirements

- DeepSeek Harness **0.2.0-rc.1 or a newer 0.2.x**
- Node.js >= 22
- Google Chrome or Microsoft Edge installed
- An interactive desktop for the one-time login window

## Limitations

- The DeepSeek web front end is rate-limited and can change; failures return errors instead of crashing.
- Credentials and session data live in a local private directory (the profile) — do not share it.
- "Continue an existing session" on dsh 0.2.x needs that session to be free of another writer (for example it must not be open in the GUI holding the write lease). A taken session returns an explicit error rather than failing silently.

## Development

`lib/` is committed as the shipped build and is what a git install runs. Host-half changes must be mirrored in `src/` and `lib/` until the build pipeline is restored — see [MAINTAINING.md](./MAINTAINING.md).

```bash
node --test        # unit tests (Node's built-in test runner)
```

## License

[Apache-2.0](./LICENSE). Original copyright belongs to the authors of [xmuwenxiang/dsh-web-chat](https://github.com/xmuwenxiang/dsh-web-chat); see [NOTICE](./NOTICE).
