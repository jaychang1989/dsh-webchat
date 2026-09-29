/**
 * Browser-half smoke test.
 *
 * The client bundle only ever runs inside the GUI, so it is executed here
 * against a minimal DOM stand-in. Two environments matter:
 *
 *   - the desktop app, where `globalThis.dshDesktop.browser` lends a native
 *     guest, so the entry must open an in-window panel holding an approved
 *     `<webview>`;
 *   - a plain web profile, where no guest exists, so the entry must ask the host
 *     half for a window instead.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const BUNDLE = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const ENTRY = 'data-dsh-webchat-entry'
const VIEW = 'data-dsh-webchat-view'
const TOAST = 'data-dsh-webchat-toast'
const PAGE_URL = 'https://chat.deepseek.com/'

/** A DOM element stub covering exactly what lib/client.js touches. */
function element(tagName, document) {
  const el = {
    tagName: tagName.toUpperCase(),
    children: [],
    attributes: {},
    dataset: {},
    parentElement: null,
    isConnected: true,
    textContent: '',
    innerHTML: '',
    className: '',
    type: '',
    disabled: false,
    listeners: {},
    loadedUrls: [],
    setAttribute(name, value) {
      this.attributes[name] = String(value)
      if (name === 'id') this.id = String(value)
    },
    getAttribute(name) {
      return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null
    },
    removeAttribute(name) {
      delete this.attributes[name]
    },
    appendChild(child) {
      if (child.parentElement !== null) child.remove()
      child.parentElement = this
      child.isConnected = this.isConnected
      this.children.push(child)
      return child
    },
    insertBefore(child, anchor) {
      if (child.parentElement !== null) child.remove()
      child.parentElement = this
      const index = anchor === null || anchor === undefined ? this.children.length : this.children.indexOf(anchor)
      this.children.splice(index < 0 ? this.children.length : index, 0, child)
      return child
    },
    remove() {
      if (this.parentElement === null) return
      const siblings = this.parentElement.children
      const index = siblings.indexOf(this)
      if (index >= 0) siblings.splice(index, 1)
      this.parentElement = null
      this.isConnected = false
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler
    },
    removeEventListener(type) {
      delete this.listeners[type]
    },
    /** Electron's <webview> navigation entry point. */
    loadURL(url) {
      this.loadedUrls.push(url)
      return Promise.resolve()
    },
    closest(selector) {
      let node = this
      while (node !== null && node !== undefined) {
        if (selector.includes('data-dsh-webchat-entry') && node.getAttribute(ENTRY) !== null) return node
        if (selector.includes('sidebar') && node === document._sidebarColumn) return node
        node = node.parentElement
      }
      return null
    },
    matches() {
      return false
    },
    querySelector(selector) {
      if (selector.includes('data-part')) {
        return this.children.find(child => child.getAttribute('data-part') !== null
          && selector.includes(child.getAttribute('data-part'))) ?? null
      }
      return null
    },
    querySelectorAll() {
      return []
    },
    contains(candidate) {
      return this.children.includes(candidate)
    },
    dispatch(type, event) {
      const handler = this.listeners[type]
      return handler === undefined ? undefined : handler(event)
    },
    get nextElementSibling() {
      if (this.parentElement === null) return null
      const siblings = this.parentElement.children
      return siblings[siblings.indexOf(this) + 1] ?? null
    },
    get firstElementChild() {
      return this.children[0] ?? null
    },
  }
  document.created.push(el)
  return el
}

/**
 * Build the document stub with a sidebar column (logo row + new-session
 * button) and a conversation column already in place.
 * @returns the stub document.
 */
