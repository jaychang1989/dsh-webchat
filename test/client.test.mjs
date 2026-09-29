/**
 * Browser-half test.
 *
 * The client bundle only ever runs inside the GUI, so it executes here against
 * a minimal DOM stand-in plus a small React test double. What matters:
 *
 *   - it registers the sidebar row and the page as slots, under one shared id,
 *     so the shell owns the button and the panel switching;
 *   - the page reserves a guest and attaches the exact `<webview>` the desktop
 *     shell approves;
 *   - the guest lives outside the panel mount: hiding it must not detach it, and
 *     remounting must reuse it;
 *   - where no guest bridge exists, the panel offers the window fallback.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const BUNDLE = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const PAGE_URL = 'https://chat.deepseek.com/'
const PANEL_ID = 'webchat'
const OVERLAY = 'data-dsh-webchat-overlay'

/** A DOM element stub covering exactly what lib/client.js touches. */
function element(tagName, document) {
  const el = {
    tagName: tagName.toUpperCase(),
    children: [],
    attributes: {},
    style: {},
    parentElement: null,
    isConnected: true,
    textContent: '',
    className: '',
    type: '',
    disabled: false,
    listeners: {},
    loadedUrls: [],
    userAgents: [],
    calls: [],
    rect: { left: 280, top: 48, width: 900, height: 700 },
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
    replaceChildren() {
      this.children.forEach((child) => { child.parentElement = null; child.isConnected = false })
      this.children = []
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
      this.calls.push('loadURL')
      this.loadedUrls.push(url)
      return Promise.resolve()
    },
    /** Electron's <webview> user-agent override. */
    setUserAgent(userAgent) {
      this.calls.push('setUserAgent')
      this.userAgents.push(userAgent)
    },
    getBoundingClientRect() {
      return this.rect
    },
    dispatch(type, event) {
      const handler = this.listeners[type]
      return handler === undefined ? undefined : handler(event)
    },
    get firstElementChild() {
      return this.children[0] ?? null
    },
  }
  document.created.push(el)
  return el
}

/** Build the document stub: head, body, html[lang] and a queryable overlay slot. */
function makeDocument() {
  const document = { created: [] }
  document.createElement = (tag) => element(tag, document)
  document.head = element('head', document)
  document.body = element('body', document)
  document.documentElement = element('html', document)
  document.documentElement.setAttribute('lang', 'zh-CN')
  document.getElementById = (id) => document.created.find((el) => el.id === id) ?? null
  document.querySelector = (selector) => {
    if (selector.includes(OVERLAY)) {
      return document.created.find((el) => el.getAttribute(OVERLAY) !== null && el.isConnected) ?? null
    }
    return null
  }
  return document
}

/** A window stub recording resize listeners. */
function makeWindow() {
  return {
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = (this.listeners[type] ?? []).concat(handler)
    },
    removeEventListener(type, handler) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((entry) => entry !== handler)
    },
  }
}

/**
 * A React test double: enough of createElement/useRef/useEffect to render one
 * component and drive its mount and unmount the way React does.
 * @returns the double plus a `render` helper.
 */
function makeReact() {
  let cursor = null
  const createElement = (type, props, ...children) => ({
    type,
    props: {
      ...(props ?? {}),
      children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children,
    },
  })
  const nextCell = () => {
    const cell = cursor.cells[cursor.index] ?? (cursor.cells[cursor.index] = {})
    cursor.index += 1
    return cell
  }
  const React = {
    createElement,
    useRef(initial) {
      const cell = nextCell()
      if (cell.ref === undefined) cell.ref = { current: initial }
      return cell.ref
    },
    useEffect(fn) {
      nextCell().effect = fn
    },
  }
  return {
    React,
    /** Render once; the ref is attached before effects run, as React does. */
    render(Component, props) {
      cursor = { cells: [], index: 0 }
      const tree = Component(props ?? {})
      const effects = cursor.cells.map((cell) => cell.effect).filter((fn) => typeof fn === 'function')
      return {
        tree,
        /** Attach the host element to the tree's ref, then run the effects. */
        mount(host) {
          const ref = tree !== null && tree.props !== undefined ? tree.props.ref : undefined
          if (ref !== undefined && host !== undefined) ref.current = host
          return effects.map((fn) => fn()).filter((fn) => typeof fn === 'function')
        },
      }
    },
  }
}

/**
 * Load the bundle.
 * @param document - DOM stand-in.
 * @param options - `bridge: false` for a plain web profile, an overriding
 *   `bridge` object, or a `fetchImpl` for the fallback.
 * @returns the loader rows, the recorded guest calls and the sandbox.
 */
