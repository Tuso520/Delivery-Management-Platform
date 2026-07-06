<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Message, Modal } from '@arco-design/web-vue'
import type { TableColumnData } from '@arco-design/web-vue'
import { IconDownload, IconEye } from '@arco-design/web-vue/es/icon'
import { attachmentApi } from '@/api/attachment'
import type { AttachmentPreview } from '@/api/attachment'
import { knowledgeApi } from '@/api/knowledge'
import type {
  KnowledgeArticle,
  KnowledgeAttachment,
  KnowledgeCategory,
  QueryKnowledgeArticleDto,
} from '@/types/knowledge'
import { downloadBlob } from '@/utils/blob'

type PreviewState = AttachmentPreview & { objectUrl?: string }

interface KnowledgeFileRow extends KnowledgeAttachment {
  articleId: string
  articleTitle: string
  categoryId: string
  categoryName: string
  topic: string
}

interface CategoryIndexItem {
  category: KnowledgeCategory
  files: KnowledgeFileRow[]
  totalFileCount: number
}

const router = useRouter()
const loading = ref(false)
const categories = ref<KnowledgeCategory[]>([])
const articles = ref<KnowledgeArticle[]>([])
const activeCategoryId = ref('')
const fileStreamRef = ref<HTMLElement>()

const previewVisible = ref(false)
const previewLoading = ref(false)
const preview = ref<PreviewState>()

const revisionVisible = ref(false)
const revisionSubmitting = ref(false)
const revisionTarget = ref<KnowledgeFileRow>()
const replacementFiles = ref<File[]>([])

function fileColumnsFor(categoryName: string): TableColumnData[] {
  return [
    { title: categoryName, dataIndex: 'originalName', slotName: 'file', minWidth: 520 },
    { title: '类型', dataIndex: 'fileExt', slotName: 'type', width: 64 },
    { title: '大小', dataIndex: 'fileSize', slotName: 'size', width: 78 },
    { title: '更新时间', dataIndex: 'createdAt', slotName: 'updatedAt', width: 132 },
    { title: '操作', slotName: 'actions', width: 224, fixed: 'right' },
  ]
}

const rootCategories = computed(() => categories.value.filter((category) => !category.parentId))

const categoryRootLookup = computed(() => {
  const lookup = new Map<string, string>()
  const visit = (category: KnowledgeCategory, rootId: string) => {
    lookup.set(category.id, rootId)
    ;(category.children || []).forEach((child) => visit(child, rootId))
  }
  rootCategories.value.forEach((category) => visit(category, category.id))
  return lookup
})

const categorySections = computed<CategoryIndexItem[]>(() => {
  return rootCategories.value.map((category) => {
    const allFiles = articles.value.flatMap((article) => {
      const rootId = categoryRootLookup.value.get(article.categoryId) || article.categoryId
      if (rootId !== category.id) return []

      return (article.files || []).map((file) => ({
        ...file,
        articleId: article.id,
        articleTitle: article.title,
        categoryId: article.categoryId,
        categoryName: category.name,
        topic: articleTopic(article, category.name),
      }))
    })

    return {
      category,
      files: allFiles,
      totalFileCount: allFiles.length,
    }
  })
})

const activeSection = computed(() =>
  categorySections.value.find((section) => section.category.id === activeCategoryId.value)
  || categorySections.value[0],
)

const previewTitle = computed(() => preview.value?.title || preview.value?.fileName || '在线预览')

function articleTopic(article: KnowledgeArticle, rootName: string): string {
  const prefix = `${rootName} - `
  const topic = article.title.startsWith(prefix) ? article.title.slice(prefix.length) : article.title
  return topic && topic !== rootName ? topic : ''
}

