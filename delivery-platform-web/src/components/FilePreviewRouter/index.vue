<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type Viewer from 'viewerjs'
import { fileApi } from '@/api/file'
import type { FilePreviewMode, FilePreviewSession, XmindOutlineNode } from '@/api/file'
import { downloadBlob } from '@/utils/blob'
import { renderSafeMarkdown } from '@/utils/markdown-preview'

const AttachmentPreviewPane = defineAsyncComponent(
  () => import('@/components/AttachmentPreviewPane/index.vue'),
)

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
type ViewerConstructor = (typeof import('viewerjs'))['default']
type OnlyOfficeEditor = { destroyEditor?: () => void }
type OpenSeadragonViewer = {
  destroy: () => void
  viewport: {
    zoomBy: (factor: number) => void
    applyConstraints: () => void
    goHome: () => void
  }
}

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (elementId: string, config: Record<string, unknown>) => OnlyOfficeEditor
    }
  }
}

const props = withDefaults(
  defineProps<{
    fileId?: string
    mode?: FilePreviewMode
    height?: string
    compact?: boolean
  }>(),
  {
    mode: 'view',
    height: '72vh',
    compact: false,
  },
)

let pdfjsLibPromise: Promise<PdfJsModule> | null = null
let viewerConstructorPromise: Promise<ViewerConstructor> | null = null
let onlyOfficeScriptPromise: Promise<void> | null = null
let imageViewer: Viewer | null = null
let onlyOfficeEditor: OnlyOfficeEditor | null = null
let openSeadragonViewer: OpenSeadragonViewer | null = null
let pdfRenderToken = 0

const loading = ref(false)
const downloading = ref(false)
const session = ref<FilePreviewSession>()
const pdfContainerRef = ref<HTMLElement>()
const imageViewerRef = ref<HTMLElement>()
const deepZoomRef = ref<HTMLElement>()
const officeRef = ref<HTMLElement>()
const markdownHtml = ref('')
const markdownToc = ref<Array<{ id: string; level: number; text: string }>>([])
const mediaError = ref('')
const pdfPageCount = ref(0)
const pdfError = ref('')
const fallbackToCompatiblePreview = ref(false)

const paneStyle = computed(() => ({ '--file-preview-height': props.height }))
const officeElementId = computed(() => `onlyoffice-editor-${props.fileId || 'empty'}`)
const title = computed(() => session.value?.file.originalName || '文件预览')
const route = computed(() => session.value?.route)
const canDownload = computed(() => Boolean(session.value?.route.supportsDownload))
const xmindHtml = computed(() => renderXmindSheets(session.value?.xmind?.sheets ?? []))

async function loadPdfjs(): Promise<PdfJsModule> {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((module) => {
      module.GlobalWorkerOptions.workerSrc = `${pdfWorkerUrl}?v=file-preview-router`
      return module
    })
  }
  return pdfjsLibPromise
}

async function loadViewerConstructor(): Promise<ViewerConstructor> {
  if (!viewerConstructorPromise) {
    viewerConstructorPromise = Promise.all([
      import('viewerjs'),
      import('viewerjs/dist/viewer.css'),
    ]).then(([module]) => module.default)
  }
  return viewerConstructorPromise
}

function clearViewers(): void {
  pdfRenderToken += 1
  pdfPageCount.value = 0
  pdfError.value = ''
  mediaError.value = ''
  markdownHtml.value = ''
  markdownToc.value = []
  if (pdfContainerRef.value) pdfContainerRef.value.innerHTML = ''
  imageViewer?.destroy()
  imageViewer = null
  onlyOfficeEditor?.destroyEditor?.()
  onlyOfficeEditor = null
  openSeadragonViewer?.destroy()
  openSeadragonViewer = null
}

async function loadPreview(): Promise<void> {
  clearViewers()
  session.value = undefined
  fallbackToCompatiblePreview.value = false
  if (!props.fileId) return

  loading.value = true
  try {
    const nextSession = await fileApi.createPreviewSession(props.fileId, props.mode)
    session.value = nextSession
    await nextTick()
    await renderActiveViewer(nextSession)
  } catch (error) {
    console.warn('File preview session failed; using compatible preview', error)
    clearViewers()
    session.value = undefined
    fallbackToCompatiblePreview.value = true
    Message.warning('高级预览暂不可用，已切换兼容预览')
  } finally {
    loading.value = false
  }
}

