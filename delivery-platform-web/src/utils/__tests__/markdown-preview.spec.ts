import { describe, expect, it } from 'vitest'

import { renderSafeMarkdown } from '../markdown-preview'

describe('renderSafeMarkdown', () => {
  it('escapes raw html and script content', () => {
    const result = renderSafeMarkdown('# Title\n<script>alert(1)</script>')

    expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(result.html).not.toContain('<script>')
    expect(result.toc).toEqual([{ id: 'md-title-0', level: 1, text: 'Title' }])
  })

  it('renders tables and fenced code blocks', () => {
    const result = renderSafeMarkdown([
      '| Name | Value |',
      '| --- | --- |',
      '| A | `1` |',
      '',
      '```ts',
      'const a = 1 < 2',
      '```',
    ].join('\n'))

    expect(result.html).toContain('<table>')
    expect(result.html).toContain('<code>1</code>')
    expect(result.html).toContain('data-language="ts"')
    expect(result.html).toContain('const a = 1 &lt; 2')
  })

  it('drops unsafe links', () => {
    const result = renderSafeMarkdown('[x](javascript:alert(1))')

    expect(result.html).toContain('<p>x</p>')
    expect(result.html).not.toContain('javascript:')
  })
})
