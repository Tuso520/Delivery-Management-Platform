import { readonly, ref } from 'vue'

export interface FilePreviewTarget {
  id: string
  title?: string
}

export interface MarkdownPreviewTarget {
  content: string
  title?: string
}

export type PreviewContentType = 'FILE' | 'MARKDOWN'

const visible = ref(false)
const resourceId = ref('')
const markdownContent = ref('')
const contentType = ref<PreviewContentType>('FILE')
const title = ref('在线预览')

export function useFilePreview() {
  function openPreview(target: FilePreviewTarget): void {
    const id = target.id.trim()
    if (!id) return

    resourceId.value = id
    markdownContent.value = ''
    contentType.value = 'FILE'
    title.value = target.title?.trim() || '在线预览'
    visible.value = true
  }

  function openMarkdownPreview(target: MarkdownPreviewTarget): void {
    resourceId.value = ''
    markdownContent.value = target.content
    contentType.value = 'MARKDOWN'
    title.value = target.title?.trim() || '在线预览'
    visible.value = true
  }

  function closePreview(): void {
    visible.value = false
  }

  return {
    visible: readonly(visible),
    resourceId: readonly(resourceId),
    markdownContent: readonly(markdownContent),
    contentType: readonly(contentType),
    title: readonly(title),
    openPreview,
    openMarkdownPreview,
    closePreview,
  }
}