async function renderActiveViewer(nextSession: FilePreviewSession): Promise<void> {
  switch (nextSession.route.viewer) {
    case 'pdf':
      await renderPdf(nextSession.urls.content)
      break
    case 'image':
      await enhanceImageViewer()
      break
    case 'deep-zoom-image':
      await renderDeepZoom(nextSession.urls.content)
      break
    case 'markdown':
      await renderMarkdown(nextSession.urls.content)
      break
    case 'onlyoffice':
      await renderOnlyOffice(nextSession)
      break
    default:
      break
  }
}

async function renderPdf(url: string): Promise<void> {
  const token = ++pdfRenderToken
  const container = pdfContainerRef.value
  if (!container) return
  container.innerHTML = ''

  try {
    const pdfjsLib = await loadPdfjs()
    if (token !== pdfRenderToken) return
    const loadingTask = pdfjsLib.getDocument({ url })
    const pdf = await loadingTask.promise
    pdfPageCount.value = pdf.numPages
    const maxPages = Math.min(pdf.numPages, 80)
    const pixelRatio = window.devicePixelRatio || 1
    const scale = 1.25

    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      if (token !== pdfRenderToken) break
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale })
      const wrapper = document.createElement('section')
      wrapper.className = 'pdf-page'
      const label = document.createElement('span')
      label.textContent = `${pageNumber} / ${pdf.numPages}`
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width * pixelRatio)
      canvas.height = Math.floor(viewport.height * pixelRatio)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      const context = canvas.getContext('2d')
      if (!context) throw new Error('PDF canvas context unavailable')
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      wrapper.append(label, canvas)
      container.appendChild(wrapper)
      await page.render({ canvasContext: context, viewport }).promise
    }

    if (pdf.numPages > maxPages) {
      const notice = document.createElement('div')
      notice.className = 'pdf-page-limit'
      notice.textContent = `已渲染前 ${maxPages} 页，完整文件请下载查看。`
      container.appendChild(notice)
    }
    await loadingTask.destroy()
  } catch (error) {
    if (token === pdfRenderToken) {
      console.error('PDF render failed', error)
      pdfError.value = 'PDF 预览渲染失败，请下载后查看。'
    }
  }
}

async function enhanceImageViewer(): Promise<void> {
  await nextTick()
  if (!imageViewerRef.value) return
  const ViewerConstructor = await loadViewerConstructor()
  if (!imageViewerRef.value) return
  imageViewer = new ViewerConstructor(imageViewerRef.value, {
    inline: false,
    navbar: false,
    title: false,
    toolbar: true,
    movable: true,
    zoomable: true,
    rotatable: true,
    scalable: true,
    transition: true,
    fullscreen: true,
  })
}

async function renderDeepZoom(url: string): Promise<void> {
  await nextTick()
  if (!deepZoomRef.value) return
  const module = await import('openseadragon')
  const OpenSeadragon = module.default
  openSeadragonViewer = OpenSeadragon({
    element: deepZoomRef.value,
    tileSources: { type: 'image', url },
    showNavigationControl: false,
    showNavigator: true,
    visibilityRatio: 1,
    minZoomImageRatio: 0.4,
    maxZoomPixelRatio: 4,
  }) as OpenSeadragonViewer
}

async function renderOnlyOffice(nextSession: FilePreviewSession): Promise<void> {
  const office = nextSession.onlyOffice
  if (!office?.available || !office.docsUrl || !office.config) {
    throw new Error('ONLYOFFICE is unavailable')
  }
  await loadOnlyOfficeScript(office.docsUrl)
  await nextTick()
  if (!officeRef.value || !window.DocsAPI) {
    throw new Error('ONLYOFFICE API did not initialize')
  }
  officeRef.value.id = officeElementId.value
  onlyOfficeEditor = new window.DocsAPI.DocEditor(officeElementId.value, office.config)
}

function loadOnlyOfficeScript(docsUrl: string): Promise<void> {
  if (window.DocsAPI) return Promise.resolve()
  if (onlyOfficeScriptPromise) return onlyOfficeScriptPromise
  onlyOfficeScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${docsUrl.replace(/\/+$/u, '')}/web-apps/apps/api/documents/api.js`
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('ONLYOFFICE script load failed'))
    document.head.appendChild(script)
  })
  return onlyOfficeScriptPromise
}

async function renderMarkdown(url: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Markdown fetch failed: ${response.status}`)
  const source = await response.text()
  const rendered = renderSafeMarkdown(source)
  markdownHtml.value = rendered.html
  markdownToc.value = rendered.toc
}

