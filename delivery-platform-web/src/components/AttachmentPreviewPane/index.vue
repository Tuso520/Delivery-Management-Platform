<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { attachmentApi } from '@/api/attachment'
import type { AttachmentPreview } from '@/api/attachment'

pdfjsLib.GlobalWorkerOptions.workerSrc = `${pdfWorkerUrl}?v=pdfjs-canvas-20260708`

const props = withDefaults(defineProps<{
  attachmentId?: string
  height?: string
  compact?: boolean
}>(), {
  height: '72vh',
  compact: false,
})

const loading = ref(false)
const preview = ref<AttachmentPreview>()
const objectUrl = ref('')
const pdfContainerRef = ref<HTMLElement>()
const pdfPageCount = ref(0)
const pdfRenderError = ref('')
let pdfRenderToken = 0

const isMarkdown = computed(() => (preview.value?.fileExt || '').toLowerCase() === 'md')
const paneStyle = computed(() => ({ '--preview-pane-height': props.height }))

function revokeObjectUrl(): void {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = ''
  }
}

function clearPdfPreview(): void {
  pdfRenderToken += 1
  pdfPageCount.value = 0
  pdfRenderError.value = ''
  if (pdfContainerRef.value) {
    pdfContainerRef.value.innerHTML = ''
  }
}