function loadBundle(document, options = {}) {
  const rows = []
  const guestCalls = { acquired: [], released: [] }
  const fakeReact = makeReact()
  const sandbox = {
    window: { __ModuleLoader__: { load: (row) => rows.push(row) }, ...makeWindow() },
    document,
    navigator: { language: 'zh-CN', userAgent: options.userAgent },
    console: { warn() {}, log() {}, error() {} },
    fetch: options.fetchImpl ?? (async () => ({ ok: true, status: 200, json: async () => ({ ok: true, via: 'app-window' }) })),
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback
        sandbox.observed.push(this)
      }
      observe() {}
      disconnect() {}
    },
    observed: [],
    require: (name) => {
      if (name === 'react') return fakeReact.React
      throw new Error('unexpected require: ' + name)
    },
  }
  const bridge = options.bridge === false
    ? undefined
    : options.bridge ?? {
      acquire: async (workspace) => {
        guestCalls.acquired.push(workspace)
        return { lease: 'lease-1', partition: 'dsh-sidebar-browser-test' }
      },
      release: async (lease) => { guestCalls.released.push(lease) },
    }
  if (bridge !== undefined) sandbox.dshDesktop = { protocolVersion: 1, browser: bridge }
  const context = vm.createContext(sandbox)
  vm.runInContext(readFileSync(BUNDLE, 'utf8'), context, { filename: 'client.js' })
  return { rows, guestCalls, sandbox, react: fakeReact }
}

/** Load the plugin and capture the slot registrations it installs. */
function loadPlugin(document, options) {
  const { rows, guestCalls, sandbox, react } = loadBundle(document, options)
  const plugin = rows[0].factory(sandbox.require)
  const registrations = []
  const effects = []
  const ctx = {
    slots: {
      inject(ownerKey, callback) {
        callback()
        return () => {}
      },
      register(definition, component) {
        registrations.push({ definition, component })
        return () => {}
      },
    },
    effect(fn) {
      effects.push(fn)
      return () => {}
    },
  }
  return { plugin, ctx, registrations, effects, guestCalls, sandbox, react }
}

/** Let the guest promise chain settle. */
async function settle() {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve))
}

test('the bundle registers under the package name and asks for slots', () => {
  const document = makeDocument()
  const { rows, sandbox } = loadBundle(document)
  const plugin = rows[0].factory(sandbox.require)

  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, '@jaychang1989/dsh-webchat')
  assert.deepEqual([...plugin.inject], ['slots'])
  assert.equal(typeof plugin.apply, 'function')
})

test('apply registers the sidebar row and the matching main panel', () => {
  const document = makeDocument()
  const { plugin, ctx, registrations } = loadPlugin(document)
  plugin.apply(ctx)

  assert.equal(registrations.length, 2)
  const [row, page] = registrations
  assert.equal(row.definition.name, 'sidebar.panellist')
  assert.equal(row.definition.id, PANEL_ID)
  assert.equal(row.definition.order, -1)
  assert.equal(typeof row.definition.label, 'function')
  assert.equal(row.definition.label(), 'DeepSeek 网页')
  assert.equal(page.definition.name, 'main')
  assert.equal(page.definition.key, PANEL_ID, 'the main cell key must be the row id')
  assert.equal(typeof row.component, 'function')
  assert.equal(typeof page.component, 'function')
  assert.ok(document.getElementById('dsh-webchat-style') !== null, 'stylesheet was not injected')
})

test('the row label follows the document language', () => {
  const document = makeDocument()
  const { plugin, ctx, registrations } = loadPlugin(document)
  plugin.apply(ctx)

  assert.equal(registrations[0].definition.label(), 'DeepSeek 网页')
  document.documentElement.setAttribute('lang', 'en-US')
  assert.equal(registrations[0].definition.label(), 'DeepSeek Web')
})

test('the row icon honours the size the sidebar asks for', () => {
  const document = makeDocument()
  const { plugin, ctx, registrations } = loadPlugin(document)
  plugin.apply(ctx)

  const tree = registrations[0].component({ size: 20, active: true })
  assert.equal(tree.type, 'svg')
  assert.equal(tree.props.width, 20)
  assert.equal(tree.props.height, 20)
  assert.equal(tree.props['aria-hidden'], true)
})

test('the panel reserves a guest and attaches the webview the shell approves', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, guestCalls, react } = loadPlugin(document)
  plugin.apply(ctx)

  const rendered = react.render(registrations[1].component)
  const host = element('div', document)
  rendered.mount(host)
  await settle()

  assert.deepEqual(guestCalls.acquired, ['dsh-webchat'])
  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  assert.ok(frame !== undefined, 'the webview was not attached')
  assert.equal(frame.getAttribute('partition'), 'dsh-sidebar-browser-test')
  assert.equal(frame.getAttribute('name'), 'lease-1')
  assert.equal(frame.getAttribute('src'), 'about:blank#lease-1')
  assert.equal(frame.getAttribute('allowpopups'), '')
  const container = frame.parentElement
  assert.equal(container.getAttribute(OVERLAY), '', 'the guest must live at the document root')
  assert.equal(container.style.display, 'block')
  assert.equal(container.style.left, '280px')
  assert.equal(container.style.width, '900px')

  frame.dispatch('dom-ready', {})
  await settle()
  assert.deepEqual(frame.loadedUrls, [PAGE_URL])
})

