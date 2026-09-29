/**
 * Minimal markdown renderer for the web-chat panel. Deliberately small and
 * dependency-free: headings, paragraphs, bold/italic, inline + fenced code,
 * links, DeepSeek `[citation:N]` markers (rendered as superscript badges),
 * unordered/ordered lists, blockquotes, GFM tables, horizontal rules, and
 * <details> passthrough (used for DeepSeek R1 thinking blocks). Anything
 * unrecognized renders as plain text — never raw HTML.
 */
import { type ReactNode } from 'react';
/** Render one block of markdown text into React nodes. */
export declare function renderMarkdown(source: string): ReactNode[];
/** The markdown renderer component. */
export declare function Markdown({ source }: {
    source: string;
}): ReactNode;
