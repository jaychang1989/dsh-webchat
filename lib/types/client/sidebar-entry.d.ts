/**
 * Sidebar entry injection — package-specific wiring over the shared core
 * (sidebar-entry-core.ts). The row is plain DOM so it can never disturb the
 * shell's reconciliation; the panel view it toggles is a separate React root
 * mounted in the center column (see mount.tsx).
 */
import type { PanelController } from './controller.ts';
import type { WebChatKey } from './locales.ts';
/** Stable data attribute identifying the injected entry row. */
export declare const ENTRY_SELECTOR = "[data-dsh-webchat-entry]";
export interface SidebarEntryDeps {
    controller: PanelController;
    /** Locale accessor (spelled here to keep the core dependency-free). */
    tt: (key: WebChatKey) => string;
}
/**
 * Mount the sidebar entry, waiting for the shell to render and self-healing
 * on later React re-renders.
 * @param deps - controller and copy accessor.
 * @returns disposer removing the entry and its observers.
 */
export declare function mountSidebarEntry(deps: SidebarEntryDeps): () => void;
