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
    scripts: [],
    reloads: 0,
    reply: '[]',
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
      this.listeners[type] = (this.listeners[type] ?? []).concat(handler)
    },
    removeEventListener(type, handler) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((entry) => entry !== handler)
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
    /** Electron's <webview> script evaluation, used for site storage. */
    executeJavaScript(code) {
      this.scripts.push(code)
      return Promise.resolve(code.includes('var state =') ? true : this.reply ?? '[]')
    },
    reload() {
      this.reloads += 1
      return Promise.resolve()
    },
    getURL() { return this.currentUrl ?? 'https://chat.deepseek.com/' },
    getBoundingClientRect() {
      return this.rect
    },
    dispatch(type, event) {
      for (const handler of this.listeners[type] ?? []) handler(event)
      return undefined
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
  const requests = []
  const beacons = []
  const intervals = new Map()
  const fakeReact = makeReact()
  let nextTimer = 1
  const defaultFetch = async (path, init) => {
    requests.push({ path: String(path), body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) })
    if (String(path).includes('/session/restore')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, cookies: 0, storage: options.restoreStorage ?? null, savedAt: '' }) }
    }
    if (String(path).includes('/session/save')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, cookies: 0, storage: 0 }) }
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, via: 'app-window' }) }
  }
  const sandbox = {
    window: { __ModuleLoader__: { load: (row) => rows.push(row) }, ...makeWindow() },
    document,
    navigator: {
      language: 'zh-CN',
      userAgent: options.userAgent,
      sendBeacon(url, data) {
        beacons.push({ url: String(url), data: JSON.parse(String(data)) })
        return true
      },
    },
    console: { warn() {}, log() {}, error() {} },
    fetch: options.fetchImpl ?? defaultFetch,
    setInterval(fn, ms) {
      const id = nextTimer
      nextTimer += 1
      intervals.set(id, { fn, ms })
      return id
    },
    clearInterval(id) {
      intervals.delete(id)
    },

    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback
        sandbox.observed.push(this)
      }
      observe() {}
      disconnect() {}
    },
    observed: [],
    URL,
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
      onOpenRequested: () => () => {},
    }
  if (bridge !== undefined) sandbox.dshDesktop = { protocolVersion: 1, browser: bridge }
  const context = vm.createContext(sandbox)
  vm.runInContext(readFileSync(BUNDLE, 'utf8'), context, { filename: 'client.js' })
  return { rows, guestCalls, sandbox, react: fakeReact, requests, beacons, intervals }
}

/** Load the plugin and capture the slot registrations it installs. */
function loadPlugin(document, options) {
  const { rows, guestCalls, sandbox, react, requests, beacons, intervals } = loadBundle(document, options)
  const plugin = rows[0].factory(sandbox.require)
  const registrations = []
  const effects = []
  const ctx = {
    shortcuts: {
      platform: 'windows',
      commands: [], observers: [],
      register(command) { this.commands.push(command); return () => { this.commands = this.commands.filter((item) => item !== command) } },
      observeFixedInput(fn) { this.observers.push(fn); return () => { this.observers = this.observers.filter((item) => item !== fn) } },
    },
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
  return { plugin, ctx, registrations, effects, guestCalls, sandbox, react, requests, beacons, intervals }
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
  assert.deepEqual([...plugin.inject], ['slots', 'shortcuts'])
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
  assert.equal(row.definition.label(), 'Chat DeepSeek')
  assert.equal(page.definition.name, 'main')
  assert.equal(page.definition.key, PANEL_ID, 'the main cell key must be the row id')
  assert.equal(typeof row.component, 'function')
  assert.equal(typeof page.component, 'function')
  assert.ok(document.getElementById('dsh-webchat-style') !== null, 'stylesheet was not injected')
})