function openImageViewer(): void {
  imageViewer?.show()
}

function zoomDeepImage(factor: number): void {
  openSeadragonViewer?.viewport.zoomBy(factor)
  openSeadragonViewer?.viewport.applyConstraints()
}

function resetDeepImage(): void {
  openSeadragonViewer?.viewport.goHome()
}

async function downloadOriginal(): Promise<void> {
  if (!session.value) return
  downloading.value = true
  try {
    const blob = await fileApi.download(session.value.file.id)
    downloadBlob(blob, session.value.file.originalName)
  } finally {
    downloading.value = false
  }
}

function handleMediaError(): void {
  mediaError.value = '媒体文件无法播放，请下载后查看。'
}

function renderXmindSheets(sheets: Array<{ title: string; root: XmindOutlineNode }>): string {
  if (!sheets.length) {
    return '<div class="xmind-empty">未能读取 XMind 大纲，请下载后查看。</div>'
  }
  return sheets
    .map(
      (sheet) => `
      <section class="xmind-sheet">
        <h3>${escapeHtml(sheet.title)}</h3>
        ${renderXmindNode(sheet.root)}
      </section>
    `,
    )
    .join('')
}

function renderXmindNode(node: XmindOutlineNode): string {
  const children = node.children.length
    ? `<ul>${node.children.map(renderXmindNode).join('')}</ul>`
    : ''
  return `<div class="xmind-node"><span>${escapeHtml(node.title)}</span>${children}</div>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

watch(() => [props.fileId, props.mode], loadPreview, { immediate: true })

onBeforeUnmount(() => {
  clearViewers()
})
</script>

<template>
  <a-spin :loading="loading" class="file-preview-router" :style="paneStyle">
    <div v-if="session" class="preview-shell" :class="{ compact: props.compact }">
      <header class="preview-header">
        <div class="preview-title">
          <strong>{{ title }}</strong>
          <span>{{ session.file.fileExt.toUpperCase() }} · {{ session.file.versionNo }}</span>
        </div>
        <a-space size="mini">
          <a-tag v-if="route?.editable" color="green">可编辑</a-tag>
          <a-tag v-else>只读</a-tag>
          <a-button v-if="canDownload" size="mini" :loading="downloading" @click="downloadOriginal">
            下载
          </a-button>
        </a-space>
      </header>

      <main class="preview-body">
        <section v-if="route?.viewer === 'onlyoffice'" class="office-viewer">
          <div v-if="session.onlyOffice?.available" ref="officeRef" class="office-frame" />
          <AttachmentPreviewPane
            v-else
            :attachment-id="props.fileId"
            source="file"
            :height="props.height"
            compact
          />
        </section>

        <section v-else-if="route?.viewer === 'pdf'" class="pdf-viewer">
          <div class="viewer-toolbar">
            <span>{{ pdfPageCount ? `${pdfPageCount} 页` : 'PDF' }}</span>
          </div>
          <div ref="pdfContainerRef" class="pdf-pages" />
          <a-empty v-if="pdfError" :description="pdfError" />
        </section>

        <section v-else-if="route?.viewer === 'image'" class="image-viewer">
          <div class="viewer-toolbar">
            <span>图片</span>
            <a-button size="mini" @click="openImageViewer">查看</a-button>
          </div>
          <div ref="imageViewerRef" class="image-stage">
            <img :src="session.urls.content" :alt="title" />
          </div>
        </section>

        <section v-else-if="route?.viewer === 'deep-zoom-image'" class="deep-image-viewer">
          <div class="viewer-toolbar">
            <span>大图</span>
            <a-space size="mini">
              <a-button size="mini" @click="zoomDeepImage(1.4)">放大</a-button>
              <a-button size="mini" @click="zoomDeepImage(0.7)">缩小</a-button>
              <a-button size="mini" @click="resetDeepImage">复位</a-button>
            </a-space>
          </div>
          <div ref="deepZoomRef" class="deep-image-stage" />
        </section>

        <section v-else-if="route?.viewer === 'markdown'" class="markdown-viewer">
          <aside v-if="markdownToc.length" class="markdown-toc">
            <a
              v-for="item in markdownToc"
              :key="item.id"
              :href="`#${item.id}`"
              :style="{ paddingLeft: `${(item.level - 1) * 10}px` }"
            >
              {{ item.text }}
            </a>
          </aside>
          <article class="markdown-body" v-html="markdownHtml" />
        </section>

        <section v-else-if="route?.viewer === 'xmind'" class="xmind-viewer" v-html="xmindHtml" />

        <section v-else-if="route?.viewer === 'video'" class="media-viewer">
          <video
            controls
            playsinline
            preload="metadata"
            :src="session.urls.content"
            @error="handleMediaError"
          />
          <a-empty v-if="mediaError" :description="mediaError" />
        </section>

        <section v-else-if="route?.viewer === 'audio'" class="media-viewer audio-viewer">
          <audio
            controls
            preload="metadata"
            :src="session.urls.content"
            @error="handleMediaError"
          />
          <a-empty v-if="mediaError" :description="mediaError" />
        </section>

        <section v-else class="fallback-viewer">
          <a-result
            status="warning"
            title="暂不支持在线预览"
            :subtitle="route?.reason || '请下载后查看该文件。'"
          />
        </section>
      </main>
    </div>
    <AttachmentPreviewPane
      v-else-if="fallbackToCompatiblePreview && props.fileId"
      :attachment-id="props.fileId"
      source="file"
      :height="props.height"
      compact
    />
    <a-empty v-else-if="!loading" description="请选择需要预览的文件" class="preview-empty" />
  </a-spin>
</template>

<style scoped lang="scss">
.file-preview-router {
  height: var(--file-preview-height);
  min-height: 360px;
  display: block;
  background: #f3f5f8;
}

.file-preview-router :deep(.arco-spin-children) {
  height: 100%;
  min-height: 0;
}

.preview-shell {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);

  &.compact {
    grid-template-rows: minmax(0, 1fr);

    .preview-header {
      display: none;
    }

    .preview-body {
      padding: 0;
    }

    .viewer-toolbar {
      display: none;
    }

    .office-viewer,
    .pdf-viewer,
    .image-viewer,
    .deep-image-viewer,
    .markdown-viewer,
    .xmind-viewer,
    .media-viewer,
    .fallback-viewer {
      width: 100%;
      margin: 0;
    }

    .office-frame,
    .image-stage,
    .deep-image-stage {
      height: var(--file-preview-height);
      border: 0;
    }
  }
}

