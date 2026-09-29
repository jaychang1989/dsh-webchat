/**
 * Minimal markdown renderer for the web-chat panel. Deliberately small and
 * dependency-free: headings, paragraphs, bold/italic, inline + fenced code,
 * links, DeepSeek `[citation:N]` markers (rendered as superscript badges),
 * unordered/ordered lists, blockquotes, GFM tables, horizontal rules, and
 * <details> passthrough (used for DeepSeek R1 thinking blocks). Anything
 * unrecognized renders as plain text — never raw HTML.
 */

import { createElement, type ReactNode } from 'react'
import css from './panel.module.css'

/** Escape text for safe rendering (no dangerouslySetInnerHTML anywhere). */
function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Inline markdown → React nodes. Single tokenizer pass over the string:
 * code spans win, then links, then `[citation:…]` markers, then bold, then
 * italic — each non-token run is escaped text. Bold/italic recurse so a
 * strong span can contain a citation or link.
 */
function inline(text: string, keyBase = 'i'): ReactNode[] {
  const nodes: ReactNode[] = []
  // eslint-disable-next-line no-useless-escape
  const re = /(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))|(\[citation:[^\]]+\])|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\n]+\*|_[^_\n]+_)/g
  let last = 0
  let index = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(esc(text.slice(last, match.index)))
    const key = `${keyBase}-${index}`
    if (match[1] !== undefined) {
      // `code`
      nodes.push(createElement('code', { key: `${key}-code` }, match[1].slice(1, -1)))
    } else if (match[2] !== undefined) {
      // [label](url)
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(match[2])
      nodes.push(createElement('a', { key: `${key}-a`, href: link![2], target: '_blank', rel: 'noreferrer' }, link![1]))
    } else if (match[3] !== undefined) {
      // [citation:N] / [citation:N1,N2] — DeepSeek web search markers.
      const nums = match[3].slice('[citation:'.length, -1).trim()
      nodes.push(createElement('sup', { key: `${key}-cite`, className: css.citation }, nums))
    } else if (match[4] !== undefined) {
      // **bold** / __bold__
      const inner = match[4].slice(2, -2)
      nodes.push(createElement('strong', { key: `${key}-b` }, ...inline(inner, `${key}-b`)))
    } else if (match[5] !== undefined) {
      // *italic* / _italic_
      const inner = match[5].slice(1, -1)
      nodes.push(createElement('em', { key: `${key}-i` }, ...inline(inner, `${key}-i`)))
    }
    last = re.lastIndex
    index++
  }
  if (last < text.length) nodes.push(esc(text.slice(last)))
  return nodes
}

/** One fenced code block → <pre><code>. */
function codeBlock(language: string, body: string, key: string): ReactNode {
  return createElement(
    'pre',
    { key },
    createElement('code', { className: language === '' ? undefined : `language-${language}` }, body),
  )
}

/** Split a table row into cells, honoring escaped pipes (\|). */
function splitCells(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let escaped = false
  for (const ch of line) {
    if (escaped) { current += ch; escaped = false }
    else if (ch === '\\') { escaped = true }
    else if (ch === '|') { cells.push(current); current = '' }
    else { current += ch }
  }
  cells.push(current)
  // Drop the leading/trailing empty artifacts produced by a leading/trailing
  // pipe, so `| a | b |` and `a | b` both yield ['a','b'].
  let start = 0
  let end = cells.length
  while (start < end && cells[start].trim() === '') start++
  while (end > start && cells[end - 1].trim() === '') end--
  return cells.slice(start, end).map(cell => cell.trim())
}

/** True when a line is a GFM table delimiter row (`:---`, `---:`, `:---:`, …). */
function isDelimiterRow(line: string): boolean {
  const cells = splitCells(line)
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell))
}

