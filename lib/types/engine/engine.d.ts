/**
 * DeepSeek web engine — the "Codex ChatGPT mode" analog for DeepSeek Harness.
 *
 * Drives a real browser (system Chrome/Edge via playwright-core) against
 * chat.deepseek.com with a dedicated persistent profile, so the user logs in
 * once with their own DeepSeek account (phone / password / Apple / WeChat QR)
 * and the session persists. Chatting happens THROUGH the real web page —
 * messages are typed into the real composer — so the plugin needs no API key,
 * no billing, and stays immune to DeepSeek's private-API PoW challenge.
 *
 * Replies are read by teeing the page's own SSE stream: an injected init
 * script wraps XMLHttpRequest and captures the `/api/v0/chat/completion`
 * response as it streams (the page has already solved PoW + auth, so we get
 * the model's raw markdown for free). DOM scraping of `.ds-markdown` is kept
 * only as a fallback for when the capture cannot install. The web chat runs
 * the `deepseek-chat` model by default (switchable to deepseek-reasoner).
 *
 * All page interactions are best-effort and selector-defensive: failures
 * produce readable errors (never crashes) and the caller decides how to
 * degrade.
 */
import { type Page } from 'playwright-core';
import type { TranscriptStore } from '../store.ts';
import type { EngineState, SendResult, WebChatErrorCode } from '../protocol.ts';
/** Engine configuration (resolved from the plugin settings surface). */
export interface WebChatEngineConfig {
    /** Data dir root (browser profile lives under it). */
    dataDir: string;
    /** Browser channel hint: 'chrome' | 'msedge' | 'chromium' | undefined (auto-detect). */
    channel?: string;
    /** Explicit browser executable path (overrides channel detection). */
    executablePath?: string;
    /** Proxy mode: 'direct' (--no-proxy-server), 'system' (browser default), or a proxy URL. */
    proxy?: string;
    /** Visible browser window (required for the one-time login; defaults true). */
    headless?: boolean;
    /** Max seconds to wait for a reply before returning the partial. */
    replyTimeoutMs?: number;
    /** DeepSeek web origin. */
    baseUrl?: string;
}
/** Parsed reply from the accumulated SSE text. */
export interface ParsedStreamReply {
    /** Markdown body (thinking wrapped in a <details> block). */
    markdown: string;
    /** Raw thinking text (empty when the model has none). */
    thinking: string;
    /** True once the stream reported FINISHED. */
    finished: boolean;
}
/**
 * Parse the accumulated `/api/v0/chat/completion` SSE body into reply text.
 * The stream is `event:` / `data:` lines; each `data:` payload is JSON. The
 * protocol distinguishes the R1 reasoning fragment (type `THINK`) from the
 * answer fragment (type `RESPONSE`), and carries search steps as `TOOL_SEARCH`
 * / `TOOL_OPEN` fragments:
 *   - {"v":{"response":{"fragments":[{"type":"THINK","content":"…"}]}}}
 *     a snapshot carrying the fragment list and their types.
 *   - {"p":"response/fragments","o":"APPEND","v":[{"type":"RESPONSE",…}]}
 *     appends a NEW fragment (reasoning / search / answer); `-1/content`
 *     deltas after this belong to that new fragment.
 *   - {"p":"response/fragments/-1/content","o":"APPEND","v":"是一座"} — appends
 *     a text delta to the CURRENT fragment's content.
 *   - {"p":"response/fragments/-1/results","o":"SET","v":[…]} — search results
 *     for a TOOL_SEARCH step (rendered as "搜索到 N 个网页").
 *   - {"v":"将"} — a bare delta continuing the current fragment; a bare
 *     `{"v":[{p:"content",o:"APPEND",v:"[reference:N]"},…]}` carries citation
 *     markers.
 *   - {"p":"response/status","o":"SET","v":"FINISHED"} — generation complete.
 */
