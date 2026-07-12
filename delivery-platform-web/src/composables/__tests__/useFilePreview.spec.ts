import { describe, expect, it } from 'vitest'

import { useFilePreview } from '@/composables/useFilePreview'

describe('useFilePreview', () => {
  it('opens unified file targets in the shared modal state', () => {
    const preview = useFilePreview()

    preview.openPreview({ id: ' file-1 ', title: ' 附件.pdf ' })
    expect(preview.visible.value).toBe(true)
    expect(preview.resourceId.value).toBe('file-1')
    expect(preview.title.value).toBe('附件.pdf')

    preview.openPreview({ id: 'file-2' })
    expect(preview.resourceId.value).toBe('file-2')
    expect(preview.title.value).toBe('在线预览')
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
