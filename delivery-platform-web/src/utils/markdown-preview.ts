export interface MarkdownTocItem {
  id: string
  level: number
  text: string
}

export interface MarkdownRenderResult {
  html: string
  toc: MarkdownTocItem[]
}

export function renderSafeMarkdown(source: string): MarkdownRenderResult {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const toc: MarkdownTocItem[] = []
  const html: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (!line.trim()) {
      index += 1
      continue
    }

    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim()
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      index += index < lines.length ? 1 : 0
      html.push(
        `<pre class="md-code"><code data-language="${escapeAttribute(language)}">${escapeHtml(code.join('\n'))}</code></pre>`,
      )
      continue
    }

    const heading = /^(#{1,6})\s+(.+)$/u.exec(line)
    if (heading) {
      const level = heading[1].length
      const text = stripInlineMarkdown(heading[2].trim())
      const id = makeHeadingId(text, toc.length)
      toc.push({ id, level, text })
      html.push(
        `<h${level} id="${id}">${renderInlineMarkdown(heading[2].trim())}</h${level}>`,
      )
      index += 1
      continue
    }

    if (isTableStart(lines, index)) {
      const tableLines: string[] = [lines[index]]
      index += 2
      while (index < lines.length && isTableRow(lines[index])) {
        tableLines.push(lines[index])
        index += 1
      }
      html.push(renderTable(tableLines))
      continue
    }

    if (/^\s*[-*+]\s+/u.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*+]\s+/u.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/u, '').trim())
        index += 1
      }
      html.push(
        `<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`,
      )
      continue
    }

    if (/^\s*\d+\.\s+/u.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*\d+\.\s+/u.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/u, '').trim())
        index += 1
      }
      html.push(
        `<ol>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ol>`,
      )
      continue
    }

    if (/^>\s?/u.test(line)) {
      const quote: string[] = []
      while (index < lines.length && /^>\s?/u.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/u, ''))
        index += 1
      }
      html.push(`<blockquote>${renderInlineMarkdown(quote.join('\n'))}</blockquote>`)
      continue
    }

    const paragraph: string[] = [line.trim()]
    index += 1
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isBlockStart(lines, index)
    ) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    html.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`)
  }

  return { html: html.join('\n'), toc }
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index] ?? ''
  return (
    line.trim().startsWith('```') ||
    /^(#{1,6})\s+/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^>\s?/.test(line) ||
    isTableStart(lines, index)
  )
}

function isTableStart(lines: string[], index: number): boolean {
  return isTableRow(lines[index]) && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(lines[index + 1] ?? '')
}

function isTableRow(line: string | undefined): boolean {
  return Boolean(line && line.includes('|') && line.replace(/\|/g, '').trim())
}

function renderTable(rows: string[]): string {
  const [header, ...body] = rows.map(splitTableRow)
  return [
    '<div class="md-table-wrap"><table>',
    `<thead><tr>${header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join('')}</tr></thead>`,
    `<tbody>${body
      .map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`)
      .join('')}</tbody>`,
    '</table></div>',
  ].join('')
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/u, '')
    .replace(/\|$/u, '')
    .split('|')
    .map((cell) => cell.trim())
}

function renderInlineMarkdown(value: string): string {
  const codeSpans: string[] = []
  const withoutCode = value.replace(/`([^`]+)`/gu, (_match, code: string) => {
    codeSpans.push(`<code>${escapeHtml(code)}</code>`)
    return `\uE000CODE${codeSpans.length - 1}\uE001`
  })

  let html = escapeHtml(withoutCode)
  html = html.replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/gu, '<em>$1</em>')
  html = html.replace(/\[([^\]]+)\]\(((?:[^()\\]|\\.|\([^)]*\))*)\)/gu, (_match, label: string, href: string) => {
    const safeHref = safeLinkHref(href)
    return safeHref
      ? `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
      : escapeHtml(label)
  })
  html = html.replace(/\uE000CODE(\d+)\uE001/gu, (_match, rawIndex: string) => {
    return codeSpans[Number(rawIndex)] ?? ''
  })
  return html
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/\*\*([^*]+)\*\*/gu, '$1')
    .replace(/\*([^*]+)\*/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
}

function makeHeadingId(text: string, index: number): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gu, '-')
    .replace(/^-|-$/gu, '')
  return slug ? `md-${slug}-${index}` : `md-heading-${index}`
}

function safeLinkHref(value: string): string {
  try {
    const url = new URL(value, window.location.origin)
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
      return ''
    }
    return escapeAttribute(url.toString())
  } catch {
    return ''
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/gu, '&#96;')
}
