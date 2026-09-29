/**
 * Browser-half smoke test.
 *
 * The client bundle only ever runs inside the GUI, so it is executed here
 * against a minimal DOM stand-in: enough to prove the module-loader contract,
 * that apply() mounts the sidebar entry, and that clicking that entry calls the
 * host route and reports the outcome.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const BUNDLE = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const ENTRY = 'data-dsh-webchat-entry'
const TOAST = 'data-dsh-webchat-toast'

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
    closest() {
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
  document.addEventListener = () => {}
  document.removeEventListener = () => {}
  document.dispatchEvent = () => {}
  document._sidebarRoot = sidebarRootEl
  document._conversation = conversation
  return document
}

/** Load the bundle with a fresh global set; returns the loader rows. */
function loadBundle(document, fetchImpl) {
  const rows = []
  const pending = []
  const sandbox = {
    window: { __ModuleLoader__: { load: (row) => rows.push(row) } },
    document,
    navigator: { language: 'zh-CN' },
    console: { warn() {}, log() {}, error() {} },
    fetch: fetchImpl ?? (async () => ({ ok: true, status: 200, json: async () => ({ ok: true, via: 'app-window' }) })),
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    // Record the dismissal without letting a live timer outlive the test.
    setTimeout: (fn) => { pending.push(fn); return 0 },
    clearTimeout: () => {},
  }
  sandbox._pending = pending
  const context = vm.createContext(sandbox)
  vm.runInContext(readFileSync(BUNDLE, 'utf8'), context, { filename: 'client.js' })
  return { rows, sandbox }
}

/** Mount the plugin and return its sidebar entry. */
function mount(document, fetchImpl) {
  const { rows, sandbox } = loadBundle(document, fetchImpl)
  const plugin = rows[0].factory()
  plugin.apply({ effect: (fn) => { const off = fn(); return () => { if (typeof off === 'function') off() } } })
  const entry = document.created.find((el) => el.getAttribute(ENTRY) !== null)
  return { plugin, sandbox, entry }
}

/** Let the click handler's awaits settle. */
async function settle() {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve))
}

test('the bundle registers under the package name', () => {
  const document = makeDocument()
  const { rows } = loadBundle(document)

  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, '@jaychang1989/dsh-webchat')
  assert.equal(typeof rows[0].factory, 'function')
})

test('apply mounts the sidebar entry and nothing else', () => {
  const document = makeDocument()
  const { plugin, entry } = mount(document)

  assert.equal(typeof plugin.apply, 'function')
  // Cross-realm array: compare contents, not prototypes.
  assert.deepEqual([...plugin.inject], [])

  assert.ok(entry !== undefined, 'sidebar entry was not created')
  assert.equal(entry.tagName, 'BUTTON')
  assert.equal(entry.getAttribute('data-dsh-plugin'), 'webchat')
  assert.equal(entry.getAttribute('aria-label'), 'DeepSeek 网页')
  assert.equal(entry.parentElement, document._sidebarRoot)
  assert.ok(document.getElementById('dsh-webchat-style') !== null, 'stylesheet was not injected')

  // No panel: the whole point of 0.4.x is that the page lives in a window.
  assert.equal(document._conversation.children.length, 0)
  assert.equal(document.created.filter(el => el.getAttribute('data-dsh-webchat-view') !== null).length, 0)
})

test('clicking the entry opens the page and confirms it', async () => {
  const document = makeDocument()
  const calls = []
  const { entry } = mount(document, async (path, init) => {
    calls.push({ path, method: init?.method ?? 'GET' })
    return { ok: true, status: 200, json: async () => ({ ok: true, via: 'app-window' }) }
  })

  await entry.dispatch('click', { target: null })
  await settle()

  assert.deepEqual(calls, [{ path: '/api/dsh-webchat/open', method: 'POST' }])
  const toast = document.created.find(el => el.getAttribute(TOAST) !== null && el.isConnected)
  assert.ok(toast !== undefined, 'no confirmation toast')
  assert.equal(toast.textContent, '已打开 DeepSeek 网页')
  assert.equal(entry.disabled, false)
  assert.equal(entry.querySelector('[data-part=label]').textContent, 'DeepSeek 网页')
})

test('a system-browser handoff says so', async () => {
  const document = makeDocument()
  const { entry } = mount(document, async () => ({
    ok: true, status: 200, json: async () => ({ ok: true, via: 'system-browser' }),
  }))

  await entry.dispatch('click', { target: null })
  await settle()

  const toast = document.created.find(el => el.getAttribute(TOAST) !== null && el.isConnected)
  assert.equal(toast.textContent, '已交给系统默认浏览器打开')
})

test('a refused open reports the failure', async () => {
  const document = makeDocument()
  const { entry } = mount(document, async () => ({
    ok: false, status: 502, json: async () => ({ ok: false, via: 'system-browser', error: 'no way to open the page' }),
  }))

  await entry.dispatch('click', { target: null })
  await settle()

  const toast = document.created.find(el => el.getAttribute(TOAST) !== null && el.isConnected)
  assert.equal(toast.getAttribute('data-state'), 'bad')
  assert.match(toast.textContent, /no way to open the page/)
})

test('a 404 from an older host half is surfaced, not swallowed', async () => {
  const document = makeDocument()
  const { entry } = mount(document, async () => ({
    ok: false, status: 404, json: async () => { throw new Error('not json') },
  }))

  await entry.dispatch('click', { target: null })
  await settle()

  const toast = document.created.find(el => el.getAttribute(TOAST) !== null && el.isConnected)
  assert.equal(toast.getAttribute('data-state'), 'bad')
  assert.match(toast.textContent, /HTTP 404/)
})
