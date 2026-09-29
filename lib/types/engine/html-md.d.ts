/**
 * Minimal HTML → Markdown converter used to scrape DeepSeek's rendered
 * `.ds-markdown` replies. Covers the shapes DeepSeek renders (headings,
 * paragraphs, code blocks with syntax classes, inline code, bold/italic,
 * links, images, lists, tables, blockquotes, math placeholders). Anything
 * unrecognized falls back to its text content — fidelity loss degrades
 * gracefully instead of dropping text.
 */
interface NodeLike {
    readonly tagName?: string;
    readonly nodeType?: number;
    readonly textContent?: string | null;
    readonly children?: readonly NodeLike[];
    readonly attributes?: Record<string, string | undefined>;
    readonly innerHTML?: string;
    readonly className?: string;
    readonly parent?: NodeLike;
}
/** Convert one DOM subtree (element or text) to markdown. */
export declare function htmlToMarkdown(root: NodeLike): string;
/** Convert serialized DOM (from the in-page scraper) to markdown. */
export declare function serializeToMarkdown(root: NodeLike): string;
export {};
