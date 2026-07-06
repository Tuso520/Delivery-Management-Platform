<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Message, Modal } from '@arco-design/web-vue'
import type { TableColumnData } from '@arco-design/web-vue'
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
const keyword = ref('')

const previewVisible = ref(false)
const previewLoading = ref(false)
const preview = ref<PreviewState>()

const revisionVisible = ref(false)
const revisionSubmitting = ref(false)
const revisionTarget = ref<KnowledgeFileRow>()
const replacementFiles = ref<File[]>([])

const fileColumns: TableColumnData[] = [
  { title: '主要内容', dataIndex: 'originalName', slotName: 'file', minWidth: 380 },
  { title: '类型', dataIndex: 'fileExt', slotName: 'type', width: 90 },
  { title: '大小', dataIndex: 'fileSize', slotName: 'size', width: 110 },
  { title: '更新时间', dataIndex: 'createdAt', slotName: 'updatedAt', width: 170 },
  { title: '操作', slotName: 'actions', width: 300, fixed: 'right' },
]

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
  const query = keyword.value.trim().toLowerCase()

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

    const files = query
      ? allFiles.filter((file) =>
          [
            file.originalName,
            file.topic,
            file.articleTitle,
            file.categoryName,
            file.fileExt,
          ].some((value) => String(value || '').toLowerCase().includes(query)),
        )
      : allFiles

    return {
      category,
      files,
      totalFileCount: allFiles.length,
    }
  })
})

const totalFileCount = computed(() =>
  categorySections.value.reduce((total, section) => total + section.totalFileCount, 0),
)

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
  } finally {
    loading.value = false
  }
}

async function scrollToCategory(categoryId: string): Promise<void> {
  activeCategoryId.value = categoryId
  await nextTick()
  document.getElementById(`knowledge-${categoryId}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
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
  } finally {
    previewLoading.value = false
  }
}

async function downloadAttachment(file: KnowledgeFileRow | KnowledgeAttachment): Promise<void> {
  downloadBlob(await attachmentApi.getContent(file.id), file.originalName)
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
          <p>{{ rootCategories.length }} 个一级分类 · {{ totalFileCount }} 个文件</p>
        </div>
        <a-button size="small" type="text" @click="fetchArticles">刷新</a-button>
      </div>

      <a-input
        v-model="keyword"
        allow-clear
        placeholder="搜索文件、岗位或模板"
        class="knowledge-search"
      />

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
        <div>
          <h2>{{ activeSection?.category.name || '知识库' }}</h2>
        </div>
        <a-space>
          <a-button @click="goApprovalTasks">更新审批</a-button>
          <a-button type="primary" @click="router.push('/knowledge/articles/new')">
            新增资料
          </a-button>
        </a-space>
      </div>

      <a-spin :loading="loading" class="file-spin">
        <div class="file-stream">
          <section
            v-for="section in categorySections"
            :id="`knowledge-${section.category.id}`"
            :key="section.category.id"
            class="file-section"
          >
            <div class="section-heading">
              <div>
                <h3>{{ section.category.name }}</h3>
                <span>共 {{ section.totalFileCount }} 个文件</span>
              </div>
            </div>

            <a-table
              v-if="section.files.length"
              :columns="fileColumns"
              :data="section.files"
              :pagination="false"
              :bordered="{ cell: false }"
              row-key="id"
              class="file-table"
            >
              <template #file="{ record }">
                <div class="file-name-cell">
                  <strong>{{ record.originalName }}</strong>
                  <a-tag v-if="record.topic" size="small" color="arcoblue">
                    {{ record.topic }}
                  </a-tag>
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
                <a-space size="mini" wrap>
                  <a-button type="text" size="small" @click="previewAttachment(record)">
                    在线预览
                  </a-button>
                  <a-button type="text" size="small" @click="downloadAttachment(record)">
                    下载
                  </a-button>
                  <a-button type="text" size="small" @click="openRevision(record)">
                    编辑
                  </a-button>
                  <a-button
                    type="text"
                    size="small"
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
  min-height: calc(100vh - 112px);
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 18px;
}

.category-sidebar,
.file-panel {
  min-width: 0;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: var(--color-bg-2);
}

.category-sidebar {
  height: calc(100vh - 128px);
  display: flex;
  flex-direction: column;
  padding: 16px;
  position: sticky;
  top: 88px;
}

.category-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

  h2 {
    margin: 0;
    color: var(--color-text-1);
    font-size: 18px;
  }

  p {
    margin: 6px 0 0;
    color: var(--color-text-3);
    font-size: 12px;
  }
}

.knowledge-search {
  margin-bottom: 14px;
}

.category-list {
  display: grid;
  gap: 8px;
  overflow: auto;
}

.category-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-2);
  cursor: pointer;
  text-align: left;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  em {
    min-width: 28px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--color-fill-2);
    color: var(--color-text-3);
    font-size: 12px;
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
  height: calc(100vh - 128px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.file-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--color-border-2);

  h2 {
    margin: 0;
    color: var(--color-text-1);
    font-size: 20px;
  }

  p {
    margin: 6px 0 0;
    color: var(--color-text-3);
    font-size: 13px;
  }
}

.file-spin {
  min-height: 0;
  display: block;
  flex: 1;
}

.file-stream {
  height: 100%;
  padding: 0 20px 24px;
  overflow: auto;
}

.file-section {
  padding-top: 20px;
  scroll-margin-top: 12px;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;

  h3 {
    margin: 0;
    color: var(--color-text-1);
    font-size: 17px;
  }

  span {
    display: inline-block;
    margin-top: 4px;
    color: var(--color-text-3);
    font-size: 12px;
  }
}

.file-table {
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  overflow: hidden;
}

.file-name-cell {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;

  strong {
    min-width: 0;
    overflow: hidden;
    color: var(--color-text-1);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.section-empty {
  padding: 28px 0;
  border: 1px dashed var(--color-border-2);
  border-radius: 8px;
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
  border-radius: 6px;
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
  border-radius: 8px;
  background: var(--color-fill-1);
}

.pdf-preview {
  width: 100%;
  height: 70vh;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: #fff;
}

.office-preview {
  max-height: 70vh;
  padding: 18px;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: #fff;
  overflow: auto;
}

.text-preview {
  max-height: 70vh;
  padding: 18px;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
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
  border-radius: 8px;
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
  }

  .category-sidebar,
  .file-panel {
    height: auto;
    position: static;
  }

  .category-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-height: 240px;
  }

  .file-toolbar {
    flex-direction: column;
  }
}
</style>
