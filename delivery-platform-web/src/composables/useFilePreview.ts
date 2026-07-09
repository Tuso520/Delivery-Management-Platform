import { readonly, ref } from 'vue'

export type FilePreviewSource = 'attachment' | 'file'

export interface FilePreviewTarget {
  id: string
  source: FilePreviewSource
  title?: string
}

const visible = ref(false)
const resourceId = ref('')
const source = ref<FilePreviewSource>('attachment')
const title = ref('在线预览')

export function useFilePreview() {
  function openPreview(target: FilePreviewTarget): void {
    const id = target.id.trim()
    if (!id) return

    resourceId.value = id
    source.value = target.source
    title.value = target.title?.trim() || '在线预览'
    visible.value = true
  }

  function closePreview(): void {
    visible.value = false
  }

  return {
    visible: readonly(visible),
    resourceId: readonly(resourceId),
    source: readonly(source),
    title: readonly(title),
    openPreview,
    closePreview,
  }
}
