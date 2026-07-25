import { readonly, ref } from 'vue'

export interface FilePreviewTarget {
  id: string
  title?: string
}

const visible = ref(false)
const resourceId = ref('')
const title = ref('在线预览')

export function useFilePreview() {
  function openPreview(target: FilePreviewTarget): void {
    const id = target.id.trim()
    if (!id) return

    resourceId.value = id
    title.value = target.title?.trim() || '在线预览'
    visible.value = true
  }

  function closePreview(): void {
    visible.value = false
  }

  return {
    visible: readonly(visible),
    resourceId: readonly(resourceId),
    title: readonly(title),
    openPreview,
    closePreview,
  }
}