.preview-header {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border-2);
  background: #fff;
}

.preview-title {
  min-width: 0;
  display: grid;
  gap: 2px;

  strong,
  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: var(--color-text-1);
    font-size: 14px;
    font-weight: 650;
  }

  span {
    color: var(--color-text-3);
    font-size: 12px;
  }
}

.preview-body {
  min-height: 0;
  padding: 12px;
  overflow: auto;
}

.office-viewer,
.pdf-viewer,
.image-viewer,
.deep-image-viewer,
.markdown-viewer,
.xmind-viewer,
.media-viewer,
.fallback-viewer {
  width: 100%;
  min-height: 100%;
  margin: 0;
}

.office-frame {
  height: calc(var(--file-preview-height) - 72px);
  min-height: 520px;
  border: 1px solid var(--color-border-2);
  background: #fff;
}

.viewer-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px;
  border: 1px solid var(--color-border-2);
  background: rgba(255, 255, 255, 0.96);
  color: var(--color-text-2);
  font-size: 12px;
}

.pdf-pages {
  display: grid;
  gap: 16px;
  justify-items: center;
  padding: 12px 0 24px;
}

.pdf-pages :deep(.pdf-page) {
  position: relative;
  max-width: 100%;
  padding: 14px;
  border: 1px solid #d9dfe8;
  background: #fff;
  box-shadow: 0 12px 30px rgba(24, 31, 45, 0.12);
  overflow: auto;
}

.pdf-pages :deep(.pdf-page span) {
  position: absolute;
  right: 12px;
  top: 8px;
  color: var(--color-text-3);
  font-size: 12px;
}

.pdf-pages :deep(canvas) {
  display: block;
  max-width: 100%;
  height: auto !important;
}

.pdf-pages :deep(.pdf-page-limit) {
  padding: 10px 12px;
  border: 1px solid var(--color-border-2);
  background: #fff;
  color: var(--color-text-2);
  font-size: 13px;
}

