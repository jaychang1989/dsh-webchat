import type { ISessions, IWorkspaces } from '@deepseek-ai/dsh-client-runtime/client';
import type { WebChatApi } from './api.ts';
import type { PanelController } from './controller.ts';
import type { WebChatKey } from './locales.ts';
/** The injected panel container (kept in the DOM, hidden when inactive). */
export declare const PANEL_VIEW_SELECTOR = "[data-dsh-webchat-view]";
export interface MountPanelDeps {
    sessions: ISessions;
    workspaces: IWorkspaces;
    api: WebChatApi;
    controller: PanelController;
    /** Locale accessor bound to the plugin's registered dictionaries. */
    tt: (key: WebChatKey) => string;
    /** Resolve the current session's cwd (for transfers / exports). */
    currentCwd: () => string | undefined;
}
/**
 * Mount the panel React tree into the center column and bind its visibility
 * to the controller's panelOpen state.
 * @param deps - sessions, api, controller, locale accessor.
 * @returns disposer unmounting the tree and restoring the column.
 */
export declare function mountPanel(deps: MountPanelDeps): () => void;
