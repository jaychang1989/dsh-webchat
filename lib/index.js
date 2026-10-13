/**
 * dsh-webchat — host half.
 *
 * Two jobs:
 *
 * 1. **Session survival.** The browser half renders chat.deepseek.com inside
 *    the DSH window through the shell's native browser guest, and the shell
 *    gives every guest a process-lifetime partition — so the DeepSeek login is
 *    gone after every restart. This half runs in the Electron main process, the
 *    only place that can read a partition's cookies (HttpOnly ones included),
 *    so it snapshots them to disk and puts them back on the next run. The
 *    browser half captures the page's own storage and calls these routes.
 *
 * 2. **A window fallback.** Where no guest bridge exists (a plain `dsh web`
 *    profile) the page cannot be embedded at all, so the browser half asks this
 *    half to open it in a window. Three strategies are tried in order:
 *      - `app-window`       — a BrowserWindow created by this process (the DSH
 *                             desktop app is Electron), focused instead of
 *                             duplicated when one is already open;
 *      - `app-window-shell` — a chromeless Edge/Chrome window (`--app=`) with
 *                             its own user-data-dir;
 *      - `system-browser`   — the OS default browser.
 *
 * Routes: `GET /state` (diagnostics), `POST /open` (the fallback),
 * `POST /session/restore` and `POST /session/save` (the snapshot).
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/**
 * A CommonJS `require` anchored at this module. Electron hands `electron` to
 * CJS natively, while the harness's ESM loader resolves bare specifiers itself
 * — which is why the ESM import below is tried first and this is the fallback.
 */
const requireHere = createRequire(import.meta.url)

/** Stable cordis plugin name. */
export const name = 'webchat'

/** The web server is the only service this launcher needs. */
export const inject = ['webServer']

/** The page this plugin exists to open. */
export const PAGE_URL = 'https://chat.deepseek.com/'

/** Route family; the browser half spells the same paths. */
export const ROUTES = {
  state: '/api/dsh-webchat/state',
  open: '/api/dsh-webchat/open',
  restore: '/api/dsh-webchat/session/restore',
  save: '/api/dsh-webchat/session/save',
  external: '/api/dsh-webchat/external',
}

/**
 * The shell hands browser guests a **process-lifetime** session partition
 * (`dsh-sidebar-browser-<uuid>`, no `persist:` prefix, fresh name every run), so
 * cookies and site storage die with the app — DSH's own side-card browser
 * behaves the same way. The plugin cannot ask for another partition: the main
 * process compares `params.partition` against the lease it issued.
 *
 * So this half keeps the guest's session alive across restarts by hand. It runs
 * in the Electron main process, which is what makes it possible at all: only
 * there can `session.cookies` be read, and that includes HttpOnly cookies, which
 * a renderer can never see. Site storage is captured by the browser half.
 *
 * The snapshot holds live session credentials in plain text under the DSH home
 * (a user-private location, and the one root a `DSH_HOME` setup backs up as a
 * whole). Deleting the file logs the plugin's guest out.
 */

/**
 * Expand a leading `~` prefix against the OS home, as the harness's own home
 * helper accepts it.
 * @param path - a path that may begin with `~`, `~/`, or `~\`.
 * @returns the expanded path, or the input unchanged.
 */
