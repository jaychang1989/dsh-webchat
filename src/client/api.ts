/**
 * Browser-side API client for the /api/dsh-webchat route family. The only
 * data access path the panel components use — plain fetch, same origin.
 */

import { WEBChat_API, type TransferMode, type WebChatState } from '../protocol.ts'

/** Shape every /api/dsh-webchat response carries: ok plus optional error. */
interface ApiResult {
  ok: boolean
  error?: string
}

/** Endpoint payloads always extend ApiResult. */
type EndpointResult<T> = T & ApiResult

async function request<T>(path: string, body?: unknown): Promise<EndpointResult<T>> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => ({}))) as EndpointResult<T>
  if (!response.ok && payload.ok !== true) {
    return { ...payload, ok: false, error: payload.error ?? `HTTP ${response.status}` }
  }
  return payload
}

export class WebChatApi {
  state(): Promise<EndpointResult<WebChatState>> {
    return request<WebChatState>(WEBChat_API.state)
  }

  openLogin(): Promise<EndpointResult<{ ok: boolean }>> {
    return request<{ ok: boolean }>(WEBChat_API.openLogin)
  }

  closeBrowser(): Promise<EndpointResult<{ ok: boolean }>> {
    return request<{ ok: boolean }>(WEBChat_API.closeBrowser)
  }

  newChat(): Promise<EndpointResult<{ ok: boolean; chatId?: string }>> {
    return request<{ ok: boolean; chatId?: string }>(WEBChat_API.newChat)
  }

  send(text: string, images?: string[]): Promise<EndpointResult<{ ok: boolean; chatId?: string }>> {
    return request<{ ok: boolean; chatId?: string }>(WEBChat_API.send, { text, images })
  }

  stop(): Promise<EndpointResult<{ ok: boolean }>> {
    return request<{ ok: boolean }>(WEBChat_API.stop)
  }

  setDeepThink(enabled: boolean): Promise<EndpointResult<{ ok: boolean }>> {
    return request<{ ok: boolean }>(WEBChat_API.deepThink, { enabled })
  }

  setSearch(enabled: boolean): Promise<EndpointResult<{ ok: boolean }>> {
    return request<{ ok: boolean }>(WEBChat_API.search, { enabled })
  }

  transfer(chatId: string, cwd?: string, mode?: TransferMode, workspaceId?: string, targetSessionId?: string): Promise<EndpointResult<{ ok: boolean; sessionId?: string; distilled?: boolean; attached?: boolean; continued?: boolean; workspaceId?: string }>> {
    return request<{ ok: boolean; sessionId?: string; distilled?: boolean; attached?: boolean; continued?: boolean; workspaceId?: string }>(WEBChat_API.transfer, { chatId, cwd, mode, workspaceId, targetSessionId })
  }

  exportFile(chatId: string, cwd?: string): Promise<EndpointResult<{ ok: boolean; filePath?: string }>> {
    return request<{ ok: boolean; filePath?: string }>(WEBChat_API.exportFile, { chatId, cwd })
  }

  renameChat(chatId: string, title: string): Promise<EndpointResult<{ ok: boolean }>> {
    return request<{ ok: boolean }>(WEBChat_API.renameChat, { chatId, title })
  }

  deleteChat(chatId: string): Promise<EndpointResult<{ ok: boolean }>> {
    return request<{ ok: boolean }>(WEBChat_API.deleteChat, { chatId })
  }

  clearChats(): Promise<EndpointResult<{ ok: boolean; count?: number }>> {
    return request<{ ok: boolean; count?: number }>(WEBChat_API.clearChats)
  }

  webChats(): Promise<EndpointResult<{ ok: boolean; web: Array<{ title: string }>; missing: string[] }>> {
    return request<{ ok: boolean; web: Array<{ title: string }>; missing: string[] }>(WEBChat_API.webChats)
  }

  recover(title: string): Promise<EndpointResult<{ ok: boolean; chatId?: string; title?: string; created?: boolean }>> {
    return request<{ ok: boolean; chatId?: string; title?: string; created?: boolean }>(WEBChat_API.recover, { title })
  }
}
