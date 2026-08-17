import { describe, expect, it } from 'vitest'

import { useFilePreview } from '@/platform/file-preview/useFilePreview'

describe('useFilePreview', () => {
  it('opens unified file targets in the shared modal state', () => {
    const preview = useFilePreview()

    preview.openPreview({ id: ' file-1 ', title: ' 附件.pdf ' })
    expect(preview.visible.value).toBe(true)
    expect(preview.resourceId.value).toBe('file-1')
    expect(preview.contentType.value).toBe('FILE')
    expect(preview.markdownContent.value).toBe('')
    expect(preview.title.value).toBe('附件.pdf')

    preview.openPreview({ id: 'file-2' })
    expect(preview.resourceId.value).toBe('file-2')
    expect(preview.title.value).toBe('在线预览')
  })

  it('opens inline Markdown in the same shared modal state', () => {
    const preview = useFilePreview()

    preview.openMarkdownPreview({ content: '# 知识正文', title: ' 知识文档 ' })

    expect(preview.visible.value).toBe(true)
    expect(preview.contentType.value).toBe('MARKDOWN')
    expect(preview.resourceId.value).toBe('')
    expect(preview.markdownContent.value).toBe('# 知识正文')
    expect(preview.title.value).toBe('知识文档')
  })

  it('ignores empty identifiers and closes without discarding the selected target', () => {
    const preview = useFilePreview()
    preview.openPreview({ id: 'file-2', title: '项目文件' })
    preview.closePreview()

    expect(preview.visible.value).toBe(false)
    expect(preview.resourceId.value).toBe('file-2')

    preview.openPreview({ id: '   ' })
    expect(preview.visible.value).toBe(false)
    expect(preview.resourceId.value).toBe('file-2')
  })
})