function expandHome(path) {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/**
 * The single DSH home root, resolved the way the harness itself resolves it
 * (`@deepseek-ai/dsh-home-paths`): `$DSH_HOME` when set to a non-blank value —
 * the harness keeps all user data directly under that root, without a second
 * `.dsh` — otherwise `~/.dsh`. An empty or blank `DSH_HOME` counts as unset, so
 * a blank override never resolves to the current directory (#4).
 * @param env - environment mapping; defaults to `process.env` (test seam).
 * @returns the normalized absolute harness home path.
 */
export function dshHome(env = process.env) {
  const fromEnv = env.DSH_HOME
  const override = fromEnv !== undefined && fromEnv.trim().length > 0 ? expandHome(fromEnv) : undefined
  return resolve(override ?? join(homedir(), '.dsh'))
}

export const SESSION_FILE = () => sessionFilePath === null
  ? join(dshHome(), 'dsh-webchat', 'session.json')
  : sessionFilePath

/** Overridable snapshot path, so tests never touch the real profile directory. */
let sessionFilePath = null

/** Point the snapshot somewhere else. Test seam; production leaves it unset. */
export function setSessionFile(path) {
  sessionFilePath = path
}

/**
 * Where snapshots lived before they followed `$DSH_HOME` (#4). A plugin that
 * predates the fix wrote here unconditionally, so an upgrade would otherwise
 * lose the login once.
 * @returns the legacy snapshot path.
 */
function legacySessionFile() {
  return legacySessionFilePath ?? join(homedir(), '.dsh', 'dsh-webchat', 'session.json')
}

/** Overridable legacy snapshot path, so tests never touch the real profile. */
let legacySessionFilePath = null

/** Point the legacy snapshot somewhere else. Test seam; production leaves it unset. */
export function setLegacySessionFile(path) {
  legacySessionFilePath = path
}

/**
 * Read the session snapshot, carrying a pre-#4 copy over first. Migration only
 * runs on the production default path, never overwrites a snapshot that already
 * exists at the unified location, and keeps the legacy file itself — deleting
 * user data is not this plugin's call. A corrupt or missing legacy file is
 * simply ignored.
 * @param file - the effective snapshot path.
 * @returns the snapshot, or null when there is nothing usable on disk.
 */
export function readSessionSnapshot(file) {
  if (sessionFilePath === null && resolve(file) !== resolve(legacySessionFile())) {
    try {
      if (existsSync(file) === false) {
        const legacy = readSnapshot(legacySessionFile())
        if (legacy !== null && (legacy.cookies.length > 0 || legacy.storage.length > 0 || legacy.cookie !== '')) {
          writeSnapshot(file, legacy)
        }
      }
    } catch {
      // Best effort: a failed migration costs one re-login, never the page.
    }
  }
  return readSnapshot(file)
}

/** Overridable Electron lookup, so the routes' glue is testable outside Electron. */
let electronLoader = null

/** Replace the Electron lookup. Test seam; production leaves it unset. */
export function setElectronLoader(loader) {
  electronLoader = loader
}

/** The opener behind the external-link route; test seam overrides it. */
let externalOpener = null

/** Replace the system-browser opener. Test seam; production leaves it unset. */
export function setExternalOpener(opener) {
  externalOpener = opener
}

/** A partition name the shell issues for a browser guest, and nothing else. */
const GUEST_PARTITION = /^dsh-sidebar-browser-[0-9a-f-]{8,}$/

/** Electron reachability, probed once and reported through the state route. */
let electronStatus = 'unknown'

/** Read a JSON request body; a malformed or oversized body reads as null. */
function readJsonBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        req.destroy()
        resolve(null)
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (error) {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

/**
 * Read the saved snapshot.
 * @param file - snapshot path.
 * @returns the snapshot, or null when there is nothing usable on disk.
 */
export function readSnapshot(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed === null || typeof parsed !== 'object') return null
    return {
      cookies: Array.isArray(parsed.cookies) ? parsed.cookies : [],
      storage: Array.isArray(parsed.storage) ? parsed.storage : [],
      // The page's own `document.cookie` string, kept by the browser half. It
      // cannot carry HttpOnly cookies, but it is what survives when this process
      // has no Electron session API at all.
      cookie: typeof parsed.cookie === 'string' ? parsed.cookie : '',
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    }
  } catch (error) {
    return null
  }
}

/** Write the snapshot atomically, user-private, so a crash cannot truncate it. */
export function writeSnapshot(file, snapshot) {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 })
  renameSync(temp, file)
}

/**
 * Copy saved cookies onto a partition's session.
 * @param cookies - `session.cookies` of the live partition.
 * @param snapshot - a snapshot from {@link readSnapshot}.
 * @returns how many cookies the session accepted.
 */
