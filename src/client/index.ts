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
import type { ClientContext, ISessions, IWorkspaces } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the LocaleNamespaceMap merge table.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { WebChatApi } from './api.ts'
import { PanelController } from './controller.ts'
import { en, zh, type WebChatKey } from './locales.ts'
import { mountPanel } from './mount.tsx'
import { mountSidebarEntry } from './sidebar-entry.ts'

/** Locale namespace this plugin owns. */
const NS = 'dsh-webchat'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-webchat surface copy. */
    'dsh-webchat': WebChatKey
  }
}

/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots', 'locale', 'sessions', 'workspaces']

/** Type-only surface (export discipline: no value exports beyond the plugin contract). */
export type { WebChatPanelProps } from './panel/WebChatPanel.tsx'
export type { WebChatKey } from './locales.ts'

/**
 * Mount the web-chat panel.
 * @param ctx - client root context (locale + sessions services).
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-webchat: dictionaries')

  const controller = new PanelController()
  const api = new WebChatApi()
  // The host-side dsh-session package also merges `Context.sessions` into
  // cordis types; the client runtime's ISessions is the authoritative shape
  // here, so read it through a narrow cast rather than trusting the merged
  // type (which the host package wins during a shared typecheck).
  const sessions = (ctx as unknown as { sessions: ISessions }).sessions
  const workspaces = (ctx as unknown as { workspaces: IWorkspaces }).workspaces
  const tt = ctx.locale.bind(NS)
  const currentCwd = (): string | undefined => {
    const snapshot = sessions.list.getSnapshot()
    const current = snapshot.current
    if (current === undefined) return undefined
    return snapshot.byId[current]?.cwd
  }

  const disposers: Array<() => void> = []
  try {
    disposers.push(mountSidebarEntry({ controller, tt }))
    disposers.push(mountPanel({ sessions, workspaces, api, controller, tt, currentCwd }))
  } catch (error) {
    // DOM failures degrade the panel, never the GUI.
    console.warn('[dsh-webchat] mount failed:', error)
  }
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
  }, 'dsh-webchat: ui mounts')
}