function formatFileSize(value: string | number): string {
  const size = Number(value)
  if (!Number.isFinite(size)) return '-'
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

function formatDate(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function viewerLabel(viewer?: AttachmentPreview['viewer']): string {
  const labels: Record<AttachmentPreview['viewer'], string> = {
    image: '图片预览',
    pdf: 'PDF 预览',
    document: '文档预览',
    spreadsheet: '表格预览',
    presentation: '演示预览',
    text: '文本预览',
    download: '下载查看',
  }
  return viewer ? labels[viewer] : '在线预览'
}

function incrementFileHeat(fileId: string, key: 'previewCount' | 'downloadCount'): void {
  for (const article of articles.value) {
    const target = article.files?.find((file) => file.id === fileId)
    if (target) {
      target[key] = (target[key] || 0) + 1
      return
    }
  }
}

async function fetchCategories(): Promise<void> {
  categories.value = await knowledgeApi.getCategories()
  if (!activeCategoryId.value && rootCategories.value.length) {
    activeCategoryId.value = rootCategories.value[0].id
  }
}

async function fetchArticles(): Promise<void> {
  loading.value = true
  try {
    const params: QueryKnowledgeArticleDto = { page: 1, pageSize: 300 }
    articles.value = (await knowledgeApi.getArticles(params)).list
    await nextTick()
    updateActiveCategoryByScroll()
  } finally {
    loading.value = false
  }
}

async function scrollToCategory(categoryId: string): Promise<void> {
  activeCategoryId.value = categoryId
  await nextTick()
  const container = fileStreamRef.value
  const target = document.getElementById(`knowledge-${categoryId}`)
  if (container && target) {
    container.scrollTo({
      top: target.offsetTop,
      behavior: 'smooth',
    })
    return
  }
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function updateActiveCategoryByScroll(): void {
  const container = fileStreamRef.value
  if (!container || !categorySections.value.length) return

  const containerTop = container.getBoundingClientRect().top
  const threshold = 48
  let currentId = categorySections.value[0].category.id

  for (const section of categorySections.value) {
    const element = document.getElementById(`knowledge-${section.category.id}`)
    if (!element) continue
    const top = element.getBoundingClientRect().top - containerTop
    if (top <= threshold) {
      currentId = section.category.id
    } else {
      break
    }
  }

  activeCategoryId.value = currentId
}

async function previewAttachment(file: KnowledgeFileRow | KnowledgeAttachment): Promise<void> {
  releasePreviewObjectUrl()
  previewVisible.value = true
  previewLoading.value = true
  preview.value = {
    fileName: file.originalName,
    fileExt: file.fileExt,
    mimeType: file.mimeType,
    previewKind: 'unsupported',
    viewer: 'download',
    title: file.originalName,
  }

  try {
    const metadata = await attachmentApi.getPreview(file.id)
    if (metadata.previewKind === 'image' || metadata.previewKind === 'pdf') {
      preview.value = {
        ...metadata,
        objectUrl: URL.createObjectURL(await attachmentApi.getContent(file.id)),
      }
    } else {
      preview.value = metadata
    }
    incrementFileHeat(file.id, 'previewCount')
  } finally {
    previewLoading.value = false
  }
}

async function downloadAttachment(file: KnowledgeFileRow | KnowledgeAttachment): Promise<void> {
  downloadBlob(await attachmentApi.getContent(file.id), file.originalName)
  incrementFileHeat(file.id, 'downloadCount')
}

function openRevision(file: KnowledgeFileRow): void {
  revisionTarget.value = file
  replacementFiles.value = []
  revisionVisible.value = true
}

function selectReplacement(event: Event): void {
  replacementFiles.value = Array.from((event.target as HTMLInputElement).files ?? [])
}

async function submitRevision(): Promise<void> {
  if (!revisionTarget.value || !replacementFiles.value.length) {
    Message.warning('请选择需要提交审批的新文件')
    return
  }

  revisionSubmitting.value = true
  try {
    const data = new FormData()
    data.append('files', replacementFiles.value[0])
    await knowledgeApi.submitFileRevision(
      revisionTarget.value.articleId,
      revisionTarget.value.id,
      data,
    )
    Message.success('文件更新已提交审批')
    revisionVisible.value = false
    await fetchArticles()
  } finally {
    revisionSubmitting.value = false
  }
}

function deleteAttachment(file: KnowledgeFileRow): void {
  Modal.warning({
    title: '删除文件',
    content: `确认删除“${file.originalName}”？`,
    okText: '删除',
    cancelText: '取消',
    hideCancel: false,
    async onOk() {
      await attachmentApi.delete(file.id)
      Message.success('文件已删除')
      await fetchArticles()
    },
  })
}

function goApprovalTasks(): void {
  router.push('/operations/approval?tab=tasks')
}

function releasePreviewObjectUrl(): void {
  if (preview.value?.objectUrl) {
    URL.revokeObjectURL(preview.value.objectUrl)
  }
}

onMounted(async () => {
  await Promise.all([fetchCategories(), fetchArticles()])
  await nextTick()
  updateActiveCategoryByScroll()
})

onBeforeUnmount(() => {
  releasePreviewObjectUrl()
})
</script>

<template>
  <section class="knowledge-page">
    <aside class="category-sidebar">
      <div class="category-header">
        <div>
          <h2>知识分类</h2>
        </div>
        <a-button size="small" type="text" @click="fetchArticles">刷新</a-button>
      </div>

      <div class="category-list">
        <button
          v-for="section in categorySections"
          :key="section.category.id"
          class="category-item"
          :class="{ active: section.category.id === activeCategoryId }"
          type="button"
          @click="scrollToCategory(section.category.id)"
        >
          <span>{{ section.category.name }}</span>
          <em>{{ section.totalFileCount }}</em>
        </button>
      </div>
    </aside>

    <main class="file-panel">
      <div class="file-toolbar">
        <div class="toolbar-title">
          <strong>{{ activeSection?.category.name || '知识库' }}</strong>
          <span>{{ activeSection?.totalFileCount || 0 }} 个文件</span>
        </div>
        <a-space size="mini">
          <a-button size="small" @click="goApprovalTasks">更新审批</a-button>
          <a-button size="small" type="primary" @click="router.push('/knowledge/articles/new')">
            新增资料
          </a-button>
        </a-space>
      </div>

      <a-spin :loading="loading" class="file-spin">
        <div ref="fileStreamRef" class="file-stream" @scroll.passive="updateActiveCategoryByScroll">
          <section
            v-for="section in categorySections"
            :id="`knowledge-${section.category.id}`"
            :key="section.category.id"
            class="file-section"
          >
            <a-table
              v-if="section.files.length"
              :columns="fileColumnsFor(section.category.name)"
              :data="section.files"
              :pagination="false"
              :bordered="{ cell: false }"
              row-key="id"
              class="file-table"
            >
              <template #file="{ record }">
                <div class="file-name-cell">
                  <div class="file-title-line">
                    <strong>{{ record.originalName }}</strong>
                    <span class="file-heat" title="在线预览热度">
                      <IconEye />
                      {{ record.previewCount || 0 }}
                    </span>
                    <span class="file-heat" title="下载热度">
                      <IconDownload />
                      {{ record.downloadCount || 0 }}
                    </span>
                  </div>
                  <p v-if="record.remark" class="file-remark">
                    {{ record.remark }}
                  </p>
                </div>
              </template>
              <template #type="{ record }">
                <a-tag size="small">{{ record.fileExt.toUpperCase() }}</a-tag>
              </template>
              <template #size="{ record }">
                {{ formatFileSize(record.fileSize) }}
              </template>
              <template #updatedAt="{ record }">
                {{ formatDate(record.createdAt) }}
              </template>
              <template #actions="{ record }">
                <a-space size="mini" :wrap="false" class="file-actions">
                  <a-button type="text" size="mini" @click="previewAttachment(record)">
                    在线预览
                  </a-button>
                  <a-button type="text" size="mini" @click="downloadAttachment(record)">
                    下载
                  </a-button>
                  <a-button type="text" size="mini" @click="openRevision(record)">
                    编辑
                  </a-button>
                  <a-button
                    type="text"
                    size="mini"
                    status="danger"
                    @click="deleteAttachment(record)"
                  >
                    删除
                  </a-button>
                </a-space>
              </template>
            </a-table>

            <a-empty
              v-else
              description="暂无文件"
              class="section-empty"
            />
          </section>
        </div>
      </a-spin>
    </main>

    <a-modal
      v-model:visible="revisionVisible"
      title="提交文件更新审批"
      :confirm-loading="revisionSubmitting"
      ok-text="提交审批"
      cancel-text="取消"
      @ok="submitRevision"
    >
      <div class="revision-form">
        <div>
          <span>原文件</span>
          <strong>{{ revisionTarget?.originalName || '-' }}</strong>
        </div>
        <div>
          <span>所属分类</span>
          <strong>{{ revisionTarget?.categoryName || '-' }}</strong>
        </div>
        <label class="file-picker">
          <span>选择新文件</span>
          <input
            type="file"
            accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
            @change="selectReplacement"
          />
        </label>
        <p v-if="replacementFiles.length">
          待提交：{{ replacementFiles[0].name }} / {{ formatFileSize(replacementFiles[0].size) }}
        </p>
      </div>
    </a-modal>

    <a-modal
      v-model:visible="previewVisible"
      :title="previewTitle"
      :footer="false"
      :width="980"
      class="preview-modal"
    >
      <a-spin :loading="previewLoading">
        <div class="preview-meta">
          <a-tag>{{ viewerLabel(preview?.viewer) }}</a-tag>
          <span>{{ preview?.fileExt?.toUpperCase() }}</span>
        </div>
        <img
          v-if="preview?.previewKind === 'image' && preview.objectUrl"
          :src="preview.objectUrl"
          alt=""
          class="image-preview"
        />
        <iframe
          v-else-if="preview?.previewKind === 'pdf' && preview.objectUrl"
          :src="preview.objectUrl"
          class="pdf-preview"
          title="PDF 在线预览"
        />
        <div
          v-else-if="preview?.previewKind === 'html'"
          class="office-preview"
          v-html="preview.html"
        />
        <pre v-else-if="preview?.previewKind === 'text'" class="text-preview">{{ preview.text }}</pre>
        <a-result
          v-else
          status="warning"
          title="暂不支持在线预览"
          :subtitle="preview?.reason || '请下载后查看该文件。'"
        />
      </a-spin>
    </a-modal>
  </section>
</template>

<style scoped lang="scss">
.knowledge-page {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  gap: 6px;
  align-items: stretch;
  overflow: hidden;
}

.category-sidebar,
.file-panel {
  min-width: 0;
  min-height: 0;
  height: 100%;
  border: 1px solid var(--color-border-2);
  border-radius: 0;
  background: var(--color-bg-2);
}

.category-sidebar {
  display: flex;
  flex-direction: column;
  padding: 6px;
  position: relative;
  overflow: hidden;
}

.category-header {
  display: flex;
  min-height: 50px;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 7px;
  padding: 0 2px;

  h2 {
    margin: 0;
    color: var(--color-text-1);
    font-size: 15px;
    font-weight: 650;
  }
}

.category-list {
  display: grid;
  align-content: start;
  gap: 3px;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.category-item {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 5px;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--color-text-2);
  cursor: pointer;
  font-size: 12px;
  text-align: left;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  em {
    min-width: 22px;
    padding: 0 5px;
    border-radius: 0;
    background: transparent;
    color: var(--color-text-3);
    font-size: 11px;
    font-style: normal;
    text-align: center;
  }

  &.active,
  &:hover {
    border-color: rgb(var(--primary-5));
    background: rgb(var(--primary-1));
    color: rgb(var(--primary-6));
  }
}

.file-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.file-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 58px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border-2);
  background: #fff;
}

.toolbar-title {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;

  strong {
    overflow: hidden;
    color: var(--color-text-1);
    font-size: 15px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    flex: 0 0 auto;
    color: var(--color-text-3);
    font-size: 12px;
  }
}

.file-spin {
  min-height: 0;
  display: block;
  flex: 1;
}

.file-spin :deep(.arco-spin-children) {
  height: 100%;
  min-height: 0;
}

.file-stream {
  height: 100%;
  padding: 8px 8px 10px;
  overflow-y: auto;
  overflow-x: hidden;
}

.file-section {
  padding-top: 0;
  margin-bottom: 10px;
  scroll-margin-top: 8px;
}

.file-table {
  border: 1px solid var(--color-border-2);
  border-radius: 0;
  overflow: hidden;
}

.file-table :deep(.arco-table-th) {
  font-size: 12px;
}

.file-table :deep(.arco-table-cell) {
  padding: 7px 8px;
  font-size: 12px;
  line-height: 1.42;
}

.file-name-cell {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.file-title-line {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;

  strong {
    min-width: 0;
    overflow: hidden;
    color: var(--color-text-1);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.file-remark {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--color-text-3);
  font-size: 11px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-heat {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--color-text-3);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;

  svg {
    width: 13px;
    height: 13px;
  }
}

.file-actions {
  white-space: nowrap;
}

.file-actions :deep(.arco-btn-size-mini) {
  padding: 0 3px;
  font-size: 11px;
}

.section-empty {
  padding: 20px 0;
  border: 1px dashed var(--color-border-2);
  border-radius: 0;
  background: var(--color-fill-1);
}

.revision-form {
  display: grid;
  gap: 14px;

  div,
  .file-picker {
    display: grid;
    gap: 6px;
  }

  span {
    color: var(--color-text-3);
    font-size: 12px;
  }

  strong {
    color: var(--color-text-1);
  }

  p {
    margin: 0;
    color: var(--color-text-2);
    font-size: 13px;
  }
}

.file-picker input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--color-border-2);
  border-radius: 0;
}

.preview-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  color: var(--color-text-3);
  font-size: 12px;
}