export declare function parseStreamReply(raw: string): ParsedStreamReply;
export declare class DeepSeekWebEngine {
    private readonly store;
    private readonly config;
    private readonly profileDir;
    private context;
    private page;
    private readonly queue;
    private state;
    private engineError;
    private busy;
    private lastError;
    private lastErrorCode;
    private launchedOnce;
    /** True while a headed one-time login window is open (auto-closes on login). */
    private loginMode;
    /** Remembered login state — survives the auto-close so the panel stays "已登录". */
    private loggedInOnce;
    /** Commanded toggle state (best-effort read-back overrides on status). */
    private deepThink;
    private search;
    constructor(store: TranscriptStore, config: WebChatEngineConfig);
    /** Coarse state for status snapshots. */
    getState(): EngineState;
    getEngineError(): string | undefined;
    getBusy(): boolean;
    getLastError(): string | undefined;
    getLastErrorCode(): WebChatErrorCode | undefined;
    /** Set the last error + its structured code together (keeps them in sync). */
    private setLastError;
    private setState;
    /** Resolve a browser launch descriptor (executable + args). */
    private launchOptions;
    /**
     * Ensure the browser + chat.deepseek.com page exist. Launches the persistent
     * context on first call; subsequent calls reuse the page.
     */
    /** True when the cached page/context are still connected (not closed by the user). */
    private isPageAlive;
    ensureBrowser(): Promise<Page>;
    /** The candidate list used during auto-detection. */
    private launchOptionsCandidates;
    /** Navigate to the DeepSeek chat root. */
    private openDeepSeekPage;
    /** True when the page shows the chat UI (not the login page). */
    isLoggedIn(): Promise<boolean | null>;
    /**
     * Open a visible browser window for the one-time login. The window is forced
     * headed (login needs a user) and auto-closes as soon as the page reaches the
     * chat UI; normal chatting then runs headless on the persisted profile.
     */
    openLoginWindow(): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** Poll the login window and close it once the user has logged in. */
    private watchLoginAndClose;
    /** Current page URL (for status/debug). */
    pageUrl(): string | undefined;
    /**
     * Best-effort read of the deep-think (R1) and search toggle state from the
     * page. The toggles are `div.ds-toggle-button` elements (NOT `<button>`)
     * carrying `aria-pressed` plus a `ds-toggle-button--selected` class when on;
     * the search toggle is labeled 智能搜索. Falls back to the last commanded
     * state when the page gives no clear signal.
     */
    private readToggles;
    /** Serialized page evaluation guarded against a dead page. */
    private evalPage;
    /**
     * In-page scraper: returns the ordered rendered messages currently in the
     * DOM. Uses the virtual-list item keys as message boundaries and the
     * assistant-main-content class to split roles. Fallback only — the primary
     * reply source is the teed SSE stream.
     */
    private scrapeConversation;
    /** Convert scraped DOM messages into transcript messages (markdown content). */
    private scrapedToMessages;
    /**
     * Scrape the DeepSeek sidebar conversation titles (best effort). The web
     * conversation list has no stable contract, so several candidate selectors
     * are probed and short non-menu texts are returned.
     */
    listWebConversations(): Promise<Array<{
        title: string;
    }>>;
    /** Click a sidebar conversation whose text contains the given title. */
    private clickConversationByTitle;
    /**
     * Recover a web conversation into the local transcript store: open it in the
     * sidebar, scrape its history, and import it (idempotent by title).
     */
    recoverWebConversation(title: string): Promise<{
        ok: boolean;
        chatId?: string;
        title?: string;
        created?: boolean;
        error?: string;
    }>;
    /** Detect whether the page is currently generating (stop affordance visible). */
    private isGenerating;
    /** Click the stop-generation affordance, best effort. */
    stop(): Promise<void>;
    /** Find the composer textarea (defensive selector list). */
    private composerLocator;
    /**
     * Upload local image files into the composer through the page's (usually
     * hidden) file input. `setInputFiles` fires the input's change event, which
     * is how DeepSeek picks up attachments without clicking its native dialog.
     */
    private attachImages;
    /**
     * Send a message through the real web page.
     * @param text - message text.
     * @param wait - when true (agent tools), resolve with the final reply after
     *   streaming completes; when false (GUI), resolve right after the message
     *   is submitted — the reply streams in the background into the transcript
     *   and the panel polls it live.
     */
    send(text: string, wait?: boolean, images?: string[]): Promise<SendResult>;
    private sendImpl;
    /**
     * Background reply loop. Primary source is the teed SSE stream (raw model
     * markdown, no selectors); if the capture never installs, falls back to
     * scraping the rendered DOM. Writes the growing reply into the transcript
     * until the stream reports done/FINISHED or the timeout hits.
     */
    private streamReply;
    /** Start a new chat on the web page (best effort) + a fresh local transcript. */
    newChat(): Promise<{
        ok: boolean;
        chatId?: string;
        error?: string;
    }>;
    /**
     * Click a toggle on the page by label candidates (best effort — the DeepSeek
     * web UI has no stable contract, so a miss is not an error). The toggles are
     * `div.ds-toggle-button` elements (not `<button>`), so those selectors come
     * first; `<button>` variants remain as fallbacks for older page versions.
     * @returns true when a candidate was clicked.
     */
    private clickToggle;
    /** Toggle deep-think (R1) mode on the web page. */
    setDeepThink(enabled: boolean): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** Toggle internet search on the web page (web label: 智能搜索). */
    setSearch(enabled: boolean): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** Close the browser (releases the profile lock). */
    disposeBrowser(): Promise<void>;
    /** Engine snapshot for status routes and agent tools. */
    status(): Promise<{
        engine: EngineState;
        engineError?: string;
        loggedIn: boolean | null;
        pageUrl?: string;
        deepThink: boolean;
        search: boolean;
        busy: boolean;
        lastError?: string;
        lastErrorCode?: WebChatErrorCode;
    }>;
}
export interface MarkupNode {
    readonly tagName?: string;
    readonly nodeType: number;
    readonly textContent?: string;
    readonly children: MarkupNode[];
    readonly attributes: Record<string, string | undefined>;
    readonly parent?: MarkupNode;
}
/** Convert a scraped markdown-HTML string to markdown (used by send). */
export declare function scrapedHtmlToMarkdown(html: string): string;