export async function restoreCookies(cookies, snapshot) {
  let restored = 0
  for (const cookie of snapshot.cookies) {
    if (cookie === null || typeof cookie !== 'object') continue
    if (typeof cookie.name !== 'string' || typeof cookie.value !== 'string') continue
    const domain = typeof cookie.domain === 'string' ? cookie.domain : ''
    if (domain === '') continue
    const path = typeof cookie.path === 'string' && cookie.path !== '' ? cookie.path : '/'
    const details = {
      url: `${cookie.secure === true ? 'https' : 'http'}://${domain.replace(/^\./, '')}${path}`,
      name: cookie.name,
      value: cookie.value,
      domain,
      path,
      secure: cookie.secure === true,
      httpOnly: cookie.httpOnly === true,
    }
    if (typeof cookie.expirationDate === 'number') details.expirationDate = cookie.expirationDate
    if (typeof cookie.sameSite === 'string') details.sameSite = cookie.sameSite
    try {
      await cookies.set(details)
      restored += 1
    } catch (error) {
      // A cookie the running Electron refuses (bad domain, expired, …) is not
      // worth failing the whole restore for.
    }
  }
  return restored
}

/**
 * Serialize a partition's cookies, HttpOnly ones included.
 * @param cookies - `session.cookies` of the live partition.
 * @returns plain objects safe to write to disk.
 */
export async function captureCookies(cookies) {
  const list = await cookies.get({})
  return list.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure === true,
    httpOnly: cookie.httpOnly === true,
    ...(typeof cookie.expirationDate === 'number' ? { expirationDate: cookie.expirationDate } : {}),
    ...(typeof cookie.sameSite === 'string' ? { sameSite: cookie.sameSite } : {}),
  }))
}

/**
 * The live session of a guest partition, through the Electron main process.
 * @param partition - the partition name the shell issued for the lease.
 * @returns the Electron session.
 * @throws when this process cannot reach Electron or refuses the partition.
 */
async function partitionSession(partition) {
  if (!GUEST_PARTITION.test(partition)) throw new Error('dsh-webchat: not a browser-guest partition')
  const electron = await electronApi()
  if (electron.session === undefined) throw new Error('dsh-webchat: this process exposes no Electron session API')
  return electron.session.fromPartition(partition)
}

/**
 * Probe Electron once, for the state route's diagnostics.
 * @returns a short status string.
 */
export async function electronProbe() {
  try {
    const electron = await electronApi()
    electronStatus = electron.session === undefined ? 'no session API' : 'ready'
  } catch (error) {
    electronStatus = messageOf(error)
  }
  return electronStatus
}

/**
 * The app-owned window handle lives on a process-wide slot rather than in
 * module state: a live profile reload would otherwise hand the next module
 * instance a fresh `null` and orphan the open window, so every re-open would
 * stack another one.
 */
const WINDOW_SLOT = Symbol.for('@jaychang1989/dsh-webchat.window')

/** The mutable window slot, created on first use. */
function windowSlot() {
  const existing = globalThis[WINDOW_SLOT]
  if (existing !== undefined) return existing
  const created = { current: null }
  globalThis[WINDOW_SLOT] = created
  return created
}

/** Last open attempt, reported to the panel. */
let lastAttempt = { ok: false, via: 'none', error: '', at: 0 }

/** Every strategy's outcome from the most recent open, oldest first. */
let lastAttempts = []

/**
 * Remember one attempt.
 * @param ok - whether the page was opened.
 * @param via - the strategy that ran, or the last one that failed.
 * @param error - failure detail, when there is one.
 * @returns the recorded attempt.
 */
function record(ok, via, error = '') {
  lastAttempt = { ok, via, error, at: Date.now() }
  return lastAttempt
}

