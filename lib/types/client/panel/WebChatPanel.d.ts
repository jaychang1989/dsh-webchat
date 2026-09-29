/**
 * The web-chat panel: engine/login status, a conversation sidebar (the local
 * transcript list + management), the chat transcript with markdown rendering,
 * streaming updates (polled), the composer with deep-think / internet-search
 * toggles, and the transfer-to-Harness handoff. All data flows through the
 * /api/dsh-webchat routes; the panel is a plain React root in the center column.
 *
 * Layout mirrors chat.deepseek.com: a left conversation sidebar (new chat +
 * history + per-item rename/delete + clear-all) beside the main chat column
 * (messages → composer with 深度思考 / 智能搜索 toggles → handoff dock). The
 * mono register stays reserved for machine things — timestamps, counts,
 * status, and the handoff eyebrow.
 */
import type { ISessions, IWorkspaces } from '@deepseek-ai/dsh-client-runtime/client';
import type { WebChatApi } from '../api.ts';
import type { WebChatKey } from '../locales.ts';
export interface WebChatPanelProps {
    api: WebChatApi;
    /** Locale accessor (the plugin registers its dictionaries on ctx.locale). */
    tt: (key: WebChatKey) => string;
    /** Client sessions service (ctx.sessions) for opening transferred sessions. */
    sessions: ISessions;
    /** Client workspaces service (ctx.workspaces) for the transfer target picker. */
    workspaces: IWorkspaces;
    /** Resolve the current workspace directory (cwd for new sessions / exports). */
    currentCwd: () => string | undefined;
}
export declare function WebChatPanel({ api, tt, sessions, workspaces, currentCwd }: WebChatPanelProps): import("react").JSX.Element;