function makeDocument() {
  const document = { created: [] }
  document.createElement = (tag) => element(tag, document)
  document.createElementNS = (_ns, tag) => element(tag, document)

  const head = element('head', document)
  const body = element('body', document)
  const html = element('html', document)

  const sidebarColumn = element('div', document)
  sidebarColumn.setAttribute('data-pane', 'sidebar')
  const sidebarRootEl = element('div', document)
  const logoRow = element('div', document)
  logoRow.className = 'logoRow'
  const newSession = element('button', document)
  newSession.className = 'newSession'
  logoRow.appendChild(newSession)
  sidebarRootEl.appendChild(logoRow)
  sidebarColumn.appendChild(sidebarRootEl)
  // The real shell nests the New Session button inside the logo row; the stub
  // answers the one selector lib/client.js uses to find it.
  sidebarRootEl.querySelector = (selector) => (selector.includes('newSession') ? newSession : null)

  const conversation = element('div', document)
  conversation.setAttribute('data-pane', 'conversation')

  // A shell-owned navigation row, the way Plugins and Automation Tasks appear.
  const pluginsRow = element('button', document)
  pluginsRow.className = 'panelRow'
  sidebarRootEl.appendChild(pluginsRow)

  document.head = head
  document.body = body
  document.documentElement = html
  document.getElementById = (id) => document.created.find((el) => el.id === id) ?? null
  document.querySelector = (selector) => {
    if (selector.includes('sidebar')) return sidebarColumn
    if (selector.includes('conversation') || selector.includes('centerCol')) return conversation
    if (selector.includes('toast')) return document.created.find((el) => el.getAttribute(TOAST) !== null && el.isConnected) ?? null
    if (selector.includes('entry')) return document.created.find((el) => el.getAttribute(ENTRY) !== null) ?? null
    return null
  }
  document.querySelectorAll = () => []
  // Document-level listeners are captured so a test can drive navigation the way
  // the shell does, and so the panel's arbitration event can be delivered.
  document.listeners = {}
  document.addEventListener = (type, handler) => {
    document.listeners[type] = (document.listeners[type] ?? []).concat(handler)
  }
  document.removeEventListener = (type, handler) => {
    document.listeners[type] = (document.listeners[type] ?? []).filter(entry => entry !== handler)
  }
  document.dispatchEvent = (event) => {
    for (const handler of document.listeners[event?.type] ?? []) handler(event)
    return true
  }
  document._sidebarRoot = sidebarRootEl
  document._sidebarColumn = sidebarColumn
  document._navRow = pluginsRow
  document._conversation = conversation
  return document
}

/** Fire a document-level click with the given target, as the browser would. */
function clickWith(document, target) {
  for (const handler of document.listeners.click ?? []) handler({ target })
}

/**
 * Load the bundle with a fresh global set.
 * @param document - DOM stand-in.
 * @param options - `fetchImpl` for the window fallback and `bridge: false` to
 *   simulate a plain web profile (no desktop guest bridge).
 * @returns the loader rows and the recorded guest calls.
 */
function loadBundle(document, options = {}) {
  const rows = []
  const guestCalls = { acquired: [], released: [] }
  const bridge = options.bridge === false
    ? undefined
    : {
      protocolVersion: 1,
      browser: {
        acquire: async (workspace) => {
          guestCalls.acquired.push(workspace)
          return { lease: 'lease-1', partition: 'dsh-sidebar-browser-test' }
        },
        release: async (lease) => { guestCalls.released.push(lease) },
        onOpenRequested: () => () => {},
      },
    }
  const sandbox = {
    window: { __ModuleLoader__: { load: (row) => rows.push(row) } },
    document,
    navigator: { language: 'zh-CN' },
    console: { warn() {}, log() {}, error() {} },
    fetch: options.fetchImpl ?? (async () => ({ ok: true, status: 200, json: async () => ({ ok: true, via: 'app-window' }) })),
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    CustomEvent: class {
      constructor(type, init) {
        this.type = type
        this.detail = init?.detail
      }
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
  }
  if (bridge !== undefined) sandbox.dshDesktop = bridge
  const context = vm.createContext(sandbox)
  vm.runInContext(readFileSync(BUNDLE, 'utf8'), context, { filename: 'client.js' })
  return { rows, guestCalls }
}

/** Mount the plugin and return its sidebar entry and guest handles. */
function mount(document, options) {
  const { rows, guestCalls } = loadBundle(document, options)
  const plugin = rows[0].factory()
  plugin.apply({ effect: (fn) => { const off = fn(); return () => { if (typeof off === 'function') off() } } })
  const entry = document.created.find((el) => el.getAttribute(ENTRY) !== null)
  const view = document._conversation.children.find((el) => el.getAttribute(VIEW) !== null)
  const webview = () => document.created.find((el) => el.tagName === 'WEBVIEW')
  return { plugin, entry, view, webview, guestCalls }
}

/** Let the click handler's awaits settle. */
async function settle() {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve))
}

test('the bundle registers under the package name', () => {
  const document = makeDocument()
  const { rows } = loadBundle(document)

  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, '@jaychang1989/dsh-webchat')
  assert.equal(typeof rows[0].factory, 'function')
})

test('on the desktop the entry mounts the center-column view', () => {
  const document = makeDocument()
  const { plugin, entry, view } = mount(document)

  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual([...plugin.inject], [])
  assert.ok(entry !== undefined, 'sidebar entry was not created')
  assert.equal(entry.parentElement, document._sidebarRoot)
  assert.ok(view !== undefined, 'the panel container was not appended to the center column')
  assert.ok(document.getElementById('dsh-webchat-style') !== null, 'stylesheet was not injected')
})

