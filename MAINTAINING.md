# Maintaining this fork

## Why the fork exists

`xmuwenxiang/dsh-web-chat@0.2.0` is written against dsh **0.1.0-rc.7**. On dsh
**0.2.0-rc.1** its host half does not even import, so the profile reports:

```
dsh: warning: 1 entry did not activate
webchat (dsh-webchat): failed to import
```

The underlying failure is a link error, not an activation error — `dsh-app-boot`
only reports `error: "failed to import"` for a fiber that never got created, so
the real cause never reaches the GUI:

```
SyntaxError: The requested module '@deepseek-ai/dsh-settings'
does not provide an export named 'installSettingsSection'
```

## The two API migrations

### 1. Settings forms — `src/index.ts`, `lib/index.js`

dsh ≥ 0.1.7 owns settings forms: one per profile entry, namespace = the entry id
(`webchat`), schema = the entry module's exported `Config`, and a form write
re-applies the entry because the profile runs `patchReload: live`. The
plugin-side helpers were removed — `@deepseek-ai/dsh-settings` (0.2.0) exports
only `SettingsConflictError`, `SettingsForms` and `redactSecrets`.

So the fork **deletes** the `@deepseek-ai/dsh-settings` import, spells
`WEBCHAT_SETTINGS_NAMESPACE = 'dsh-webchat'` as a literal (it is now only the
plugin's own label — the browser half had always hard-coded the same string for
its locale namespace), and **deletes the `installSettingsSection(...)` call**.
The Loader-provided `config` is the single source of truth, and the single
`sync()` at the end of `apply` registers every surface.

### 2. Session persistence — `src/transfer.ts`, `lib/index.js`

dsh 0.2.x addresses session storage through **one handle per session**. The
service-level `load(id)` / `append(id, events)` pair is gone:

| retired | current |
| --- | --- |
| `persistence.load(id)` | `persistence.open(id, 'read' \| 'write')` → `SessionHandle` |
| `persistence.append(id, events)` | `handle.append(events)` on the handle |
| — | `handle.read(offset, length)` → `{ events }` |
| — | `handle.flush()` — durability barrier, materializes the artifact |
| — | `handle.close()` — releases the write lease, drains first |

`transferToHarnessSession` therefore opens a handle, reads the stored log
through it to learn the next contiguous `seq` / turn number, appends
`turn/start` + `step/start` + the user message, flushes, and closes in a
`finally`. The cold-create path uses `create(header)` → `handle.append` →
`handle.flush` → `handle.close` so the GUI lists the session and can resume it.
`flush` / `close` are called defensively (`typeof … === 'function'`) because the
seam declares them as optional for non-JSONL backends.

A session the GUI already holds refuses a second writer, so `open(id, 'write')`
failures are re-thrown as an actionable Chinese error instead of an opaque one.

## Shipped-build policy (known gap)

`lib/index.js` and `lib/client.js` are **committed build output** and are what a
git install runs; there is no `prepare` script, so a `github:` install never
builds anything.

The upstream npm tarball does not ship the build pipeline, and the host half of
this fork was rebuilt by editing the emitted bundle, so **`src/` and `lib/` must
be kept in sync by hand** for host-half changes. Two consequences worth knowing:

- The client half's **types** target the retired `@deepseek-ai/dsh-client-runtime`
  (last published at `0.1.1-rc.2`; it does not exist in 0.2.x), so the
  `src/client/**` sources cannot be type-checked against 0.2.x as written. The
  emitted `lib/client.js` is unaffected: it is a `window.__ModuleLoader__.load`
  factory whose only requirements are the browser baseline modules
  (`react`, `react-dom/client`, `react/jsx-runtime`).
- `dsh.client.inject` in package.json listed three packages from the 0.1.x client
  architecture. In 0.2.x `dsh-client-modules` still accepts the field but skips
  names that have no row, so the list was dropped rather than kept as dead
  configuration.

Restoring a real pipeline (tsdown + `tsc -p tsconfig.build.json` + lightningcss,
which is what upstream used) is the obvious next improvement.

## How the fix was verified

1. **Real ESM import against the 0.2.0-rc.1 packages.** The harness packages are
   packed inside the desktop app's `app.asar`; extracting them and importing the
   patched package from a directory that resolves them reproduces exactly what
   `dsh-app-boot`'s interception layer does at runtime:

   ```
   IMPORT OK; exports = Config,WEBCHAT_GUIDANCE,WEBCHAT_SETTINGS_NAMESPACE,apply,inject,name
   ```

   The same harness against the unpatched upstream file reproduces
   `does not provide an export named 'installSettingsSection'`.

2. **Every 0.2.x surface the plugin touches was checked against the runtime:**
   services `webServer` / `tools` / `systemPrompt` / `sessions` /
   `sessionPersistence` / `llm` / `workspaceRegistry` all exist,
   `systemPrompt.section({ name, order, text })` and
   `webServer.register({ kind: 'exact' | 'prefix', path, handler })` are
   unchanged, and `sessions.create(id, options)` still has its old shape.

3. **Not verified end to end:** `webchat_transfer` writes into real session
   storage, and exercising it needs a logged-in DeepSeek web session with a
   stored conversation. The migration follows the published seam contract and
   fails closed (the backend validates seq contiguity and refuses unknown
   vocabulary), but a live transfer has not been run.

## Testing a change

```bash
# unit tests: activation + the transfer handle paths against a fake backend
node --test

# import/link check against a real harness install
node -e "import('@jaychang1989/dsh-webchat').then(m => console.log(Object.keys(m)))"
```

then reinstall into a profile and restart the app:

```bash
dsh plugin --profile desktop add @jaychang1989/dsh-webchat     # npm
dsh plugin --profile desktop add github:jaychang1989/dsh-webchat  # or from git
```

## Renaming rules

The package name is read in exactly three places that must stay in step — the
manifest `name`, the `name` of the row in `cordis.patch.yml`, and the `id` in
the `window.__ModuleLoader__.load({...})` header of the emitted `lib/client.js`
(dsh-client-modules keys every browser row by the package name, and the bundle
registers its factory under the same id). Everything else that reads
`dsh-webchat` — `/api/dsh-webchat/*` routes, the `~/.dsh/dsh-webchat` data dir,
the `dsh-webchat` locale namespace, `data-dsh-webchat-*` attributes and the
effect labels — is the plugin's own identity and deliberately does not follow
the npm coordinate.

The npm package is scoped (`@jaychang1989/dsh-webchat`) because the unscoped
name belongs to the upstream project; `publishConfig.access: public` is what
makes a scoped package publish publicly rather than as a paid private one.