/** Render one block of markdown text into React nodes. */
export function renderMarkdown(source: string): ReactNode[] {
  const raw = source.replace(/\r\n/g, '\n').trim()
  if (raw === '') return []
  const blocks: ReactNode[] = []
  const lines = raw.split('\n')
  let index = 0
  let blockIndex = 0

  const push = (node: ReactNode): void => {
    blocks.push(createElement('div', { key: `b${blockIndex++}` }, node))
  }

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    // fenced code
    const fence = /^```([\w+-]*)\s*$/.exec(trimmed)
    if (fence !== null) {
      const language = fence[1] ?? ''
      const body: string[] = []
      index++
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        body.push(lines[index])
        index++
      }
      index++ // closing fence
      push(codeBlock(language, body.join('\n'), `code${blockIndex}`))
      continue
    }

    // headings
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading !== null) {
      const level = heading[1].length
      push(createElement(`h${level}` as 'h1', null, ...inline(heading[2], `h${blockIndex}`)))
      index++
      continue
    }

    // GFM table (header row containing '|' immediately followed by a delimiter
    // row). Checked before the horizontal-rule branch so a delimiter like
    // `--- | ---` is never mistaken for an hr.
    if (line.includes('|') && lines[index + 1] !== undefined && isDelimiterRow(lines[index + 1])) {
      const header = splitCells(line)
      index += 2
      const rows: string[][] = []
      while (index < lines.length) {
        const row = lines[index]
        if (row.trim() === '' || !row.includes('|')) break
        rows.push(splitCells(row))
        index++
      }
      const width = Math.max(header.length, ...rows.map(row => row.length))
      const rowNode = (cells: string[], rowIndex: number): ReactNode =>
        createElement('tr', { key: rowIndex }, Array.from({ length: width }, (_, col) =>
          createElement('td', { key: col }, ...inline(cells[col] ?? '', `t${blockIndex}-${rowIndex}-${col}`))))
      blocks.push(createElement(
        'div',
        { key: `tw${blockIndex}`, className: css.tableWrap },
        createElement('table', { key: `t${blockIndex}` },
          createElement('thead', null, createElement('tr', null, header.map((cell, col) =>
            createElement('th', { key: col }, ...inline(cell, `th${blockIndex}-${col}`))))),
          createElement('tbody', null, rows.map(rowNode))),
      ))
      blockIndex++
      continue
    }

    // horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      push(createElement('hr', { key: `hr${blockIndex}` }))
      index++
      continue
    }

    // blockquote (collect consecutive quote lines)
    if (trimmed.startsWith('>')) {
      const quote: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quote.push(lines[index].trim().replace(/^>\s?/, ''))
        index++
      }
      push(createElement('blockquote', { key: `q${blockIndex}` }, ...renderMarkdown(quote.join('\n'))))
      continue
    }

    // details (DeepSeek R1 thinking)
    if (/^<details>/.test(trimmed)) {
      const body: string[] = []
      const summaryMatch = /^<summary>\s*(.*?)\s*<\/summary>/.exec(trimmed)
      index++
      while (index < lines.length && !/^<\/details>/.test(lines[index].trim())) {
        body.push(lines[index])
        index++
      }
      index++ // </details>
      push(createElement(
        'details',
        { key: `d${blockIndex}` },
        createElement('summary', null, summaryMatch?.[1] ?? '详情'),
        ...renderMarkdown(body.join('\n')),
      ))
      continue
    }

    // unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, ''))
        index++
      }
      push(createElement('ul', { key: `ul${blockIndex}` }, items.map((item, itemIndex) =>
        createElement('li', { key: itemIndex }, ...inline(item, `uli${blockIndex}-${itemIndex}`)))))
      continue
    }

    // ordered list
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ''))
        index++
      }
      push(createElement('ol', { key: `ol${blockIndex}` }, items.map((item, itemIndex) =>
        createElement('li', { key: itemIndex }, ...inline(item, `oli${blockIndex}-${itemIndex}`)))))
      continue
    }

    // plain paragraph: collect consecutive non-empty, non-special lines
    const paragraph: string[] = []
    while (index < lines.length) {
      const current = lines[index].trim()
      if (current === '') break
      if (/^(```|#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|<\/(details|table)>)/.test(current)) break
      if (current.includes('|') && lines[index + 1] !== undefined && isDelimiterRow(lines[index + 1])) break
      paragraph.push(current)
      index++
    }
    if (paragraph.length === 0) {
      index++
      continue
    }
    push(createElement('p', { key: `p${blockIndex}` }, ...inline(paragraph.join(' '), `p${blockIndex}`)))
  }

  return blocks
}

/** The markdown renderer component. */
export function Markdown({ source }: { source: string }): ReactNode {
  return createElement('div', { className: css.markdown }, ...renderMarkdown(source))
}