test('opening the panel reserves a guest and attaches an approved webview', async () => {
  const document = makeDocument()
  const { entry, webview, guestCalls } = mount(document)

  assert.equal(webview(), undefined, 'no guest should exist before the first open')

  await entry.dispatch('click', { target: null })
  await settle()

  assert.deepEqual(guestCalls.acquired, ['dsh-webchat'])

  const frame = webview()
  assert.ok(frame !== undefined, 'the webview was not attached')
  assert.equal(frame.getAttribute('partition'), 'dsh-sidebar-browser-test')
  assert.equal(frame.getAttribute('name'), 'lease-1')
  assert.equal(frame.getAttribute('src'), 'about:blank#lease-1')
  assert.equal(frame.getAttribute('allowpopups'), '')
  assert.equal(frame.parentElement, document._conversation.children[0])

  // The page is navigated once the guest reports its document ready.
  frame.dispatch('dom-ready', {})
  await settle()
  assert.deepEqual(frame.loadedUrls, [PAGE_URL])
})

test('closing and reopening keeps the same guest', async () => {
  const document = makeDocument()
  const { entry, guestCalls, webview } = mount(document)

  await entry.dispatch('click', { target: null })
  await settle()
  const first = webview()
  first.dispatch('dom-ready', {})
  await settle()

  await entry.dispatch('click', { target: null })
  await settle()
  await entry.dispatch('click', { target: null })
  await settle()

  assert.equal(webview(), first, 'the guest was replaced instead of reused')
  assert.deepEqual(guestCalls.acquired, ['dsh-webchat'])
  assert.deepEqual(guestCalls.released, [])
})

test('without the desktop bridge the entry asks the host for a window', async () => {
  const document = makeDocument()
  const calls = []
  const { entry, webview } = mount(document, {
    bridge: false,
    fetchImpl: async (path, init) => {
      calls.push({ path, method: init?.method ?? 'GET' })
      return { ok: true, status: 200, json: async () => ({ ok: true, via: 'app-window' }) }
    },
  })

  await entry.dispatch('click', { target: null })
  await settle()

  assert.deepEqual(calls, [{ path: '/api/dsh-webchat/open', method: 'POST' }])
  assert.equal(webview(), undefined, 'no guest should be attempted without the bridge')
  const toast = document.created.find((el) => el.getAttribute(TOAST) !== null && el.isConnected)
  assert.equal(toast.textContent, '已打开 DeepSeek 网页')
  assert.equal(entry.disabled, false)
})

test('a refused window fallback is reported', async () => {
  const document = makeDocument()
  const { entry } = mount(document, {
    bridge: false,
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({ ok: false, via: 'system-browser', error: 'no way to open the page' }) }),
  })

  await entry.dispatch('click', { target: null })
  await settle()

  const toast = document.created.find((el) => el.getAttribute(TOAST) !== null && el.isConnected)
  assert.equal(toast.getAttribute('data-state'), 'bad')
  assert.match(toast.textContent, /no way to open the page/)
})

test('navigating from the sidebar yields the center column', async () => {
  const document = makeDocument()
  const { entry } = mount(document)
  const html = document.documentElement

  await entry.dispatch('click', { target: null })
  await settle()
  assert.equal(html.getAttribute('data-dsh-webchat-active'), '', 'the panel should own the column after opening')

  // A click outside the sidebar is not navigation and must not disturb the panel.
  clickWith(document, document.body)
  assert.equal(html.getAttribute('data-dsh-webchat-active'), '', 'a click outside the sidebar must not close the panel')

  // Shell-owned rows (Plugins, Automation Tasks, the task board, sessions) do
  // not take part in the data-*-active handshake, so the panel has to yield.
  clickWith(document, document._navRow)
  assert.equal(html.getAttribute('data-dsh-webchat-active'), null, 'the panel must yield the column to a shell panel')
  assert.equal(entry.getAttribute('data-active'), null, 'the row must stop looking selected')
})

test('another third-party panel claiming the column closes this one', async () => {
  const document = makeDocument()
  const { entry } = mount(document)
  const html = document.documentElement

  await entry.dispatch('click', { target: null })
  await settle()
  assert.equal(html.getAttribute('data-dsh-webchat-active'), '')

  document.dispatchEvent({ type: 'dsh-panel-activate', detail: 'taskboard' })

  assert.equal(html.getAttribute('data-dsh-webchat-active'), null)
})
