/**
 * Host-half tests.
 *
 * The host half registers four routes, keeps the browser guest's session on
 * disk, and picks a window strategy. None of that needs a browser, a window or
 * a network call: the Electron lookup and the snapshot path are injectable, and
 * the cookie transfer is pure.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const {
  apply,
  openPage,
  PAGE_URL,
  ROUTES,
  SESSION_FILE,
  captureCookies,
  readSnapshot,
  restoreCookies,
  setElectronLoader,
  setSessionFile,
  shellExecutable,
  writeSnapshot,
} = await import('../lib/index.js')

/** A throwaway snapshot path, so no test ever touches the real profile. */
function tempSnapshot() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-webchat-test-'))
  return { file: join(dir, 'session.json'), cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/** A fake `session.cookies`, recording what gets written. */
function fakeCookies(initial = []) {
  const store = [...initial]
  return {
    written: [],
    async get() {
      return store
    },
    async set(details) {
      this.written.push(details)
      if (details.name === 'rejected') throw new Error('invalid cookie')
    },
  }
}

/** Stand in for the Electron main process. */
function fakeElectron(cookies) {
  return { session: { fromPartition: () => ({ cookies }) } }
}

/** Host context stand-in recording every registered route. */
function fakeContext() {
  const routes = []
  const effects = []
  const ctx = {
    effect: (fn, label) => {
      const dispose = fn()
      effects.push({ label, dispose })
      return () => { if (typeof dispose === 'function') dispose() }
    },
    webServer: {
      register: (route) => {
        routes.push(route)
        return () => {}
      },
    },
  }
  return { ctx, routes, effects }
}

/** Minimal ServerResponse stand-in. */
function fakeResponse() {
  return {
    status: 0,
    headers: undefined,
    body: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(chunk) {
      if (chunk !== undefined) this.body += String(chunk)
    },
  }
}

/** Minimal IncomingMessage stand-in that replays one JSON body. */
function fakeRequest(method, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return {
    method,
    destroyed: false,
    on(event, handler) {
      if (event === 'data') chunks.forEach((chunk) => handler(chunk))
      if (event === 'end') handler()
      return this
    },
    destroy() {
      this.destroyed = true
    },
  }
}

/** Call a registered route and decode its JSON answer. */
async function callRoute(routes, path, method, body) {
  const route = routes.find((entry) => entry.path === path)
  assert.ok(route !== undefined, `route ${path} was not registered`)
  const response = fakeResponse()
  await route.handler(fakeRequest(method, body), response)
  return { status: response.status, headers: response.headers, payload: response.body === '' ? undefined : JSON.parse(response.body) }
}

test('apply registers the state, open and session routes', () => {
  const { ctx, routes, effects } = fakeContext()
  apply(ctx)

  assert.deepEqual(routes.map(route => route.path), [ROUTES.state, ROUTES.open, ROUTES.restore, ROUTES.save])
  assert.ok(routes.every(route => route.kind === 'exact'))
  assert.equal(effects.length, 4)
})

test('the state route reports the page and the closed window', async () => {
  const { ctx, routes } = fakeContext()
  apply(ctx)
  const state = routes.find(route => route.path === ROUTES.state)
  const response = fakeResponse()

  await state.handler({ method: 'GET' }, response)

  assert.equal(response.status, 200)
  const payload = JSON.parse(response.body)
  assert.equal(payload.url, PAGE_URL)
  assert.equal(payload.appWindowOpen, false)
  assert.equal(typeof payload.last.ok, 'boolean')
  assert.ok(Array.isArray(payload.attempts))
})

test('the state route reports every strategy that ran, failures included', async () => {
  const { ctx, routes } = fakeContext()
  apply(ctx)
  const state = routes.find(route => route.path === ROUTES.state)

  await openPage([
    { via: 'app-window', run: async () => { throw new Error('esm import failed: not found | cjs require failed: not found') } },
    { via: 'app-window-shell', run: async () => 'app-window-shell' },
    { via: 'system-browser', run: async () => 'system-browser' },
  ])

  const response = fakeResponse()
  await state.handler({ method: 'GET' }, response)
  const payload = JSON.parse(response.body)

  assert.deepEqual(payload.attempts.map(a => [a.via, a.ok]), [['app-window', false], ['app-window-shell', true]])
  assert.match(payload.attempts[0].error, /cjs require failed/)
  assert.equal(payload.last.ok, true)
})

test('the state route refuses anything but GET', async () => {
  const { ctx, routes } = fakeContext()
  apply(ctx)
  const state = routes.find(route => route.path === ROUTES.state)
  const response = fakeResponse()

  await state.handler({ method: 'POST' }, response)

  assert.equal(response.status, 405)
  assert.equal(response.headers.allow, 'GET')
})

test('the open route refuses anything but POST', async () => {
  const { ctx, routes } = fakeContext()
  apply(ctx)
  const open = routes.find(route => route.path === ROUTES.open)
  const response = fakeResponse()

  await open.handler({ method: 'GET' }, response)

  assert.equal(response.status, 405)
  assert.equal(response.headers.allow, 'POST')
})

test('openPage takes the first strategy that works', async () => {
  const tried = []
  const result = await openPage([
    { via: 'first', run: async () => { tried.push('first'); throw new Error('denied') } },
    { via: 'second', run: async () => { tried.push('second'); return 'second-detail' } },
    { via: 'third', run: async () => { tried.push('third'); return 'third' } },
  ])

  assert.deepEqual(tried, ['first', 'second'])
  assert.equal(result.ok, true)
  assert.equal(result.via, 'second-detail')
})

test('openPage reports the last failure when every strategy fails', async () => {
  const result = await openPage([
    { via: 'only', run: async () => { throw new Error('no way to open') } },
  ])

  assert.equal(result.ok, false)
  assert.equal(result.via, 'only')
  assert.equal(result.error, 'no way to open')
})

test('shellExecutable answers with a path or undefined', () => {
  const found = shellExecutable()
  assert.ok(found === undefined || typeof found === 'string')
})

test('a snapshot round-trips through disk and a missing file reads as null', () => {
  const { file, cleanup } = tempSnapshot()
  try {
    assert.equal(readSnapshot(file), null, 'a missing snapshot must read as nothing')

    writeSnapshot(file, {
      version: 1,
      savedAt: '2026-09-29T00:00:00.000Z',
      cookies: [{ name: 'a', value: 'b' }],
      storage: [['userToken', 'secret']],
    })
    const snapshot = readSnapshot(file)
    assert.deepEqual(snapshot.cookies, [{ name: 'a', value: 'b' }])
    assert.deepEqual(snapshot.storage, [['userToken', 'secret']])
    assert.equal(snapshot.savedAt, '2026-09-29T00:00:00.000Z')
    assert.ok(readFileSync(file, 'utf8').includes('userToken'), 'the file must hold the storage')

    // A corrupt file is not worth crashing the guest over.
    writeSnapshot(file, { cookies: 'not an array', storage: null })
    assert.deepEqual(readSnapshot(file), { cookies: [], storage: [], savedAt: '' })
  } finally {
    cleanup()
  }
})

test('captureCookies keeps what a restore needs, HttpOnly included', async () => {
  const cookies = fakeCookies([
    { name: 'ds_session_id', value: 'abc', domain: '.deepseek.com', path: '/', secure: true, httpOnly: true, expirationDate: 1790000000, sameSite: 'no_restriction' },
    { name: 'plain', value: '1', domain: 'chat.deepseek.com', path: '/', secure: true, httpOnly: false },
  ])

  const captured = await captureCookies(cookies)

  assert.equal(captured.length, 2)
  assert.equal(captured[0].httpOnly, true)
  assert.equal(captured[0].expirationDate, 1790000000)
  assert.equal(captured[0].sameSite, 'no_restriction')
  assert.equal(captured[1].httpOnly, false)
  assert.ok(!('expirationDate' in captured[1]), 'a session cookie must stay a session cookie')
})

test('restoreCookies rebuilds each cookie and survives a refused one', async () => {
  const cookies = fakeCookies()
  const restored = await restoreCookies(cookies, {
    cookies: [
      { name: 'ds_session_id', value: 'abc', domain: '.deepseek.com', path: '/', secure: true, httpOnly: true },
      { name: 'rejected', value: 'x', domain: 'chat.deepseek.com', path: '/' },
      { name: 'no-domain', value: 'x' },
      { value: 'no name at all', domain: 'chat.deepseek.com' },
      'not an object',
    ],
  })

  assert.equal(restored, 1, 'only the cookie Electron accepted counts as restored')
  assert.equal(cookies.written.length, 2, 'the refused cookie is still attempted, the malformed ones are not')
  assert.deepEqual(cookies.written[0], {
    url: 'https://deepseek.com/',
    name: 'ds_session_id',
    value: 'abc',
    domain: '.deepseek.com',
    path: '/',
    secure: true,
    httpOnly: true,
  })
  assert.equal(cookies.written[1].name, 'rejected')
  assert.equal(cookies.written[1].url, 'http://chat.deepseek.com/', 'a non-secure cookie restores over http')
})

test('the session routes refuse anything but POST', async () => {
  const { ctx, routes } = fakeContext()
  apply(ctx)

  for (const path of [ROUTES.restore, ROUTES.save]) {
    const answer = await callRoute(routes, path, 'GET')
    assert.equal(answer.status, 405, `${path} must refuse GET`)
    assert.equal(answer.headers.allow, 'POST')
  }
})

test('the session routes reject a partition the shell never issued', async () => {
  const { file, cleanup } = tempSnapshot()
  setSessionFile(file)
  setElectronLoader(async () => fakeElectron(fakeCookies()))
  try {
    const { ctx, routes } = fakeContext()
    apply(ctx)

    for (const path of [ROUTES.restore, ROUTES.save]) {
      const answer = await callRoute(routes, path, 'POST', { partition: 'persist:something-else' })
      assert.match(answer.payload.error, /not a browser-guest partition/)
    }
  } finally {
    setElectronLoader(null)
    setSessionFile(null)
    cleanup()
  }
})

test('saving snapshots the partition cookies and the page storage', async () => {
  const { file, cleanup } = tempSnapshot()
  setSessionFile(file)
  const cookies = fakeCookies([
    { name: 'ds_session_id', value: 'abc', domain: '.deepseek.com', path: '/', secure: true, httpOnly: true },
  ])
  setElectronLoader(async () => fakeElectron(cookies))
  try {
    const { ctx, routes } = fakeContext()
    apply(ctx)

    const answer = await callRoute(routes, ROUTES.save, 'POST', {
      partition: 'dsh-sidebar-browser-11111111-2222-3333-4444-555555555555',
      storage: [['userToken', 'secret']],
    })

    assert.equal(answer.status, 200)
    assert.deepEqual(answer.payload, { ok: true, cookies: 1, storage: 1 })
    const snapshot = readSnapshot(file)
    assert.equal(snapshot.cookies[0].httpOnly, true)
    assert.deepEqual(snapshot.storage, [['userToken', 'secret']])

    // The unload beacon carries no storage and must not erase what was saved.
    const beacon = await callRoute(routes, ROUTES.save, 'POST', {
      partition: 'dsh-sidebar-browser-11111111-2222-3333-4444-555555555555',
    })
    assert.equal(beacon.payload.storage, 1)
    assert.deepEqual(readSnapshot(file).storage, [['userToken', 'secret']])
  } finally {
    setElectronLoader(null)
    setSessionFile(null)
    cleanup()
  }
})

test('restoring puts the cookies back and answers with the page storage', async () => {
  const { file, cleanup } = tempSnapshot()
  setSessionFile(file)
  writeSnapshot(file, {
    version: 1,
    savedAt: '2026-09-29T00:00:00.000Z',
    cookies: [{ name: 'ds_session_id', value: 'abc', domain: '.deepseek.com', path: '/', secure: true, httpOnly: true }],
    storage: [['userToken', 'secret']],
  })
  const cookies = fakeCookies()
  setElectronLoader(async () => fakeElectron(cookies))
  try {
    const { ctx, routes } = fakeContext()
    apply(ctx)

    const answer = await callRoute(routes, ROUTES.restore, 'POST', {
      partition: 'dsh-sidebar-browser-11111111-2222-3333-4444-555555555555',
    })

    assert.equal(answer.status, 200)
    assert.equal(answer.payload.ok, true)
    assert.equal(answer.payload.cookies, 1)
    assert.deepEqual(answer.payload.storage, [['userToken', 'secret']])
    assert.equal(cookies.written.length, 1)
    assert.equal(cookies.written[0].httpOnly, true)
  } finally {
    setElectronLoader(null)
    setSessionFile(null)
    cleanup()
  }
})

test('restoring without a snapshot is a no-op, not a failure', async () => {
  const { file, cleanup } = tempSnapshot()
  setSessionFile(file)
  const cookies = fakeCookies()
  setElectronLoader(async () => fakeElectron(cookies))
  try {
    const { ctx, routes } = fakeContext()
    apply(ctx)

    const answer = await callRoute(routes, ROUTES.restore, 'POST', {
      partition: 'dsh-sidebar-browser-11111111-2222-3333-4444-555555555555',
    })

    assert.equal(answer.status, 200)
    assert.deepEqual(answer.payload, { ok: true, cookies: 0, storage: null, savedAt: '' })
    assert.equal(cookies.written.length, 0)
    assert.equal(SESSION_FILE(), file)
  } finally {
    setElectronLoader(null)
    setSessionFile(null)
    cleanup()
  }
})

test('a host without Electron reports why instead of failing the guest', async () => {
  const { file, cleanup } = tempSnapshot()
  setSessionFile(file)
  writeSnapshot(file, { version: 1, savedAt: '', cookies: [], storage: [['userToken', 'secret']] })
  setElectronLoader(async () => { throw new Error('cjs require failed: MODULE_NOT_FOUND') })
  try {
    const { ctx, routes } = fakeContext()
    apply(ctx)

    const restore = await callRoute(routes, ROUTES.restore, 'POST', {
      partition: 'dsh-sidebar-browser-11111111-2222-3333-4444-555555555555',
    })
    assert.equal(restore.status, 200, 'the guest must still be allowed to load')
    assert.equal(restore.payload.ok, false)
    assert.match(restore.payload.error, /MODULE_NOT_FOUND/)

    const save = await callRoute(routes, ROUTES.save, 'POST', {
      partition: 'dsh-sidebar-browser-11111111-2222-3333-4444-555555555555',
      storage: [['userToken', 'secret']],
    })
    assert.equal(save.status, 502)
    assert.equal(save.payload.ok, false)
  } finally {
    setElectronLoader(null)
    setSessionFile(null)
    cleanup()
  }
})
