/**
 * Local transcript store. Chats are persisted as one JSON file under the
 * plugin data dir (~/.dsh/dsh-webchat/transcripts.json by default) so web
 * conversations survive restarts and can be transferred into harness mode
 * at any time. Atomic writes (tmp + rename) keep a crash from corrupting
 * history.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { WebChatMessage, WebChatTranscript } from './protocol.ts'

/** Default plugin data directory (tests inject a sandbox root). */
export function defaultDataDir(): string {
  const home = process.env.DSH_HOME ?? process.env.HOME ?? '.'
  return join(home, '.dsh', 'dsh-webchat')
}

export interface TranscriptStoreOptions {
  /** Root data dir; the transcripts file lives directly under it. */
  dataDir?: string
}

interface StoreFile {
  version: 1
  activeChatId?: string
  chats: WebChatTranscript[]
}

/**
 * JSON-file transcript store. All mutations are synchronous and persisted
 * immediately (chats are small); the engine and routes use this single
 * instance so GUI and agent tools always see the same history.
 */
export class TranscriptStore {
  readonly dataDir: string
  private readonly file: string
  private chats: WebChatTranscript[]
  private activeChatId: string | undefined

  constructor(options: TranscriptStoreOptions = {}) {
    this.dataDir = options.dataDir ?? defaultDataDir()
    this.file = join(this.dataDir, 'transcripts.json')
    const loaded = this.read()
    this.chats = loaded.chats
    this.activeChatId = loaded.activeChatId
    if (this.activeChatId !== undefined && !this.chats.some(chat => chat.id === this.activeChatId)) {
      this.activeChatId = this.chats.at(-1)?.id
    }
  }

  private read(): StoreFile {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<StoreFile>
      const chats = Array.isArray(parsed.chats) ? parsed.chats : []
      return {
        version: 1,
        activeChatId: typeof parsed.activeChatId === 'string' ? parsed.activeChatId : undefined,
        chats: chats.filter(chat => typeof chat?.id === 'string' && Array.isArray(chat.messages)),
      }
    } catch {
      return { version: 1, chats: [] }
    }
  }

  private persist(): void {
    mkdirSync(this.dataDir, { recursive: true, mode: 0o700 })
    const payload: StoreFile = { version: 1, activeChatId: this.activeChatId, chats: this.chats }
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file)
  }

  /** Create a fresh chat and make it active. */
  createChat(model: string): WebChatTranscript {
    const now = Date.now()
    const chat: WebChatTranscript = {
      id: `chat-${now.toString(36)}-${randomUUID().slice(0, 6)}`,
      title: '新的对话',
      createdAt: now,
      updatedAt: now,
      model,
      messages: [],
      streaming: false,
    }
    this.chats.unshift(chat)
    this.activeChatId = chat.id
    this.persist()
    return chat
  }

  /** All chats, newest first. */
  list(): WebChatTranscript[] {
    return [...this.chats]
  }

  /** Local transcript titles (for matching against the web sidebar). */
  titles(): string[] {
    return this.chats.map(chat => chat.title)
  }

  /**
   * Import a recovered web conversation as a local transcript. Dedups by exact
   * title (web conversations with the same title map to the existing chat), so
   * re-syncing is idempotent. Returns the chat plus whether it was newly created.
   */
  importTranscript(input: { title: string; model: string; messages: WebChatMessage[] }): { chat: WebChatTranscript; created: boolean } {
    const cleanTitle = input.title.trim().replace(/\s+/g, ' ').slice(0, 80) || '新的对话'
    const existing = this.chats.find(chat => chat.title === cleanTitle)
    if (existing !== undefined) {
      this.activeChatId = existing.id
      return { chat: existing, created: false }
    }
    const now = Date.now()
    const chat: WebChatTranscript = {
      id: `chat-${now.toString(36)}-${randomUUID().slice(0, 6)}`,
      title: cleanTitle,
      createdAt: now,
      updatedAt: now,
      model: input.model,
      messages: input.messages,
      streaming: false,
    }
    this.chats.unshift(chat)
    this.activeChatId = chat.id
    this.persist()
    return { chat, created: true }
  }

  /** The active chat, or undefined when none exists yet. */
  activeChat(): WebChatTranscript | undefined {
    if (this.activeChatId === undefined) return undefined
    return this.chats.find(chat => chat.id === this.activeChatId)
  }

  /** Read one chat by id. */
  getChat(id: string): WebChatTranscript | undefined {
    return this.chats.find(chat => chat.id === id)
  }

  /** Pick the active chat, creating one if none exists. */
  ensureActiveChat(model: string): WebChatTranscript {
    return this.activeChat() ?? this.createChat(model)
  }

  /** Set which chat is active. */
  setActiveChat(id: string): boolean {
    if (!this.chats.some(chat => chat.id === id)) return false
    this.activeChatId = id
    this.persist()
    return true
  }

  /** Mutate the active (or named) chat and persist. */
  private update(id: string, mutate: (chat: WebChatTranscript) => void): WebChatTranscript | undefined {
    const chat = this.chats.find(candidate => candidate.id === id)
    if (chat === undefined) return undefined
    mutate(chat)
    chat.updatedAt = Date.now()
    this.persist()
    return chat
  }

  /** Append a message to a chat. */
  appendMessage(id: string, message: WebChatMessage): WebChatTranscript | undefined {
    return this.update(id, chat => {
      chat.messages.push(message)
      if (message.role === 'assistant') chat.streaming = message.streaming ?? false
    })
  }

  /** Replace (or insert) one message by id — used for streaming updates. */
  upsertMessage(id: string, message: WebChatMessage): WebChatTranscript | undefined {
    return this.update(id, chat => {
      const index = chat.messages.findIndex(candidate => candidate.id === message.id)
      if (index >= 0) chat.messages[index] = message
      else chat.messages.push(message)
      if (message.role === 'assistant') chat.streaming = message.streaming ?? false
    })
  }

  /** Mark the chat's streaming flag (assistant reply started/stopped). */
  setStreaming(id: string, streaming: boolean, model?: string): WebChatTranscript | undefined {
    return this.update(id, chat => {
      chat.streaming = streaming
      if (model !== undefined) chat.model = model
    })
  }

  /** Rename a chat (used to pin a meaningful title after the first exchange). */
  renameChat(id: string, title: string): WebChatTranscript | undefined {
    const clean = title.trim().replace(/\s+/g, ' ').slice(0, 80)
    if (clean === '') return undefined
    return this.update(id, chat => { chat.title = clean })
  }

  /** Delete one chat; a deleted active chat falls back to the newest remaining. */
  deleteChat(id: string): boolean {
    const before = this.chats.length
    this.chats = this.chats.filter(chat => chat.id !== id)
    if (this.chats.length === before) return false
    if (this.activeChatId === id) this.activeChatId = this.chats.at(0)?.id
    this.persist()
    return true
  }

  /** Delete every chat; returns the number removed. */
  clearAllChats(): number {
    const count = this.chats.length
    if (count === 0) return 0
    this.chats = []
    this.activeChatId = undefined
    this.persist()
    return count
  }
}