.image-preview {
  width: 100%;
  max-height: 68vh;
  object-fit: contain;
  border: 1px solid var(--color-border-2);
  border-radius: 0;
  background: var(--color-fill-1);
}

.pdf-preview {
  width: 100%;
  height: 70vh;
  border: 1px solid var(--color-border-2);
  border-radius: 0;
  background: #fff;
}

.office-preview {
  max-height: 70vh;
  padding: 18px;
  border: 1px solid var(--color-border-2);
  border-radius: 0;
  background: #fff;
  overflow: auto;
}

.text-preview {
  max-height: 70vh;
  padding: 18px;
  border: 1px solid var(--color-border-2);
  border-radius: 0;
  background: #fff;
  overflow: auto;
  white-space: pre-wrap;
}

.office-preview :deep(.attachment-preview) {
  color: #1d2129;
  line-height: 1.7;

  h2 {
    margin: 0 0 16px;
    font-size: 20px;
  }

  h3 {
    margin: 12px 0 8px;
    font-size: 16px;
  }

  p {
    margin: 0 0 10px;
  }
}

.office-preview :deep(.preview-slide),
.office-preview :deep(.preview-sheet) {
  margin-bottom: 16px;
  padding: 14px;
  border: 1px solid #e5e6eb;
  border-radius: 0;
}

.office-preview :deep(.preview-table-wrap) {
  overflow-x: auto;
}

.office-preview :deep(table) {
  width: 100%;
  border-collapse: collapse;
}

.office-preview :deep(td) {
  min-width: 110px;
  padding: 8px 10px;
  border: 1px solid #e5e6eb;
  font-size: 13px;
}

@media (max-width: 980px) {
  .knowledge-page {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(104px, 172px) minmax(0, 1fr);
  }

  .category-sidebar,
  .file-panel {
    height: 100%;
    position: static;
  }

  .category-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .file-toolbar {
    align-items: flex-start;
  }
}
</style>
