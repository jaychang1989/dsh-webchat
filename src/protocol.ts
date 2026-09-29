/**
 * Shared wire surface of the dsh-webchat plugin: API paths, transcript data
 * model, and engine status views. Imported by both the host routes and the
 * browser panel (the client bundle inlines it — no shared runtime identity).
 */

/** One transcript message (markdown text). */
export interface WebChatMessage {
  /** Local stable id. */
  readonly id: string
  readonly role: 'user' | 'assistant'
  /** Markdown body. */
  readonly content: string
  /** Unix epoch ms. */
  readonly ts: number
  /** True while the engine is still streaming this message. */
  readonly streaming?: boolean
  /** Set when the exchange failed (content may be partial). */
  readonly error?: string
  /** Local absolute paths of images attached to a user message. */
  readonly attachments?: string[]
}

/** One web chat session transcript (persisted locally). */
export interface WebChatTranscript {
  readonly id: string
  title: string
  readonly createdAt: number
  updatedAt: number
  /** Model the chat currently runs on the web (deepseek-chat / deepseek-reasoner). */
  model: string
  readonly messages: WebChatMessage[]
  /** True while an assistant reply is streaming. */
  streaming: boolean
}

/**
 * Structured engine error codes so callers (panel / agent tools) can act on a
 * failure instead of only printing it: NEED_LOGIN → prompt the login window;
 * PAGE_CHANGED → the DeepSeek page/stream protocol moved and the plugin likely
 * needs an upgrade; TIMEOUT → generation exceeded the reply window; NETWORK →
 * browser launch / HTTP / connectivity failure.
 */
export type WebChatErrorCode = 'NEED_LOGIN' | 'PAGE_CHANGED' | 'TIMEOUT' | 'NETWORK'

/** Coarse engine state for the panel. */
export type EngineState = 'stopped' | 'launching' | 'ready' | 'error'

/** Snapshot the panel polls. */
export interface WebChatState {
  readonly engine: EngineState
  readonly engineError?: string
  /** null = unknown yet; false = browser up but not logged in; true = chat page ready. */
  readonly loggedIn: boolean | null
  readonly pageUrl?: string
  /** Deep-think (R1) toggle state read from the page. */
  readonly deepThink: boolean
  /** Internet-search toggle state read from the page. */
  readonly search: boolean
  readonly activeChatId?: string
  readonly chats: WebChatTranscript[]
  /** True while a message is being sent / replied (serialized engine busy). */
  readonly busy: boolean
  /** Last send error, transient for the panel to display. */
  readonly lastError?: string
  /** Structured code for the last error (so the panel can show a targeted action). */
  readonly lastErrorCode?: WebChatErrorCode
}

/** Engine-level operation results surfaced to agent tools. */
export interface SendResult {
  readonly ok: boolean
  readonly chatId?: string
  readonly reply?: string
  readonly error?: string
  /** Structured error code (when ok is false) for actionable handling. */
  readonly code?: WebChatErrorCode
}

/** Result of transferring a transcript into harness mode. */
export interface TransferResult {
  readonly ok: boolean
  readonly sessionId?: string
  readonly filePath?: string
  /** True when the session was attached to a workspace (grouped); false = ungrouped. */
  readonly attached?: boolean
  /** Workspace id the session landed in, when attached. */
  readonly workspaceId?: string
  readonly error?: string
}

/**
 * How a transfer seeds the new harness session: 'distill' condenses the web
 * conversation into an executable task brief via the harness LLM; 'raw'
 * replays the full transcript verbatim. The web panel lets the user choose.
 */
export type TransferMode = 'distill' | 'raw'

/** API path constants shared by host routes and the browser panel. */
export const WEBChat_API = {
  state: '/api/dsh-webchat/state',
  openLogin: '/api/dsh-webchat/open-login',
  closeBrowser: '/api/dsh-webchat/close-browser',
  newChat: '/api/dsh-webchat/new-chat',
  send: '/api/dsh-webchat/send',
  stop: '/api/dsh-webchat/stop',
  deepThink: '/api/dsh-webchat/deep-think',
  search: '/api/dsh-webchat/search',
  transfer: '/api/dsh-webchat/transfer',
  exportFile: '/api/dsh-webchat/export',
  renameChat: '/api/dsh-webchat/rename',
  deleteChat: '/api/dsh-webchat/delete',
  clearChats: '/api/dsh-webchat/clear',
  webChats: '/api/dsh-webchat/web-chats',
  recover: '/api/dsh-webchat/recover',
} as const
