/**
 * The /api/dsh-webchat route family: engine state, browser login control,
 * chat operations (new chat / send / stop / switch model), transcript
 * export, and the harness transfer that seeds a new session with a web
 * transcript. Every route carries the same loopback-only trust fence the
 * dsh-ssh plugin uses — these endpoints drive a browser and create sessions,
 * so LAN-exposed deployments must not serve them.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { DeepSeekWebEngine } from './engine/engine.ts'
import type { TranscriptStore } from './store.ts'
import type { WebChatTranscript } from './protocol.ts'
import { exportTranscriptFile, transferToHarnessSession } from './transfer.ts'
import type { DistillConfig } from './transfer.ts'

/** Cap on JSON request bodies (chat ops are small). */
const MAX_JSON_BODY_BYTES = 64 * 1024

/** Loopback-only trust fence (mirrors dsh-ssh). */
function isLoopbackRequest(req: IncomingMessage): boolean {
  const host = req.headers.host ?? ''
  const address = req.socket.remoteAddress ?? ''
  const loopbackHost = host.startsWith('127.0.0.1') || host.startsWith('localhost') || host.startsWith('[::1]')
  const loopbackAddr = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address === undefined
  return loopbackHost && loopbackAddr
}

/** One JSON response. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(payload)
}

/** Read a JSON request body. */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_JSON_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function stringField(body: Record<string, unknown> | undefined, name: string): string | undefined {
  const value = body?.[name]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Route family dependencies. */
export interface WebChatRoutesDeps {
  ctx: Context
  engine: DeepSeekWebEngine
  store: TranscriptStore
  distill: DistillConfig
}

/** Build every /api/dsh-webchat route. */
export function makeRoutes(deps: WebChatRoutesDeps): WebRoute[] {
  const { ctx, engine, store, distill } = deps

  const guard = (req: IncomingMessage, res: ServerResponse): boolean => {
    if (isLoopbackRequest(req)) return true
    writeJson(res, 403, { ok: false, error: 'loopback only' })
    return false
  }

  const stateView = async (): Promise<Record<string, unknown>> => {
    const status = await engine.status()
    return {
      ok: true,
      engine: status.engine,
      engineError: status.engineError,
      loggedIn: status.loggedIn,
      pageUrl: status.pageUrl,
      deepThink: status.deepThink,
      search: status.search,
      busy: status.busy,
      lastError: status.lastError,
      lastErrorCode: status.lastErrorCode,
      activeChatId: store.activeChat()?.id,
      chats: store.list(),
    }
  }

  return [
    {
      kind: 'exact',
      path: '/api/dsh-webchat/state',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        writeJson(res, 200, await stateView())
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-webchat/open-login',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const result = await engine.openLoginWindow()
        writeJson(res, result.ok ? 200 : 500, { ok: result.ok, error: result.error })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-webchat/close-browser',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        await engine.disposeBrowser()
        writeJson(res, 200, { ok: true })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-webchat/new-chat',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const result = await engine.newChat()
        writeJson(res, result.ok ? 200 : 500, result)
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-webchat/send',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const body = await readJsonBody(req)
        const text = stringField(body, 'text')
        if (text === undefined) {
          writeJson(res, 400, { ok: false, error: '缺少 text 字段' })
          return
        }
        // GUI sends resolve immediately; the reply streams in the background
        // into the transcript and the panel polls /state for live updates.
        const images = Array.isArray(body?.['images'])
          ? (body['images'] as unknown[]).filter(value => typeof value === 'string').map(value => value as string)
          : undefined
        const result = await engine.send(text, false, images)
        writeJson(res, result.ok ? 200 : 500, result)
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-webchat/stop',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        await engine.stop()
        writeJson(res, 200, { ok: true })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-webchat/deep-think',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const body = await readJsonBody(req)
        const enabled = typeof body?.['enabled'] === 'boolean' ? body['enabled'] : undefined
        if (enabled === undefined) {
          writeJson(res, 400, { ok: false, error: '缺少 enabled 字段' })
          return
        }
        const result = await engine.setDeepThink(enabled)
        writeJson(res, result.ok ? 200 : 500, result)
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-webchat/search',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const body = await readJsonBody(req)
        const enabled = typeof body?.['enabled'] === 'boolean' ? body['enabled'] : undefined
        if (enabled === undefined) {
          writeJson(res, 400, { ok: false, error: '缺少 enabled 字段' })
          return
        }
        const result = await engine.setSearch(enabled)
        writeJson(res, result.ok ? 200 : 500, result)
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-webchat/transfer',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const body = await readJsonBody(req)
        const chatId = stringField(body, 'chatId') ?? store.activeChat()?.id
        const cwd = stringField(body, 'cwd')
        const workspaceId = stringField(body, 'workspaceId')
        const targetSessionId = stringField(body, 'targetSessionId')
        const mode = body?.['mode'] === 'raw' ? 'raw' : body?.['mode'] === 'distill' ? 'distill' : undefined
        const transcript: WebChatTranscript | undefined = chatId === undefined ? undefined : store.getChat(chatId)
        if (transcript === undefined) {
          writeJson(res, 404, { ok: false, error: '找不到该对话记录' })
          return
        }
        try {
          const workspace = workspaceId === undefined ? undefined : { workspaceId }
          const { sessionId, distilled, attached, workspaceId: attachedWorkspaceId } = await transferToHarnessSession(ctx, { transcript, cwd, workspace, targetSessionId }, distill, mode)
          writeJson(res, 200, { ok: true, sessionId, distilled, attached, continued: targetSessionId !== undefined, workspaceId: attachedWorkspaceId })
        } catch (error) {
          writeJson(res, 500, { ok: false, error: String(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-webchat/export',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const body = await readJsonBody(req)
        const chatId = stringField(body, 'chatId') ?? store.activeChat()?.id
        const cwd = stringField(body, 'cwd')
        const transcript: WebChatTranscript | undefined = chatId === undefined ? undefined : store.getChat(chatId)
        if (transcript === undefined) {
          writeJson(res, 404, { ok: false, error: '找不到该对话记录' })
          return
        }
        try {
          const { filePath } = exportTranscriptFile({ transcript, cwd })
          writeJson(res, 200, { ok: true, filePath })
        } catch (error) {
          writeJson(res, 500, { ok: false, error: String(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-webchat/web-chats',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const web = await engine.listWebConversations()
        const localTitles = new Set(store.titles())
        const missing = web.filter(item => !localTitles.has(item.title)).map(item => item.title)
        writeJson(res, 200, { ok: true, web, missing })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-webchat/recover',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const body = await readJsonBody(req)
        const title = stringField(body, 'title')
        if (title === undefined) {
          writeJson(res, 400, { ok: false, error: '缺少 title 字段' })
          return
        }
        const result = await engine.recoverWebConversation(title)
        writeJson(res, result.ok ? 200 : 500, result)
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-webchat/rename',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const body = await readJsonBody(req)
        const chatId = stringField(body, 'chatId')
        const title = stringField(body, 'title')
        if (chatId === undefined || title === undefined) {
          writeJson(res, 400, { ok: false, error: '缺少 chatId 或 title 字段' })
          return
        }
        const renamed = store.renameChat(chatId, title)
        if (renamed === undefined) writeJson(res, 404, { ok: false, error: '找不到该对话记录' })
        else writeJson(res, 200, { ok: true })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-webchat/delete',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const body = await readJsonBody(req)
        const chatId = stringField(body, 'chatId')
        if (chatId === undefined) {
          writeJson(res, 400, { ok: false, error: '缺少 chatId 字段' })
          return
        }
        const deleted = store.deleteChat(chatId)
        if (!deleted) writeJson(res, 404, { ok: false, error: '找不到该对话记录' })
        else writeJson(res, 200, { ok: true })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-webchat/clear',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        const count = store.clearAllChats()
        writeJson(res, 200, { ok: true, count })
      },
    },
  ]
}
