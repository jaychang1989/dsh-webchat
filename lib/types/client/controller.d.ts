/**
 * Panel controller: minimal external state the sidebar entry and the panel
 * share (open/closed), plus a tiny pub/sub. The chat data itself lives in the
 * panel component's polling loop.
 */
export interface PanelSnapshot {
    readonly panelOpen: boolean;
}
/** Plain pub/sub store (no React dependency — used by the DOM sidebar entry). */
export declare class PanelController {
    private snapshot;
    private readonly listeners;
    getSnapshot(): PanelSnapshot;
    subscribe(listener: () => void): () => void;
    private set;
    open(): void;
    close(): void;
    toggle(): void;
}