test('the row label is the product name, not a translation', () => {
  const document = makeDocument()
  const { plugin, ctx, registrations } = loadPlugin(document)
  plugin.apply(ctx)

  // Deliberate: the row reads "Chat DeepSeek" in every language, because that is
  // the product's own name. The rest of the plugin's copy stays localized.
  assert.equal(registrations[0].definition.label(), 'Chat DeepSeek')
  document.documentElement.setAttribute('lang', 'en-US')
  assert.equal(registrations[0].definition.label(), 'Chat DeepSeek')
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

test('the guest drops only the Electron token from its identity', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, react } = loadPlugin(document, { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.7204.50 Electron/37.0.0 Safari/537.36' })
  plugin.apply(ctx)
  react.render(registrations[1].component).mount(element('div', document))
  await settle()
  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  // The Chrome version and everything else stay byte-for-byte; only the
  // Electron token disappears, so the site's literal substring check and the
  // client hints both stay consistent.
  assert.equal(frame.getAttribute('useragent'), 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.7204.50 Safari/537.36')
  frame.dispatch('dom-ready', {})
  await settle()
  assert.deepEqual(frame.userAgents, ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.7204.50 Safari/537.36'])
  assert.deepEqual(frame.calls, ['setUserAgent', 'loadURL'])
})

test('a user agent without the Electron token is left untouched', async () => {
  const document = makeDocument()
  const clean = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.50 Safari/537.36'
  const { plugin, ctx, registrations, react } = loadPlugin(document, { userAgent: clean })
  plugin.apply(ctx)
  react.render(registrations[1].component).mount(element('div', document))
  await settle()
  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  assert.equal(frame.getAttribute('useragent'), clean, 'a clean UA must pass through byte-for-byte')
  frame.dispatch('dom-ready', {})
  await settle()
  assert.deepEqual(frame.calls, ['setUserAgent', 'loadURL'])
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

test('the guest asks the host to put the saved session back before it navigates', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, requests, react } = loadPlugin(document)
  plugin.apply(ctx)

  const rendered = react.render(registrations[1].component)
  rendered.mount(element('div', document))
  await settle()

  assert.equal(requests[0].path, '/api/dsh-webchat/session/restore')
  assert.equal(requests[0].body.partition, 'dsh-sidebar-browser-test')
  assert.equal(document.created.find((el) => el.tagName === 'WEBVIEW') !== undefined, true)
})

test('saved site storage is written back exactly once, then the page reloads', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, react } = loadPlugin(document, {
    restoreStorage: [['userToken', 'secret'], ['userInfo', '{}']],
  })
  plugin.apply(ctx)

  const rendered = react.render(registrations[1].component)
  rendered.mount(element('div', document))
  await settle()

  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  frame.dispatch('dom-ready', {})
  await settle()
  assert.equal(frame.reloads, 0, 'nothing is reloaded before the first real load finishes')

  frame.dispatch('did-finish-load', {})
  await settle()
  assert.equal(frame.reloads, 1, 'the page must be reloaded once with the storage in place')
  assert.match(frame.scripts[0], /setItem/)
  assert.match(frame.scripts[0], /userToken/)
  assert.match(frame.scripts[0], /secret/)

  frame.dispatch('did-finish-load', {})
  await settle()
  assert.equal(frame.reloads, 1, 'the restore must not loop')
})

test('a fresh run without a snapshot never reloads the page', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, react } = loadPlugin(document)
  plugin.apply(ctx)

  const rendered = react.render(registrations[1].component)
  rendered.mount(element('div', document))
  await settle()

  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  frame.dispatch('dom-ready', {})
  await settle()
  frame.dispatch('did-finish-load', {})
  await settle()

  assert.equal(frame.reloads, 0)
  assert.equal(frame.scripts.length, 1, 'only the origin-checked snapshot read runs')
})

test('the session is snapshotted as the page is used', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, requests, intervals, react } = loadPlugin(document)
  plugin.apply(ctx)

  const rendered = react.render(registrations[1].component)
  rendered.mount(element('div', document))
  await settle()

  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  frame.reply = JSON.stringify({ origin: PAGE_URL.slice(0, -1), storage: [['userToken', 'secret']], cookie: 'ds_session=abc' })
  frame.dispatch('dom-ready', {})
  await settle()
  frame.dispatch('did-finish-load', {})
  await settle()

  const saves = requests.filter((entry) => entry.path === '/api/dsh-webchat/session/save')
  assert.equal(saves.length, 1, 'a finished load snapshots the session')
  assert.equal(saves[0].body.partition, 'dsh-sidebar-browser-test')
  assert.deepEqual(saves[0].body.storage, [['userToken', 'secret']])
  assert.equal(saves[0].body.cookie, 'ds_session=abc', 'the page cookie travels with the storage')

  assert.equal(intervals.size, 1, 'the guest keeps a periodic snapshot running')
  assert.equal([...intervals.values()][0].ms, 30000)
  await [...intervals.values()][0].fn()
  await settle()
  assert.equal(requests.filter((entry) => entry.path.endsWith('/session/save')).length, 2)
})

