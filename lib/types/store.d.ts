/**
 * Local transcript store. Chats are persisted as one JSON file under the
 * plugin data dir (~/.dsh/dsh-webchat/transcripts.json by default) so web
 * conversations survive restarts and can be transferred into harness mode
 * at any time. Atomic writes (tmp + rename) keep a crash from corrupting
 * history.
 */
import type { WebChatMessage, WebChatTranscript } from './protocol.ts';
/** Default plugin data directory (tests inject a sandbox root). */
export declare function defaultDataDir(): string;
export interface TranscriptStoreOptions {
    /** Root data dir; the transcripts file lives directly under it. */
    dataDir?: string;
}
/**
 * JSON-file transcript store. All mutations are synchronous and persisted
 * immediately (chats are small); the engine and routes use this single
 * instance so GUI and agent tools always see the same history.
 */
export declare class TranscriptStore {
    readonly dataDir: string;
    private readonly file;
    private chats;
    private activeChatId;
    constructor(options?: TranscriptStoreOptions);
    private read;
    private persist;
    /** Create a fresh chat and make it active. */
    createChat(model: string): WebChatTranscript;
    /** All chats, newest first. */
    list(): WebChatTranscript[];
    /** Local transcript titles (for matching against the web sidebar). */
    titles(): string[];
    /**
     * Import a recovered web conversation as a local transcript. Dedups by exact
     * title (web conversations with the same title map to the existing chat), so
     * re-syncing is idempotent. Returns the chat plus whether it was newly created.
     */
    importTranscript(input: {
        title: string;
        model: string;
        messages: WebChatMessage[];
    }): {
        chat: WebChatTranscript;
        created: boolean;
    };
    /** The active chat, or undefined when none exists yet. */
    activeChat(): WebChatTranscript | undefined;
    /** Read one chat by id. */
    getChat(id: string): WebChatTranscript | undefined;
    /** Pick the active chat, creating one if none exists. */
    ensureActiveChat(model: string): WebChatTranscript;
    /** Set which chat is active. */
    setActiveChat(id: string): boolean;
    /** Mutate the active (or named) chat and persist. */
    private update;
    /** Append a message to a chat. */
    appendMessage(id: string, message: WebChatMessage): WebChatTranscript | undefined;
    /** Replace (or insert) one message by id — used for streaming updates. */
    upsertMessage(id: string, message: WebChatMessage): WebChatTranscript | undefined;
    /** Mark the chat's streaming flag (assistant reply started/stopped). */
    setStreaming(id: string, streaming: boolean, model?: string): WebChatTranscript | undefined;
    /** Rename a chat (used to pin a meaningful title after the first exchange). */
    renameChat(id: string, title: string): WebChatTranscript | undefined;
    /** Delete one chat; a deleted active chat falls back to the newest remaining. */
    deleteChat(id: string): boolean;
    /** Delete every chat; returns the number removed. */
    clearAllChats(): number;
}