async function renderPdf(blob: Blob): Promise<void> {
  const token = ++pdfRenderToken
  pdfPageCount.value = 0
  pdfRenderError.value = ''
  await nextTick()

  const container = pdfContainerRef.value
  if (!container) return

  container.innerHTML = ''
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: await blob.arrayBuffer(),
    })
    const pdf = await loadingTask.promise
    if (token !== pdfRenderToken) {
      await loadingTask.destroy()
      return
    }

    pdfPageCount.value = pdf.numPages
    const scale = 1.35
    const pixelRatio = window.devicePixelRatio || 1

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (token !== pdfRenderToken) break
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale })
      const wrapper = document.createElement('section')
      wrapper.className = 'pdf-page-shell'

      const pageLabel = document.createElement('div')
      pageLabel.className = 'pdf-page-label'
      pageLabel.textContent = `${pageNumber} / ${pdf.numPages}`

      const canvas = document.createElement('canvas')
      canvas.className = 'pdf-page-canvas'
      canvas.width = Math.floor(viewport.width * pixelRatio)
      canvas.height = Math.floor(viewport.height * pixelRatio)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`

      const context = canvas.getContext('2d')
      if (!context) throw new Error('PDF canvas context unavailable')
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

      wrapper.append(pageLabel, canvas)
      container.appendChild(wrapper)
      await page.render({ canvas, canvasContext: context, viewport }).promise
    }

    await loadingTask.destroy()
  } catch (error) {
    if (token === pdfRenderToken) {
      console.error(error)
      pdfRenderError.value = 'PDF 内容渲染失败，请下载后查看原文件。'
    }
  }
}

async function loadPreview(): Promise<void> {
  revokeObjectUrl()
  clearPdfPreview()
  preview.value = undefined
  if (!props.attachmentId) return

  loading.value = true
  try {
    const nextPreview = await attachmentApi.getPreview(props.attachmentId)
    preview.value = nextPreview

    if (nextPreview.previewKind === 'image') {
      const blob = await attachmentApi.getContent(props.attachmentId)
      objectUrl.value = URL.createObjectURL(blob)
    } else if (nextPreview.previewKind === 'pdf') {
      const blob = await attachmentApi.getContent(props.attachmentId)
      await renderPdf(blob)
    }
  } catch {
    Message.error('预览内容加载失败')
  } finally {
    loading.value = false
  }
}

watch(() => props.attachmentId, loadPreview, { immediate: true })
onBeforeUnmount(() => {
  revokeObjectUrl()
  clearPdfPreview()
})
</script>

<template>
  <a-spin :loading="loading" class="attachment-preview-pane" :style="paneStyle">
    <div v-if="preview" class="preview-surface" :class="{ compact: props.compact }">
      <img
        v-if="preview.previewKind === 'image' && objectUrl"
        class="preview-image"
        :src="objectUrl"
        :alt="preview.title || preview.fileName"
      />

      <div
        v-else-if="preview.previewKind === 'pdf'"
        class="preview-pdf"
      >
        <div class="pdf-toolbar">
          <span>PDF 只读预览</span>
          <span v-if="pdfPageCount">{{ pdfPageCount }} 页</span>
        </div>
        <div ref="pdfContainerRef" class="pdf-page-list" />
        <a-empty
          v-if="pdfRenderError"
          :description="pdfRenderError"
          class="preview-empty"
        />
      </div>

      <MdPreview
        v-else-if="preview.previewKind === 'text' && isMarkdown"
        :model-value="preview.text || ''"
        language="zh-CN"
        class="markdown-preview"
      />

      <pre v-else-if="preview.previewKind === 'text'" class="preview-text">
{{ preview.text || '' }}
      </pre>

      <div
        v-else-if="preview.previewKind === 'html'"
        class="preview-html"
        v-html="preview.html || ''"
      />

      <a-empty
        v-else
        :description="preview.reason || '当前文件暂不支持在线预览，请下载后查看。'"
        class="preview-empty"
      />
    </div>
    <a-empty v-else-if="!loading" description="请选择需要预览的文件" class="preview-empty" />
  </a-spin>
</template>

<style scoped lang="scss">
.attachment-preview-pane {
  height: var(--preview-pane-height);
  min-height: 360px;
  display: block;
  background: #f2f4f8;
}

.attachment-preview-pane :deep(.arco-spin-children) {
  height: 100%;
  min-height: 0;
}

.preview-surface {
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 16px;

  &.compact {
    padding: 10px;
  }
}

.preview-image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  margin: 0 auto;
  border: 1px solid var(--color-border-2);
  background: #fff;
  object-fit: contain;
}

.preview-text,
.markdown-preview,
.preview-html,
.preview-pdf {
  width: min(1240px, 100%);
  min-height: 100%;
  margin: 0 auto;
  background: transparent;
}

.preview-pdf {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pdf-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  border: 1px solid #d9dfe8;
  background: rgba(255, 255, 255, 0.96);
  color: #4e5969;
  font-size: 13px;
}

.pdf-page-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding-bottom: 20px;
}

.preview-pdf :deep(.pdf-page-shell) {
  position: relative;
  max-width: 100%;
  padding: 16px;
  border: 1px solid #d9dfe8;
  background: #fff;
  box-shadow: 0 16px 42px rgba(15, 23, 42, 0.12);
  overflow: auto;
}

.preview-pdf :deep(.pdf-page-label) {
  position: absolute;
  right: 16px;
  top: 10px;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.9);
  color: #86909c;
  font-size: 12px;
}

.preview-pdf :deep(.pdf-page-canvas) {
  display: block;
  max-width: 100%;
  height: auto !important;
}

.markdown-preview {
  padding: 22px 28px;
  border: 1px solid var(--color-border-2);
  background: #fff;
}

.preview-text {
  padding: 22px 28px;
  border: 1px solid var(--color-border-2);
  color: var(--color-text-1);
  font-family: Consolas, "SFMono-Regular", monospace;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.preview-html :deep(.attachment-preview > header) {
  display: none;
}

.preview-html :deep(.attachment-preview) {
  margin: 0;
}

.preview-html :deep(.office-word) {
  display: flex;
  justify-content: center;
  padding: 10px 0 26px;
}

.preview-html :deep(.word-page) {
  width: min(900px, 100%);
  min-height: 1120px;
  padding: 72px 82px;
  border: 1px solid #d9dfe8;
  background: #fff;
  box-shadow: 0 16px 42px rgba(15, 23, 42, 0.12);
}

.preview-html :deep(.word-page-meta) {
  margin-bottom: 18px;
  color: #86909c;
  font-size: 12px;
}

.preview-html :deep(.word-body h1) {
  margin: 0 0 28px;
  color: #1d2129;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
}

.preview-html :deep(.word-body p) {
  margin: 0 0 12px;
  color: #1d2129;
  font-size: 15px;
  line-height: 1.9;
  text-indent: 2em;
  white-space: pre-wrap;
}

.preview-html :deep(.office-excel) {
  min-width: 100%;
  min-height: 100%;
  border: 1px solid #d9dfe8;
  background: #f7f9fc;
}

.preview-html :deep(.excel-workbook) {
  min-width: 980px;
}

.preview-html :deep(.preview-sheet) {
  margin: 0;
  padding: 0 0 30px;
  background: #fff;
}

.preview-html :deep(.preview-sheet h3) {
  position: sticky;
  top: 0;
  z-index: 2;
  margin: 0;
  padding: 9px 12px;
  border-bottom: 1px solid #d9dfe8;
  background: #f2f5f9;
  color: #1d2129;
  font-size: 13px;
  font-weight: 650;
}

.preview-html :deep(.preview-table-wrap) {
  width: 100%;
  max-height: 58vh;
  overflow: auto;
  resize: both;
  padding: 10px;
  background: #fff;
}

.preview-html :deep(table) {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  table-layout: auto;
  font-size: 13px;
  background: #fff;
}

.preview-html :deep(td),
.preview-html :deep(th) {
  min-width: 118px;
  max-width: 360px;
  height: 34px;
  padding: 7px 9px;
  border: 1px solid #d9dfe8;
  vertical-align: top;
  overflow: auto;
  resize: both;
  word-break: break-word;
}

.preview-html :deep(tr:first-child td),
.preview-html :deep(tr:first-child th) {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #edf3ff;
  color: #1d2129;
  font-weight: 650;
}

.preview-html :deep(.office-presentation) {
  display: grid;
  gap: 16px;
}

.preview-html :deep(.preview-slide) {
  aspect-ratio: 16 / 9;
  max-width: 960px;
  margin: 0 auto 18px;
  padding: 48px 56px;
  border: 1px solid #d9dfe8;
  background: #fff;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.12);
}

.preview-empty {
  height: 100%;
  display: grid;
  place-content: center;
}

@media (max-width: 900px) {
  .preview-surface {
    padding: 10px;
  }

  .preview-html :deep(.word-page) {
    min-height: auto;
    padding: 36px 24px;
  }
}
</style>