test('unload snapshots the session without shipping storage', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, beacons, sandbox, react } = loadPlugin(document)
  plugin.apply(ctx)

  const rendered = react.render(registrations[1].component)
  rendered.mount(element('div', document))
  await settle()

  document.created.find((el) => el.tagName === 'WEBVIEW').dispatch('did-finish-load', {})
  await settle()
  const handlers = sandbox.window.listeners.beforeunload ?? []
  assert.equal(handlers.length, 1, 'the unload beacon must be installed')
  handlers[0]({})

  assert.equal(beacons.length, 1)
  assert.equal(beacons[0].url, '/api/dsh-webchat/session/save')
  assert.deepEqual(beacons[0].data, { partition: 'dsh-sidebar-browser-test' })
})

test('plugin disposal snapshots once more and stops the timer', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, effects, intervals, requests, sandbox, react } = loadPlugin(document)
  plugin.apply(ctx)

  const rendered = react.render(registrations[1].component)
  rendered.mount(element('div', document))
  await settle()
  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  frame.reply = JSON.stringify({ origin: PAGE_URL.slice(0, -1), storage: [['userToken', 'secret']], cookie: 'ds_session=abc' })

  frame.dispatch('did-finish-load', {})
  await settle()
  const cleanups = effects.map((fn) => fn()).filter((fn) => typeof fn === 'function')
  cleanups.forEach((fn) => fn())
  await settle()

  assert.equal(intervals.size, 0, 'the periodic snapshot must stop with the plugin')
  assert.equal((sandbox.window.listeners.beforeunload ?? []).length, 0)
  assert.ok(requests.some((entry) => entry.path.endsWith('/session/save')), 'disposal must save before releasing')
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
  assert.equal(box.children[1].textContent, '已打开 Chat DeepSeek')
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

test('snapshot script excludes WAF state and keeps login state', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, react } = loadPlugin(document)
  plugin.apply(ctx)
  react.render(registrations[1].component).mount(element('div', document))
  await settle()
  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  frame.dispatch('did-finish-load', {})
  await settle()
  const localStorage = { userToken: 'login', aws_waf_token: 'stale', AWSWAFState: 'stale' }
  Object.defineProperty(localStorage, 'getItem', { value: (key) => localStorage[key] })
  const state = JSON.parse(vm.runInNewContext(frame.scripts[0], { location: { origin: PAGE_URL.slice(0, -1) }, localStorage, document: { cookie: 'ds_session=abc;aws-waf-token=stale; theme=dark' } }))
  assert.deepEqual(state.storage, [['userToken', 'login']])
  assert.equal(state.cookie, 'ds_session=abc; theme=dark')
})

test('restore skips old WAF storage and accepts imported cookies without Electron', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, react } = loadPlugin(document, {
    fetchImpl: async () => ({ json: async () => ({ ok: false, error: 'Electron unavailable', storage: [['userToken', 'login'], ['aws_waf_token', 'stale'], ['AWSWAFState', 'stale']], cookie: 'ds_session=abc; aws-waf-token=imported' }) }),
  })
  plugin.apply(ctx)
  react.render(registrations[1].component).mount(element('div', document))
  await settle()
  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  frame.dispatch('did-finish-load', {})
  await settle()
  const written = [], cookies = [], page = {}
  Object.defineProperty(page, 'cookie', { set: (value) => cookies.push(value) })
  vm.runInNewContext(frame.scripts[0], { location: { origin: PAGE_URL.slice(0, -1) }, localStorage: { setItem: (...pair) => written.push(pair) }, document: page })
  assert.deepEqual(written, [['userToken', 'login']])
  assert.deepEqual(cookies, ['ds_session=abc; path=/', 'aws-waf-token=imported; path=/'])
  assert.equal(frame.reloads, 1)
})

