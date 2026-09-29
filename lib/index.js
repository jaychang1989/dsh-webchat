/**
 * dsh-webchat — minimal launcher half.
 *
 * The DeepSeek web app IS the client: chat.deepseek.com already ships the model
 * picker, deep think, smart search, history and attachments. This plugin does
 * not reimplement any of that any more — it opens that page in a window and
 * gets out of the way. Everything the previous release did around it (a custom
 * chat panel, transcript storage, /api/dsh-webchat engine routes, the
 * webchat_status/send/recover/import/transfer tools, transfer distillation)
 * has been removed.
 *
 * Why a window and not a pane: chat.deepseek.com sends
 * `Content-Security-Policy: frame-ancestors 'none'`, so it cannot be framed,
 * and the desktop build runs with `webviewTag: false`, so it cannot be a
 * `<webview>` either. A real window is the only faithful way to show the
 * official page.
 *
 * Three strategies are tried in order, so the button always does something:
 *   1. `app-window`       — a BrowserWindow created by this process (the DSH
 *                           desktop app is Electron). Focused instead of
 *                           duplicated when one is already open.
 *   2. `app-window-shell` — a chromeless Edge/Chrome window (`--app=`) with its
 *                           own user-data-dir, for hosts where (1) is denied.
 *   3. `system-browser`   — the OS default browser.
 *
 * The browser half (./client) renders the single button that calls this.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

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

/** Route family; the browser half spells the same two paths. */
export const ROUTES = {
  state: '/api/dsh-webchat/state',
  open: '/api/dsh-webchat/open',
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
 * @returns the Electron module.
 * @throws with every probe failure joined, when neither path yields a window API.
 */
async function electronApi() {
  const usable = (mod) => (mod !== null && typeof mod === 'object' && mod.BrowserWindow !== undefined ? mod : undefined)
  const failures = []
  try {
    const fromImport = usable(await import('electron'))
    if (fromImport !== undefined) return fromImport
    failures.push('esm import resolved but exposed no BrowserWindow')
  } catch (error) {
    failures.push(`esm import failed: ${messageOf(error)}`)
  }
  try {
    const fromRequire = usable(requireHere('electron'))
    if (fromRequire !== undefined) return fromRequire
    failures.push('cjs require resolved but exposed no BrowserWindow')
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
  const home = process.env.DSH_HOME ?? process.env.USERPROFILE ?? process.env.HOME ?? '.'
  return join(home, '.dsh', 'dsh-webchat', 'app-window')
}

/** Open — or focus — a window owned by this process. */
async function openAppWindow() {
  const { BrowserWindow } = await electronApi()
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

/** Hand the page to the OS default browser. */
async function openSystemBrowser() {
  const [command, args] = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', PAGE_URL]]
    : process.platform === 'darwin'
      ? ['open', [PAGE_URL]]
      : ['xdg-open', [PAGE_URL]]
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  return 'system-browser'
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
      json(res, 200, {
        ok: true,
        url: PAGE_URL,
        appWindowOpen: slot.current !== null && slot.current.isDestroyed() === false,
        last: lastAttempt,
        attempts: lastAttempts,
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
}