/** Render any thrown value as a message. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Load Electron lazily, two ways. A plugin that cannot reach it must still
 * load, and the probe stays inside the call so a failure falls through to the
 * next strategy instead of killing the entry at import time.
 *
 * The ESM import is tried first because it is the honest form; the harness's
 * loader resolves bare specifiers itself and does not always hand `electron`
 * to Electron's own resolver, so a CommonJS require — which Electron serves
 * natively — is the fallback.
 *
 * Either `BrowserWindow` (the window strategy) or `session` (the guest session
 * snapshot) makes the module usable, so the two callers check their own need.
 * @returns the Electron module.
 * @throws with every probe failure joined, when neither path yields Electron.
 */
async function electronApi() {
  if (electronLoader !== null) return electronLoader()
  // Electron's ESM namespace can carry the real API under `default` when its
  // named exports are not statically detectable, and this loader hands back
  // exactly that shape, so both forms are accepted.
  const usable = (mod) => {
    if (mod === null || typeof mod !== 'object') return undefined
    if (mod.BrowserWindow !== undefined || mod.session !== undefined) return mod
    const inner = mod.default
    if (inner !== null && typeof inner === 'object'
      && (inner.BrowserWindow !== undefined || inner.session !== undefined)) return inner
    return undefined
  }
  const failures = []
  try {
    const fromImport = usable(await import('electron'))
    if (fromImport !== undefined) return fromImport
    failures.push('esm import resolved but exposed neither BrowserWindow nor session')
  } catch (error) {
    failures.push(`esm import failed: ${messageOf(error)}`)
  }
  try {
    const fromRequire = usable(requireHere('electron'))
    if (fromRequire !== undefined) return fromRequire
    failures.push('cjs require resolved but exposed neither BrowserWindow nor session')
  } catch (error) {
    failures.push(`cjs require failed: ${messageOf(error)}`)
  }
  throw new Error(failures.join(' | '))
}

/** Windows chromeless-window executables, in preference order. */
const SHELL_CANDIDATES = [
  ['ProgramFiles', 'Microsoft/Edge/Application/msedge.exe'],
  ['ProgramFiles(x86)', 'Microsoft/Edge/Application/msedge.exe'],
  ['LOCALAPPDATA', 'Microsoft/Edge/Application/msedge.exe'],
  ['ProgramFiles', 'Google/Chrome/Application/chrome.exe'],
  ['ProgramFiles(x86)', 'Google/Chrome/Application/chrome.exe'],
  ['LOCALAPPDATA', 'Google/Chrome/Application/chrome.exe'],
]

/**
 * Locate an Edge/Chrome executable for the chromeless fallback.
 * @returns the executable path, or undefined when neither is installed.
 */
