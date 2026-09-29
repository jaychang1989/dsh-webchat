/**
 * Browser-half smoke test.
 *
 * The client bundle only ever runs inside the GUI, so it is executed here
 * against a minimal DOM stand-in: enough to prove the module-loader contract,
 * that apply() mounts the sidebar entry and the panel view, and that the panel
 * button talks to the two host routes.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const BUNDLE = fileURLToPath(new URL('../lib/client.js', import.meta.url))

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
      child.parentElement = this
      child.isConnected = this.isConnected
      this.children.push(child)
      return child
    },
    insertBefore(child, anchor) {
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
    querySelector() {
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
      if (handler !== undefined) handler(event)
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
 * Build the document stub, with a sidebar column (logo row + new-session
 * button) and a conversation column already in place.
 * @returns the stub document plus the element it created.
 */
function makeDocument() {
  const document = { created: [] }
  document.createElement = (tag) => element(tag, document)
  document.createElementNS = (_ns, tag) => element(tag, document)

  const head = element('head', document)
  const body = element('body', document)
  const html = element('html', document)

  // Sidebar column: column > logoRowOwner > logoRow > button[class*=newSession]
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

  const styleTags = []
  document.head = head
  document.body = body
  document.documentElement = html
  document.getElementById = (id) => document.created.find((el) => el.id === id) ?? null
  document.querySelector = (selector) => {
    if (selector.includes('sidebar')) return sidebarColumn
    if (selector.includes('conversation') || selector.includes('centerCol')) return conversation
    if (selector === '[data-dsh-webchat-entry]') return document.created.find((el) => el.getAttribute('data-dsh-webchat-entry') !== null) ?? null
    return null
  }
  document.querySelectorAll = () => []
  document.addEventListener = () => {}
  document.removeEventListener = () => {}
  document.dispatchEvent = () => {}
  document._styleTags = styleTags
  document._sidebarRoot = sidebarRootEl
  document._conversation = conversation
  document._newSession = newSession
  return document
}

/** Load the bundle with a fresh realm-ish global set; returns the loader rows. */
function loadBundle(document, fetchImpl) {
  const rows = []
  const sandbox = {
    window: { __ModuleLoader__: { load: (row) => rows.push(row) } },
    document,
    navigator: { language: 'zh-CN' },
    console: { warn() {}, log() {}, error() {} },
    fetch: fetchImpl ?? (async () => ({ ok: true, status: 200, json: async () => ({ ok: true, appWindowOpen: false, last: {} }) })),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail } },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    setTimeout,
    clearTimeout,
  }
  const context = vm.createContext(sandbox)
  vm.runInContext(readFileSync(BUNDLE, 'utf8'), context, { filename: 'client.js' })
  return rows
}

test('the bundle registers under the package name', () => {
  const document = makeDocument()
  const rows = loadBundle(document)

  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, '@jaychang1989/dsh-webchat')
  assert.equal(typeof rows[0].factory, 'function')
})

test('apply mounts the sidebar entry and the panel view', () => {
  const document = makeDocument()
  const rows = loadBundle(document)
  const plugin = rows[0].factory()

  assert.equal(typeof plugin.apply, 'function')
  // Cross-realm array: compare contents, not prototypes.
  assert.deepEqual([...plugin.inject], [])

  let disposed = 0
  plugin.apply({ effect: (fn) => { const off = fn(); return () => { disposed++; if (typeof off === 'function') off() } } })

  const entry = document.created.find((el) => el.getAttribute('data-dsh-webchat-entry') !== null)
  assert.ok(entry !== undefined, 'sidebar entry was not created')
  assert.equal(entry.tagName, 'BUTTON')
  assert.equal(entry.getAttribute('data-dsh-plugin'), 'webchat')
  assert.equal(entry.getAttribute('aria-label'), 'DeepSeek 网页')
  assert.equal(entry.parentElement, document._sidebarRoot)

  const view = document._conversation.children.find((el) => el.getAttribute('data-dsh-webchat-view') !== null)
  assert.ok(view !== undefined, 'panel view was not appended to the center column')

  const style = document.getElementById('dsh-webchat-style')
  assert.ok(style !== null, 'stylesheet was not injected')

  const button = view.children[0].children[1].children.find((el) => el.className === 'dsh-wc-button')
  assert.ok(button !== undefined, 'panel button was not created')
  assert.equal(button.textContent, '打开 chat.deepseek.com')
})

test('the panel button posts to the open route and reports the strategy', async () => {
  const document = makeDocument()
  const calls = []
  const fetchImpl = async (path, init) => {
    calls.push({ path, method: init?.method ?? 'GET' })
    if (path.endsWith('/state')) return { ok: true, status: 200, json: async () => ({ ok: true, appWindowOpen: false, last: {} }) }
    return { ok: true, status: 200, json: async () => ({ ok: true, via: 'app-window' }) }
  }
  const rows = loadBundle(document, fetchImpl)
  const plugin = rows[0].factory()
  plugin.apply({ effect: (fn) => fn() })

  const view = document._conversation.children[0]
  const card = view.children[0].children[1]
  const button = card.children.find((el) => el.className === 'dsh-wc-button')
  const result = card.children.find((el) => el.className === 'dsh-wc-result')

  await button.dispatch('click', { target: null })
  // The click handler is async and awaits two fetches.
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(calls.map((call) => call.method), ['GET', 'POST', 'GET'])
  assert.equal(calls[1].path, '/api/dsh-webchat/open')
  assert.match(result.textContent, /已打开应用窗口/)
})

test('a refused open is reported as a failure', async () => {
  const document = makeDocument()
  const fetchImpl = async (path) => {
    if (path.endsWith('/state')) return { ok: true, status: 200, json: async () => ({ ok: true, appWindowOpen: false, last: {} }) }
    return { ok: false, status: 502, json: async () => ({ ok: false, via: 'system-browser', error: 'no way to open the page' }) }
  }
  const rows = loadBundle(document, fetchImpl)
  const plugin = rows[0].factory()
  plugin.apply({ effect: (fn) => fn() })

  const card = document._conversation.children[0].children[0].children[1]
  const button = card.children.find((el) => el.className === 'dsh-wc-button')
  const result = card.children.find((el) => el.className === 'dsh-wc-result')

  await button.dispatch('click', { target: null })
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(result.getAttribute('data-state'), 'bad')
  assert.match(result.textContent, /no way to open the page/)
})
