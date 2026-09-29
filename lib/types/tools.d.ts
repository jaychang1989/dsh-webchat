/**
 * Agent tools: the DSH-native counterpart of the web-chat panel. The harness
 * agent can chat through the DeepSeek web session (webchat_send), inspect
 * stored transcripts (webchat_status / webchat_import), and hand a web
 * conversation into a new harness session (webchat_transfer) — mirroring how
 * Codex's chatgpt mode lets the agent itself use the web subscription.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { DeepSeekWebEngine } from './engine/engine.ts';
import type { TranscriptStore } from './store.ts';
import type { DistillConfig } from './transfer.ts';
/** Minimal workspace projection surfaced to the agent (id/path/title only). */
export interface WorkspaceRef {
    id: string;
    path: string;
    title: string;
}
/** The engine-status tool. */
export declare function webChatStatusTool(engine: DeepSeekWebEngine, store: TranscriptStore, listWorkspaces?: () => WorkspaceRef[] | undefined): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** The send-via-web tool. */
export declare function webChatSendTool(engine: DeepSeekWebEngine): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** The web-conversation recover tool (sync web sidebar → local store). */
export declare function webChatRecoverTool(engine: DeepSeekWebEngine): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** The transcript import tool. */
export declare function webChatImportTool(store: TranscriptStore): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** The transfer tool (closes over the host context so it can create sessions). */
export declare function webChatTransferTool(hostCtx: Context, store: TranscriptStore, distill: DistillConfig): import("@deepseek-ai/dsh-tools").ToolDefinition;
