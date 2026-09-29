/**
 * Launcher tests.
 *
 * The host half only registers two routes and picks a window strategy, so both
 * are exercised without a browser, a window or a network call.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { apply, openPage, PAGE_URL, ROUTES, shellExecutable } = await import('../lib/index.js')

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

test('apply registers exactly the state and open routes', () => {
  const { ctx, routes, effects } = fakeContext()
  apply(ctx)

  assert.deepEqual(routes.map(route => route.path), [ROUTES.state, ROUTES.open])
  assert.ok(routes.every(route => route.kind === 'exact'))
  assert.equal(effects.length, 2)
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
