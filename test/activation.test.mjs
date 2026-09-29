/**
 * Activation and transfer tests against a fake host context.
 *
 * These do not need a browser or a DeepSeek login: they drive the plugin's
 * `apply()` and the `webchat_transfer` tool through a stand-in
 * session-persistence backend, which is exactly the seam the dsh 0.2.x
 * migration changed. Run them after `pnpm install` (the host half imports
 * `@deepseek-ai/dsh-llm`, `dsh-session` and `dsh-tools`).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { apply } = await import('../lib/index.js')

const CHAT_ID = 'chat-test-1'

/** A temp data dir holding one stored two-message conversation. */
function seedDataDir() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-webchat-test-'))
  const dataDir = join(root, 'data')
  const cwd = join(root, 'work')
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(cwd, { recursive: true })
  const now = Date.now()
  writeFileSync(join(dataDir, 'transcripts.json'), JSON.stringify({
    version: 1,
    activeChatId: CHAT_ID,
    chats: [{
      id: CHAT_ID,
      title: '测试对话',
      createdAt: now,
      updatedAt: now,
      model: 'deepseek-chat',
      messages: [
        { id: 'm1', role: 'user', content: '帮我设计一个限流器', ts: now },
        { id: 'm2', role: 'assistant', content: '可以用令牌桶……', ts: now + 1 },
      ],
      streaming: false,
    }],
  }))
  return { dataDir, cwd }
}

/**
 * Handle seam stand-in. `open(id, 'write')` claims the id once, so a second
 * writer on the same session fails exactly like the real backend.
 */
function fakePersistence() {
  const handles = []
  const claimed = new Set()
  const make = (access) => {
    const handle = {
      access,
      appended: [],
      events: [],
      flushed: false,
      closed: false,
      async read(offset = 0) { return { events: this.events.slice(offset) } },
      async append(events) { this.appended.push(...events); this.events.push(...events) },
      async flush() { this.flushed = true },
      async close() { this.closed = true },
    }
    handles.push(handle)
    return handle
  }
  return {
    handles,
    async create() { return make('write') },
    async open(id, access) {
      if (access === 'write' && claimed.has(id)) throw new Error(`session "${id}" is already owned`)
      claimed.add(id)
      const handle = make(access)
      // The stored log already ends at turn 2 / seq 5.
      handle.events = [
        { type: 'turn/start', seq: 4, time: Date.now(), data: { turn: 2 } },
        { type: 'turn/end', seq: 5, time: Date.now(), data: { turn: 2, reason: 'completed' } },
      ]
      return handle
    },
  }
}

/** Host context stand-in recording every surface the plugin registers. */
function fakeContext(persistence) {
  const surfaces = { routes: [], tools: [], sections: [] }
  const ctx = {
    fiber: {},
    effect: (fn) => { const dispose = fn(); return () => { if (typeof dispose === 'function') dispose() } },
    on: () => () => {},
    inject: () => {},
    get: (name) => (name === 'sessionPersistence' ? persistence : undefined),
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    systemPrompt: { section: (section) => { surfaces.sections.push(section); return () => {} } },
    webServer: { register: (route) => { surfaces.routes.push(route); return () => {} } },
    tools: { register: (tool) => { surfaces.tools.push(tool); return () => {} } },
    loader: { entries: () => [] },
  }
  return { ctx, surfaces }
}

test('apply registers the routes, agent tools and prompt section', () => {
  const { dataDir } = seedDataDir()
  const { ctx, surfaces } = fakeContext(fakePersistence())
  apply(ctx, { dataDir, transferDistill: false })

  assert.equal(surfaces.routes.length, 15)
  assert.ok(surfaces.routes.every(route => route.kind === 'exact' && route.path.startsWith('/api/dsh-webchat/')))
  assert.deepEqual(
    surfaces.tools.map(tool => tool.name).sort(),
    ['webchat_import', 'webchat_recover', 'webchat_send', 'webchat_status', 'webchat_transfer'],
  )
  assert.deepEqual(surfaces.sections.map(section => section.name), ['plugin:dsh-webchat'])
})

test('enabled: false registers nothing', () => {
  const { dataDir } = seedDataDir()
  const { ctx, surfaces } = fakeContext(fakePersistence())
  apply(ctx, { dataDir, enabled: false })

  assert.equal(surfaces.routes.length, 0)
  assert.equal(surfaces.tools.length, 0)
  assert.equal(surfaces.sections.length, 0)
})

test('transfer creates a cold session through a write handle and closes it', async () => {
  const { dataDir, cwd } = seedDataDir()
  const persistence = fakePersistence()
  const { ctx, surfaces } = fakeContext(persistence)
  apply(ctx, { dataDir, transferDistill: false })

  const transfer = surfaces.tools.find(tool => tool.name === 'webchat_transfer')
  const result = await transfer.execute({ chatId: CHAT_ID, cwd })

  assert.match(result.sessionId, /^session-/)
  assert.equal(result.continued, false)

  const handle = persistence.handles.at(-1)
  // Seed message + pinned title.
  assert.equal(handle.appended.length, 2)
  assert.deepEqual(handle.appended.map(event => event.seq), [0, 1])
  assert.equal(handle.flushed, true)
  assert.equal(handle.closed, true)
})

test('transfer continues an existing session at the next contiguous seq', async () => {
  const { dataDir } = seedDataDir()
  const persistence = fakePersistence()
  const { ctx, surfaces } = fakeContext(persistence)
  apply(ctx, { dataDir, transferDistill: false })

  const transfer = surfaces.tools.find(tool => tool.name === 'webchat_transfer')
  const result = await transfer.execute({ chatId: CHAT_ID, targetSessionId: 'session-existing-1' })

  assert.equal(result.sessionId, 'session-existing-1')
  assert.equal(result.continued, true)

  const handle = persistence.handles.at(-1)
  // The stored log ended at seq 5, so the new turn starts at 6.
  assert.deepEqual(handle.appended.map(event => event.seq), [6, 7, 8])
  assert.equal(handle.flushed, true)
  assert.equal(handle.closed, true)
})

test('transfer reports a session another writer owns instead of failing silently', async () => {
  const { dataDir } = seedDataDir()
  const { ctx, surfaces } = fakeContext(fakePersistence())
  apply(ctx, { dataDir, transferDistill: false })

  const transfer = surfaces.tools.find(tool => tool.name === 'webchat_transfer')
  await transfer.execute({ chatId: CHAT_ID, targetSessionId: 'session-existing-1' })
  const second = await transfer.execute({ chatId: CHAT_ID, targetSessionId: 'session-existing-1' })

  assert.equal(second.sessionId, '')
  assert.match(second.error, /无法以写入方式打开该会话/)
})