test('the guest outlives the panel mount and is reused on the next one', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, guestCalls, react } = loadPlugin(document)
  plugin.apply(ctx)
  const Panel = registrations[1].component

  const first = react.render(Panel)
  const unmount = first.mount(element('div', document))
  await settle()
  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  const container = frame.parentElement
  frame.dispatch('dom-ready', {})
  await settle()

  // Switching to another panel unmounts this one: hide the guest, never detach it.
  unmount.forEach((fn) => fn())
  assert.equal(container.style.display, 'none', 'the guest must be hidden while another panel is selected')
  assert.equal(frame.parentElement, container, 'the guest must not be detached')
  assert.equal(container.parentElement, document.body, 'the container must stay at the document root')

  const second = react.render(Panel)
  second.mount(element('div', document))
  await settle()

  assert.equal(document.created.filter((el) => el.tagName === 'WEBVIEW').length, 1, 'the guest was replaced')
  assert.equal(frame.parentElement, container)
  assert.equal(container.style.display, 'block')
  assert.deepEqual(guestCalls.acquired, ['dsh-webchat'], 'the lease must be acquired once')
  assert.deepEqual(guestCalls.released, [])
})

test('plugin disposal releases the guest', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, effects, guestCalls, react } = loadPlugin(document)
  plugin.apply(ctx)

  const rendered = react.render(registrations[1].component)
  rendered.mount(element('div', document))
  await settle()

  const cleanups = effects.map((fn) => fn()).filter((fn) => typeof fn === 'function')
  cleanups.forEach((fn) => fn())

  assert.deepEqual(guestCalls.released, ['lease-1'])
  assert.equal(document.querySelector('[' + OVERLAY + ']'), null, 'the container must be removed')
})

test('the guest never advertises Electron to the page', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, react } = loadPlugin(document, {
    // What an Electron renderer actually reports.
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) dsh/0.2.0-rc.1 Chrome/138.0.7204.50 Electron/37.0.0 Safari/537.36',
  })
  plugin.apply(ctx)

  const rendered = react.render(registrations[1].component)
  rendered.mount(element('div', document))
  await settle()

  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  const declared = frame.getAttribute('useragent')
  assert.ok(declared !== null, 'the guest must declare a clean user agent')
  assert.ok(!declared.toLowerCase().includes('electron'), `the attribute still advertises Electron: ${declared}`)
  assert.match(declared, /Chrome\/138/, 'the Chrome major version must stay truthful')

  // The shell rewrites the guest's preferences, so the UA is set once more on
  // the live guest — and before anything is requested.
  frame.dispatch('dom-ready', {})
  await settle()
  assert.deepEqual(frame.userAgents, [declared])
  assert.deepEqual(frame.calls, ['setUserAgent', 'loadURL'], 'the user agent must land before the first navigation')
})

test('a renderer that reports no user agent adds no override', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, react } = loadPlugin(document)
  plugin.apply(ctx)

  const rendered = react.render(registrations[1].component)
  rendered.mount(element('div', document))
  await settle()

  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  assert.equal(frame.getAttribute('useragent'), null)
  frame.dispatch('dom-ready', {})
  await settle()
  assert.deepEqual(frame.userAgents, [])
  assert.deepEqual(frame.calls, ['loadURL'])
})

test('without the desktop bridge the panel offers the window fallback', async () => {
  const document = makeDocument()
  const calls = []
  const { plugin, ctx, registrations, guestCalls, react } = loadPlugin(document, {
    bridge: false,
    fetchImpl: async (path, init) => {
      calls.push({ path, method: init?.method ?? 'GET' })
      return { ok: true, status: 200, json: async () => ({ ok: true, via: 'app-window' }) }
    },
  })
  plugin.apply(ctx)

  const rendered = react.render(registrations[1].component)
  const host = element('div', document)
  rendered.mount(host)
  await settle()

  assert.deepEqual(guestCalls.acquired, [], 'no guest may be reserved without a bridge')
  const box = host.children[0]
  assert.match(box.textContent, /无法在窗口内显示官方页面/)
  const button = box.children.find((child) => child.tagName === 'BUTTON')
  assert.ok(button !== undefined, 'the fallback must offer an action')
  assert.equal(button.textContent, '在窗口中打开')

  await button.dispatch('click', {})
  await settle()

  assert.deepEqual(calls, [{ path: '/api/dsh-webchat/open', method: 'POST' }])
  assert.equal(button.disabled, false)
  assert.equal(box.children[1].textContent, '已打开 DeepSeek 网页')
})

test('a refused guest is reported with the host reason', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, react } = loadPlugin(document, {
    bridge: {
      acquire: async () => { throw new Error('desktop browser: a workspace storage identity is required') },
      release: async () => {},
    },
  })
  plugin.apply(ctx)

  const rendered = react.render(registrations[1].component)
  const host = element('div', document)
  rendered.mount(host)
  await settle()

  assert.match(host.children[0].textContent, /载入失败/)
  assert.match(host.children[0].textContent, /workspace storage identity/)
})