export function shellExecutable() {
  const fixed = process.platform === 'darwin'
    ? ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : process.platform === 'linux'
      ? ['/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium']
      : []
  for (const candidate of fixed) if (existsSync(candidate)) return candidate
  for (const [env, relative] of SHELL_CANDIDATES) {
    const root = process.env[env]
    if (root === undefined || root === '') continue
    const candidate = join(root, ...relative.split('/'))
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/** Directory holding the chromeless window's own profile (so login persists). */
function shellProfileDir() {
  // Same unified DSH home root as the snapshot (#4): the old spelling stacked
  // a second `.dsh` under `$DSH_HOME`, a place no other DSH data ever used.
  // The old profile directory is not migrated — this fallback needs one
  // re-login.
  return join(dshHome(), 'dsh-webchat', 'app-window')
}

/** Open — or focus — a window owned by this process. */
async function openAppWindow() {
  const electron = await electronApi()
  const { BrowserWindow } = electron
  if (BrowserWindow === undefined) throw new Error('this process exposes no Electron BrowserWindow')
  const slot = windowSlot()
  if (slot.current !== null && slot.current.isDestroyed() === false) {
    slot.current.focus()
    return 'app-window (focused)'
  }
  const window = new BrowserWindow({
    width: 1200,
    height: 860,
    autoHideMenuBar: true,
    title: 'DeepSeek',
    backgroundColor: '#ffffff',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false },
  })
  slot.current = window
  window.on('closed', () => {
    if (slot.current === window) slot.current = null
  })
  await window.loadURL(PAGE_URL)
  window.focus()
  return 'app-window'
}

/** Open a chromeless Edge/Chrome window with its own profile. */
async function openShellWindow() {
  const executable = shellExecutable()
  if (executable === undefined) throw new Error('no Edge or Chrome installation found')
  const child = spawn(executable, [
    `--app=${PAGE_URL}`,
    `--user-data-dir=${shellProfileDir()}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], { detached: true, stdio: 'ignore' })
  child.unref()
  return 'app-window-shell'
}

/**
 * Hand a URL to the OS default browser.
 * @param url - absolute http(s) URL; defaults to the page this plugin shows.
 * @returns the strategy detail string.
 */
async function openSystemBrowser(url = PAGE_URL) {
  // rundll32 instead of cmd's `start`: a URL's `&` must survive as one
  // argument, where cmd would split the command at every unquoted ampersand.
  const [command, args] = process.platform === 'win32'
    ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]]
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  return 'system-browser'
}

/**
 * Accept only what a browser may open: an absolute http(s) URL. Everything
 * else — `file:`, custom protocol handlers, garbage — is refused, because the
 * route is unauthenticated and opening is an action with side effects (#1).
 * @param raw - candidate URL from the request body.
 * @returns the normalized URL, or null when it must be refused.
 */
function parseExternalUrl(raw) {
  if (typeof raw !== 'string' || raw === '') return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    if (parsed.hostname === '') return null
    return parsed.toString()
  } catch {
    return null
  }
}

/** Strategies tried by {@link openPage}, in order. */
export const OPEN_STRATEGIES = [
  { via: 'app-window', run: openAppWindow },
  { via: 'app-window-shell', run: openShellWindow },
  { via: 'system-browser', run: openSystemBrowser },
]

/**
 * Open the page with the first strategy that works.
 * @param strategies - strategies to try; defaults to {@link OPEN_STRATEGIES}.
 * @returns the recorded attempt: ok, the winning `via`, or the last error.
 */
export async function openPage(strategies = OPEN_STRATEGIES) {
  const attempts = []
  let failure = { via: 'none', error: 'no strategy was tried' }
  for (const strategy of strategies) {
    try {
      const detail = await strategy.run()
      const via = typeof detail === 'string' && detail !== '' ? detail : strategy.via
      attempts.push({ via: strategy.via, ok: true, error: '' })
      lastAttempts = attempts
      return record(true, via)
    } catch (error) {
      failure = { via: strategy.via, error: messageOf(error) }
      attempts.push({ via: strategy.via, ok: false, error: failure.error })
    }
  }
  lastAttempts = attempts
  return record(false, failure.via, failure.error)
}

/**
 * Register the launcher's two routes.
 * @param ctx - host context carrying the web server.
 */
export function apply(ctx) {
  const json = (res, status, payload) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(payload))
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTES.state,
    handler: (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET' })
        res.end()
        return
      }
      const slot = windowSlot()
      const file = SESSION_FILE()
      const snapshot = readSessionSnapshot(file)
      json(res, 200, {
        ok: true,
        url: PAGE_URL,
        appWindowOpen: slot.current !== null && slot.current.isDestroyed() === false,
        last: lastAttempt,
        attempts: lastAttempts,
        // Counts only: this endpoint is unauthenticated, so the cookie values
        // themselves never leave the snapshot file.
        session: {
          file,
          electron: electronStatus,
          saved: snapshot === null ? null : {
            cookies: snapshot.cookies.length,
            storage: snapshot.storage.length,
            savedAt: snapshot.savedAt,
          },
        },
      })
    },
  }), 'dsh-webchat: state route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTES.open,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' })
        res.end()
        return
      }
      const result = await openPage()
      json(res, result.ok ? 200 : 502, result)
    },
  }), 'dsh-webchat: open route')

  // The guest's session lives in a process-lifetime partition, so the browser
  // half asks this side to put the saved cookies back before it navigates…
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTES.restore,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' })
        res.end()
        return
      }
      const body = await readJsonBody(req)
      const partition = body !== null && typeof body.partition === 'string' ? body.partition : ''
      // Validate before anything else: this half must never touch a session the
      // shell did not hand out for a browser guest.
      if (!GUEST_PARTITION.test(partition)) {
        json(res, 400, { ok: false, error: 'dsh-webchat: not a browser-guest partition' })
        return
      }
      const snapshot = readSessionSnapshot(SESSION_FILE())
      if (snapshot === null) {
        json(res, 200, { ok: true, cookies: 0, storage: null, cookie: '', savedAt: '' })
        return
      }
      let restored = 0
      let error = ''
      try {
        const session = await partitionSession(partition)
        restored = await restoreCookies(session.cookies, snapshot)
      } catch (failure) {
        // Without a session API the HttpOnly cookies cannot come back, but the
        // guest still gets its storage and its own cookie string, so this is
        // reported rather than fatal.
        error = messageOf(failure)
      }
      json(res, 200, {
        ok: error === '',
        error,
        cookies: restored,
        storage: snapshot.storage,
        cookie: snapshot.cookie,
        savedAt: snapshot.savedAt,
      })
    },
  }), 'dsh-webchat: session restore route')

  // …and asks it to refresh that snapshot as the page is used.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTES.save,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' })
        res.end()
        return
      }
      const body = await readJsonBody(req)
      const partition = body !== null && typeof body.partition === 'string' ? body.partition : ''
      if (!GUEST_PARTITION.test(partition)) {
        json(res, 400, { ok: false, error: 'dsh-webchat: not a browser-guest partition' })
        return
      }
      const file = SESSION_FILE()
      const previous = readSessionSnapshot(file)
      // A save without site storage (the unload beacon) must not erase what an
      // earlier save captured.
      const storage = body !== null && Array.isArray(body.storage)
        ? body.storage
        : (previous === null ? [] : previous.storage)
      const cookie = body !== null && typeof body.cookie === 'string'
        ? body.cookie
        : (previous === null ? '' : previous.cookie)
      // The snapshot is written even when this process cannot reach Electron:
      // site storage and the page's own cookie string are carried by the guest
      // and are still worth keeping.
      let cookies = []
      let error = ''
      try {
        const session = await partitionSession(partition)
        cookies = await captureCookies(session.cookies)
      } catch (failure) {
        error = messageOf(failure)
      }
      // Clearance belongs to the client/challenge that created it, not the
      // login. Filter every save channel, including old unload snapshots.
      cookies = cookies.filter((entry) => !/^aws-waf-token$/i.test(entry.name))
      const savedStorage = storage.filter((entry) => Array.isArray(entry) && !/^(aws_waf|awswaf)/i.test(entry[0]))
      const savedCookie = cookie.split(';').map((pair) => pair.trim())
        .filter((pair) => pair && !/^aws-waf-token=/i.test(pair)).join('; ')
      writeSnapshot(file, { version: 1, savedAt: new Date().toISOString(), cookies, storage: savedStorage, cookie: savedCookie })
      json(res, 200, { ok: true, cookies: cookies.length, storage: savedStorage.length, cookie: savedCookie !== '', error })
    },
}), 'dsh-webchat: session save route')

  // …and hands reply links the page pops into windows to the system browser.
  // A guest's popup dies at the shell's will-attach gate — only the shell's
  // own leases may attach — so the browser half turns external `_blank`
  // clicks into a console sentinel and this route opens them for real (#1).
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTES.external,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' })
        res.end()
        return
      }
      const body = await readJsonBody(req)
      const url = parseExternalUrl(body === null ? null : body.url)
      if (url === null) {
        json(res, 400, { ok: false, error: 'dsh-webchat: only absolute http(s) URLs can be opened externally' })
        return
      }
      try {
        await (externalOpener ?? openSystemBrowser)(url)
        json(res, 200, { ok: true, via: 'system-browser' })
      } catch (failure) {
        json(res, 500, { ok: false, error: messageOf(failure) })
      }
    },
  }), 'dsh-webchat: external link route')

  void electronProbe()
}