test('re-applying the plugin rewrites the injected stylesheet', () => {
  const document = makeDocument()
  const { plugin, ctx } = loadPlugin(document)
  plugin.apply(ctx)
  const tag = document.getElementById('dsh-webchat-style')
  const fresh = tag.textContent
  tag.textContent = '/* stale CSS from before a hot swap */'
  plugin.apply(ctx)
  assert.equal(document.getElementById('dsh-webchat-style').textContent, fresh)
})



test('native popup requests open http(s) links and are disposed exactly once', async () => {
  const document = makeDocument()
  let callback, unsubscribed = 0
  const { plugin, ctx, registrations, react, requests, effects } = loadPlugin(document, { bridge: {
    acquire: async () => ({ lease: 'lease-1', partition: 'dsh-sidebar-browser-test' }),
    release: async () => {},
    onOpenRequested(lease, fn) { assert.equal(lease, 'lease-1'); callback = fn; return () => { unsubscribed++ } },
  } })
  plugin.apply(ctx)
  react.render(registrations[1].component).mount(element('div', document))
  await settle()
  assert.equal(typeof callback, 'function')
  for (const url of ['https://ext.example/p?a=1&b=2', 'https://chat.deepseek.com/x']) callback(url)
  for (const url of ['javascript:alert(1)', 'file:///tmp/file', 'not a url']) callback(url)
  await settle()
  const opens = requests.filter((r) => r.path.endsWith('/external'))
  assert.deepEqual(opens.map((r) => r.body.url), ['https://ext.example/p?a=1&b=2', 'https://chat.deepseek.com/x'])
  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  frame.dispatch('console-message', { message: '__dsh-webchat-open:https://spoof.example/' })
  await settle()
  assert.equal(requests.filter((r) => r.path.endsWith('/external')).length, 2)
  effects.map((fn) => fn()).filter((fn) => typeof fn === 'function').forEach((fn) => { fn(); fn() })
  assert.equal(unsubscribed, 1)
})

test('refresh commands use the native registry and only reload the selected guest', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, react } = loadPlugin(document)
  plugin.apply(ctx)
  const unmount = react.render(registrations[1].component).mount(element('div', document))
  await settle()
  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  assert.equal(frame.getAttribute('data-sidebar-browser-frame'), '')
  assert.equal(ctx.shortcuts.commands.length, 2)
  const commands = [...ctx.shortcuts.commands]
  assert.deepEqual(JSON.parse(JSON.stringify(commands.map((c) => c.defaults['desktop:windows']))), [{ code: 'F5', modifiers: [] }, { code: 'KeyR', modifiers: ['primary'] }])
  for (const command of commands) {
    const resolved = command.resolve({ source: 'webview', region: 'page', modal: null, target: frame })
    assert.equal(resolved.status, 'handled')
    resolved.run()
    assert.equal(command.resolve({ region: 'page', modal: 'dialog' }).status, 'pass')
    assert.equal(command.resolve({ region: 'terminal', modal: null }).status, 'pass')
  }
  assert.equal(frame.reloads, 2)
  assert.equal(document.created.some((el) => el.className === 'dsh-wc-refresh'), false)
  unmount.forEach((fn) => fn())
  assert.equal(ctx.shortcuts.commands.length, 0)
  assert.equal(commands[0].resolve({ region: 'page', modal: null }).status, 'pass')
  assert.equal(frame.reloads, 2)
})

test('AUDIT: no periodic save while the login is still being restored', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, react, requests, intervals } = loadPlugin(document, { restoreStorage: [['userToken', 'saved-login']] })
  plugin.apply(ctx)
  react.render(registrations[1].component).mount(element('div', document))
  await settle()
  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  frame.reply = JSON.stringify({ storage: [], cookie: '' })
  await [...intervals.values()][0].fn()
  await settle()
  assert.equal(requests.filter((r) => r.path.endsWith('/session/save')).length, 0, 'empty guest data must not overwrite the login snapshot before restore completes')
})

