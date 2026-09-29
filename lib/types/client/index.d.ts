/**
 * Browser-half entry for the dsh-webchat plugin — runs inside the dsh web GUI.
 *
 * Registers the locale dictionaries and mounts the two DOM surfaces: the
 * sidebar entry row (toggles the panel) and the web-chat panel in the center
 * column. Failure policy: DOM mounting problems are logged, never thrown —
 * the web shell fails the whole boot when a plugin apply throws, and an
 * external plugin must not take the GUI down.
 *
 * Export discipline (packages/client rule): the /client surface carries what
 * cordis loading needs plus types only — all value exports stay internal.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type WebChatKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** dsh-webchat surface copy. */
        'dsh-webchat': WebChatKey;
    }
}
/** Required services (fiber inject waiting — the runtime must be up first). */
export declare const inject: string[];
/** Type-only surface (export discipline: no value exports beyond the plugin contract). */
export type { WebChatPanelProps } from './panel/WebChatPanel.tsx';
export type { WebChatKey } from './locales.ts';
/**
 * Mount the web-chat panel.
 * @param ctx - client root context (locale + sessions services).
 */
export declare function apply(ctx: ClientContext): void;
