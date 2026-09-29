/**
 * Sidebar entry injection — package-specific wiring over the shared core
 * (sidebar-entry-core.ts). The row is plain DOM so it can never disturb the
 * shell's reconciliation; the panel view it toggles is a separate React root
 * mounted in the center column (see mount.tsx).
 */
import type { PanelController } from './controller.ts'
import { mountSidebarEntry as mountSharedSidebarEntry } from './sidebar-entry-core.ts'
import type { WebChatKey } from './locales.ts'
// The hashed CSS module map (entry / entryIcon / entryLabel keys) — the same
// pattern dsh-ssh uses, so the row matches the shell's nav-item look.
import css from './panel/panel.module.css'

/** Stable data attribute identifying the injected entry row. */
export const ENTRY_SELECTOR = '[data-dsh-webchat-entry]'

/** Inline icon (matches the shell's 16px nav-icon look): a chat bubble with a globe dot. */
const ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5a5.5 5.5 0 0 0-4.7 8.3L2.5 13.5l2.8-.8A5.5 5.5 0 1 0 8 2.5z"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/></svg>'

export interface SidebarEntryDeps {
  controller: PanelController
  /** Locale accessor (spelled here to keep the core dependency-free). */
  tt: (key: WebChatKey) => string
}

/**
 * Mount the sidebar entry, waiting for the shell to render and self-healing
 * on later React re-renders.
 * @param deps - controller and copy accessor.
 * @returns disposer removing the entry and its observers.
 */
export function mountSidebarEntry(deps: SidebarEntryDeps): () => void {
  return mountSharedSidebarEntry({
    rowAttribute: 'data-dsh-webchat-entry',
    rowSelector: ENTRY_SELECTOR,
    plugin: 'webchat',
    icon: ICON,
    css,
    label: () => deps.tt('entry.label'),
    tooltip: () => deps.tt('entry.tooltip'),
    onToggle: () => { deps.controller.toggle() },
    position: 'after',
    familySelectors: ['[data-dsh-taskboard-entry]', '[data-dsh-ssh-entry]', '[data-dsh-webchat-entry]'],
    active: {
      subscribe: (listener) => deps.controller.subscribe(listener),
      isOpen: () => deps.controller.getSnapshot().panelOpen,
    },
  })
}