test('AUDIT: use the host popup bridge so window.open links are not lost', async () => {
  const document = makeDocument()
  const subscriptions = []
  const { plugin, ctx, registrations, react } = loadPlugin(document, { bridge: {
    acquire: async () => ({ lease: 'lease-1', partition: 'dsh-sidebar-browser-test' }),
    release: async () => {},
    onOpenRequested: (lease, fn) => { subscriptions.push({ lease, fn }); return () => {} },
  } })
  plugin.apply(ctx)
  react.render(registrations[1].component).mount(element('div', document))
  await settle()
  assert.equal(subscriptions.length, 1, 'rc.2 emits blocked window.open requests here; an anchor click patch cannot handle them')
})

test('AUDIT: a fresh login restore must not write tokens into an OAuth origin', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, react } = loadPlugin(document, { restoreStorage: [['userToken', 'saved-login']] })
  plugin.apply(ctx)
  react.render(registrations[1].component).mount(element('div', document))
  await settle()
  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  frame.getURL = () => 'https://accounts.google.com/signin'
  frame.dispatch('did-finish-load', {})
  await settle()
  assert.equal(frame.scripts.some((s) => s.includes('saved-login') && s.includes('setItem')), false, 'restore must be scoped to chat.deepseek.com')
})

test('snapshots on a foreign page never replace the DeepSeek login', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, react, requests, intervals } = loadPlugin(document)
  plugin.apply(ctx)
  react.render(registrations[1].component).mount(element('div', document))
  await settle()
  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  frame.currentUrl = 'https://accounts.google.com/signin'
  frame.reply = JSON.stringify({ storage: [['google', 'foreign']], cookie: 'google=foreign' })
  frame.dispatch('did-finish-load', {})
  await [...intervals.values()][0].fn()
  await settle()
  assert.equal(requests.filter((r) => r.path.endsWith('/session/save')).length, 0)
})

test('restoration failures preserve the old login across timers and disposal', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, react, requests, intervals, effects, sandbox, beacons } = loadPlugin(document, { restoreStorage: [['userToken', 'saved-login']] })
  plugin.apply(ctx)
  react.render(registrations[1].component).mount(element('div', document))
  await settle()
  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  frame.executeJavaScript = () => Promise.reject(new Error('navigation interrupted'))
  frame.dispatch('did-finish-load', {})
  await settle()
  await [...intervals.values()][0].fn()
  for (const fn of sandbox.window.listeners.beforeunload) fn({})
  effects.map((fn) => fn()).filter((fn) => typeof fn === 'function').forEach((fn) => fn())
  await settle()
  assert.equal(beacons.length, 0)
  assert.equal(requests.filter((r) => r.path.endsWith('/session/save')).length, 0)
})

test('periodic saves stay blocked until the post-restore reload has finished', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, react, requests, intervals } = loadPlugin(document, { restoreStorage: [['userToken', 'saved-login']] })
  plugin.apply(ctx)
  react.render(registrations[1].component).mount(element('div', document))
  await settle()
  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  frame.dispatch('did-finish-load', {})
  await settle()
  await [...intervals.values()][0].fn()
  await settle()
  assert.equal(requests.filter((r) => r.path.endsWith('/session/save')).length, 0)
  frame.reply = JSON.stringify({ origin: PAGE_URL.slice(0, -1), storage: [['userToken', 'saved-login']], cookie: '' })
  frame.dispatch('did-finish-load', {})
  await settle()
  assert.equal(requests.filter((r) => r.path.endsWith('/session/save')).length, 1)
})

test('injected session scripts verify their own origin before accessing credentials', async () => {
  const document = makeDocument()
  const { plugin, ctx, registrations, react } = loadPlugin(document, { restoreStorage: [['userToken', 'saved-login']] })
  plugin.apply(ctx)
  react.render(registrations[1].component).mount(element('div', document))
  await settle()
  const frame = document.created.find((el) => el.tagName === 'WEBVIEW')
  frame.dispatch('did-finish-load', {})
  await settle()
  const page = { location: { origin: 'https://accounts.google.com' } }
  Object.defineProperty(page, 'localStorage', { get() { throw new Error('foreign storage accessed') } })
  assert.equal(vm.runInNewContext(frame.scripts[0], page), false)
  frame.dispatch('did-finish-load', {})
  await settle()
  assert.equal(vm.runInNewContext(frame.scripts[1], page), null)
})