.image-stage {
  height: calc(var(--file-preview-height) - 116px);
  min-height: 420px;
  display: grid;
  place-items: center;
  padding: 12px;
  border: 1px solid var(--color-border-2);
  border-top: 0;
  background: #fff;
  overflow: auto;
}

.image-stage img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.deep-image-stage {
  height: calc(var(--file-preview-height) - 116px);
  min-height: 520px;
  border: 1px solid var(--color-border-2);
  border-top: 0;
  background: #101418;
}

.markdown-viewer {
  display: grid;
  grid-template-columns: minmax(160px, 220px) minmax(0, 1fr);
  gap: 12px;
}

.markdown-toc {
  position: sticky;
  top: 0;
  align-self: start;
  max-height: calc(var(--file-preview-height) - 84px);
  overflow: auto;
  padding: 10px;
  border: 1px solid var(--color-border-2);
  background: #fff;
}

.markdown-toc a {
  display: block;
  padding-top: 5px;
  padding-bottom: 5px;
  color: var(--color-text-2);
  font-size: 12px;
  line-height: 1.4;
  text-decoration: none;
}

.markdown-body {
  min-width: 0;
  padding: 24px 28px;
  border: 1px solid var(--color-border-2);
  background: #fff;
  color: var(--color-text-1);
  line-height: 1.72;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 1.1em 0 0.5em;
  color: var(--color-text-1);
  font-weight: 650;
  line-height: 1.35;
}

.markdown-body :deep(h1) {
  font-size: 24px;
}

.markdown-body :deep(h2) {
  font-size: 20px;
}

.markdown-body :deep(p) {
  margin: 0 0 12px;
}

.markdown-body :deep(pre) {
  overflow: auto;
  padding: 12px;
  border: 1px solid #d9dfe8;
  background: #f7f8fa;
}

.markdown-body :deep(code) {
  padding: 1px 4px;
  border-radius: 3px;
  background: #f1f3f6;
  font-family: Consolas, 'SFMono-Regular', monospace;
  font-size: 0.92em;
}

.markdown-body :deep(pre code) {
  padding: 0;
  background: transparent;
}

.markdown-body :deep(.md-table-wrap) {
  overflow: auto;
  margin: 12px 0;
}

.markdown-body :deep(table) {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  min-width: 120px;
  padding: 7px 9px;
  border: 1px solid #d9dfe8;
  text-align: left;
  vertical-align: top;
}

.markdown-body :deep(th) {
  background: #eef3f8;
  font-weight: 650;
}

.xmind-viewer {
  display: grid;
  gap: 12px;
}

.xmind-viewer :deep(.xmind-sheet) {
  padding: 18px;
  border: 1px solid var(--color-border-2);
  background: #fff;
}

.xmind-viewer :deep(h3) {
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 650;
}

.xmind-viewer :deep(.xmind-node) {
  margin: 6px 0;
}

.xmind-viewer :deep(.xmind-node span) {
  display: inline-flex;
  max-width: 100%;
  padding: 5px 8px;
  border: 1px solid #d9dfe8;
  background: #f9fafb;
  color: var(--color-text-1);
  font-size: 13px;
  line-height: 1.35;
  word-break: break-word;
}

.xmind-viewer :deep(ul) {
  margin: 6px 0 6px 22px;
  padding-left: 14px;
  border-left: 1px solid #d9dfe8;
  list-style: none;
}

.media-viewer {
  display: grid;
  gap: 12px;
  place-items: center;
  padding: 24px;
  border: 1px solid var(--color-border-2);
  background: #fff;
}

.media-viewer video {
  width: min(100%, 1080px);
  max-height: calc(var(--file-preview-height) - 140px);
  background: #111;
}

.media-viewer audio {
  width: min(100%, 720px);
}

.fallback-viewer {
  display: grid;
  place-content: center;
  min-height: 360px;
  border: 1px solid var(--color-border-2);
  background: #fff;
}

.preview-empty {
  height: 100%;
  display: grid;
  place-content: center;
}

@media (max-width: 900px) {
  .preview-body {
    padding: 8px;
  }

  .markdown-viewer {
    grid-template-columns: 1fr;
  }

  .markdown-toc {
    position: static;
    max-height: 160px;
  }

  .markdown-body {
    padding: 18px;
  }
}
</style>
