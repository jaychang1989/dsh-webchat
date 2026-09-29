/**
 * Panel controller: minimal external state the sidebar entry and the panel
 * share (open/closed), plus a tiny pub/sub. The chat data itself lives in the
 * panel component's polling loop.
 */

export interface PanelSnapshot {
  readonly panelOpen: boolean
}

const INITIAL: PanelSnapshot = { panelOpen: false }

/** Plain pub/sub store (no React dependency — used by the DOM sidebar entry). */
export class PanelController {
  private snapshot: PanelSnapshot = INITIAL
  private readonly listeners = new Set<() => void>()

  getSnapshot(): PanelSnapshot {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private set(patch: Partial<PanelSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of [...this.listeners]) listener()
  }

  open(): void {
    if (!this.snapshot.panelOpen) this.set({ panelOpen: true })
  }

  close(): void {
    if (this.snapshot.panelOpen) this.set({ panelOpen: false })
  }

  toggle(): void {
    this.set({ panelOpen: !this.snapshot.panelOpen })
  }
}
