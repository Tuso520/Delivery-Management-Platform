<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message, Modal } from '@arco-design/web-vue'
import type { TableColumnData } from '@arco-design/web-vue'
import { MdEditor, MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { attachmentApi } from '@/api/attachment'
import type { Attachment, AttachmentPreview } from '@/api/attachment'
import { knowledgeApi } from '@/api/knowledge'
import type { KnowledgeArticle, KnowledgeCategory } from '@/types/knowledge'
import { downloadBlob } from '@/utils/blob'

type PreviewState = AttachmentPreview & { objectUrl?: string }

const route = useRoute()
const router = useRouter()
const articleId = computed(() => String(route.params.id ?? ''))
const isNew = computed(() => !articleId.value || articleId.value === 'new')
const editing = ref(isNew.value || route.query.edit === '1')
const loading = ref(false)
const previewVisible = ref(false)
const previewLoading = ref(false)
const preview = ref<PreviewState>()
const article = ref<KnowledgeArticle>()
const categories = ref<KnowledgeCategory[]>([])
const attachments = ref<Attachment[]>([])
const pendingFiles = ref<File[]>([])

const form = ref({
  categoryId: '',
  title: '',
  markdownContent: '',
  contentType: 'article',
  attachmentRemark: '',
})

const attachmentColumns: TableColumnData[] = [
  { title: '文件名', dataIndex: 'originalName', slotName: 'fileName', minWidth: 320 },
  { title: '类型', dataIndex: 'fileExt', width: 90 },
  { title: '大小', dataIndex: 'fileSize', slotName: 'fileSize', width: 110 },
  { title: '上传人', dataIndex: 'uploader.realName', slotName: 'uploader', width: 120 },
  { title: '上传时间', dataIndex: 'createdAt', slotName: 'createdAt', width: 170 },
  { title: '操作', slotName: 'actions', width: 230, fixed: 'right' },
]

const categoryOptions = computed(() =>
  categories.value.filter((category) => !category.parentId),
)

const previewTitle = computed(() => preview.value?.title || preview.value?.fileName || '在线预览')

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

async function fetchOptions(): Promise<void> {
  categories.value = await knowledgeApi.getCategories()
}

async function fetchArticle(): Promise<void> {
  if (isNew.value) {
    article.value = undefined
    attachments.value = []
    return
  }

  article.value = await knowledgeApi.getArticleById(articleId.value)
  const item = article.value
  form.value = {
    categoryId: item.categoryId,
    title: item.title,
    markdownContent: item.markdownContent ?? '',
    contentType: item.contentType || 'article',
    attachmentRemark: '',
  }
  await fetchAttachments()
}

async function fetchAttachments(): Promise<void> {
  if (isNew.value) {
    attachments.value = []
    return
  }

  const result = await attachmentApi.getList({
    ownerType: 'KnowledgeArticle',
    ownerId: articleId.value,
    page: 1,
    pageSize: 100,
  })
  attachments.value = result.list
}

function selectFiles(event: Event): void {
  pendingFiles.value = Array.from((event.target as HTMLInputElement).files ?? [])
}

async function uploadPending(ownerId: string): Promise<void> {
  if (!pendingFiles.value.length) return
  const data = new FormData()
  pendingFiles.value.forEach((file) => data.append('files', file))
  data.append('ownerType', 'KnowledgeArticle')
  data.append('ownerId', ownerId)
  data.append('category', 'document')
  if (form.value.attachmentRemark.trim()) {
    data.append('remark', form.value.attachmentRemark.trim())
  }
  await attachmentApi.upload(data)
  pendingFiles.value = []
  form.value.attachmentRemark = ''
}

async function save(): Promise<void> {
  if (!form.value.categoryId || !form.value.title.trim()) {
    Message.warning('请选择一级分类并填写标题')
    return
  }

  loading.value = true
  try {
    const payload = {
      categoryId: form.value.categoryId,
      title: form.value.title.trim(),
      markdownContent: form.value.markdownContent,
      contentType: form.value.contentType,
    }

    if (isNew.value) {
      const created = await knowledgeApi.createArticle(payload)
      await uploadPending(created.id)
      Message.success('知识条目已创建')
      await router.replace(`/knowledge/${created.id}?edit=1`)
      await fetchArticle()
    } else {
      await knowledgeApi.updateArticle(articleId.value, payload)
      await uploadPending(articleId.value)
      Message.success('知识条目已更新')
      await fetchArticle()
    }
  } finally {
    loading.value = false
  }
}

async function publish(): Promise<void> {
  await knowledgeApi.publishArticle(articleId.value)
  Message.success('已提交发布审批')
  editing.value = false
  await fetchArticle()
}

async function previewAttachment(item: Attachment): Promise<void> {
  releasePreviewObjectUrl()
  previewVisible.value = true
  previewLoading.value = true
  preview.value = {
    fileName: item.originalName,
    fileExt: item.fileExt,
    mimeType: item.mimeType,
    previewKind: 'unsupported',
    viewer: 'download',
    title: item.originalName,
  }

  try {
    const metadata = await attachmentApi.getPreview(item.id)
    if (metadata.previewKind === 'image' || metadata.previewKind === 'pdf') {
      preview.value = {
        ...metadata,
        objectUrl: URL.createObjectURL(await attachmentApi.getContent(item.id)),
      }
    } else {
      preview.value = metadata
    }
  } finally {
    previewLoading.value = false
  }
}

async function downloadAttachment(item: Attachment): Promise<void> {
  downloadBlob(await attachmentApi.getContent(item.id), item.originalName)
}

function deleteAttachment(item: Attachment): void {
  Modal.warning({
    title: '删除附件',
    content: `确认删除“${item.originalName}”？`,
    okText: '删除',
    cancelText: '取消',
    hideCancel: false,
    async onOk() {
      await attachmentApi.delete(item.id)
      Message.success('附件已删除')
      await fetchAttachments()
    },
  })
}

function releasePreviewObjectUrl(): void {
  if (preview.value?.objectUrl) {
    URL.revokeObjectURL(preview.value.objectUrl)
  }
}

function resetArticleState(): void {
  releasePreviewObjectUrl()
  article.value = undefined
  attachments.value = []
  previewVisible.value = false
  previewLoading.value = false
  preview.value = undefined
  pendingFiles.value = []
}

watch(() => route.query.edit, (value) => {
  editing.value = isNew.value || value === '1'
})

watch(articleId, async () => {
  resetArticleState()
  editing.value = isNew.value || route.query.edit === '1'
  loading.value = true
  try {
    await fetchArticle()
  } finally {
    loading.value = false
  }
})

watch(previewVisible, (visible) => {
  if (!visible) releasePreviewObjectUrl()
})

onMounted(async () => {
  loading.value = true
  try {
    await fetchOptions()
    await fetchArticle()
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  releasePreviewObjectUrl()
})
</script>

<template>
  <a-spin :loading="loading" class="article-page">
    <div class="page-toolbar">
      <div>
        <h2>{{ isNew ? '创建知识条目' : article?.title }}</h2>
        <p>知识库只按岗位一级分类归档，流程或模板属性写入标题或文件名称。</p>
      </div>
      <a-space>
        <a-button @click="router.push('/knowledge')">返回知识库</a-button>
        <a-button v-if="!editing && !isNew" @click="editing = true">编辑</a-button>
        <a-button v-if="editing" type="primary" @click="save">保存</a-button>
        <a-button v-if="!isNew && !editing" type="primary" @click="publish">提交发布</a-button>
      </a-space>
    </div>

    <a-card v-if="editing" class="article-card">
      <a-form :model="form" layout="vertical">
        <a-form-item label="一级分类" required>
          <a-select v-model="form.categoryId" placeholder="选择一级分类">
            <a-option
              v-for="category in categoryOptions"
              :key="category.id"
              :value="category.id"
            >
              {{ category.name }}
            </a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="标题" required>
          <a-input v-model="form.title" placeholder="例如 项目经理 - 岗位职责" />
        </a-form-item>
        <a-form-item label="正文">
          <MdEditor v-model="form.markdownContent" language="zh-CN" />
        </a-form-item>
        <a-form-item label="附件">
          <label class="file-picker">
            <input
              type="file"
              multiple
              accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
              @change="selectFiles"
            />
          </label>
          <a-textarea
            v-model="form.attachmentRemark"
            :auto-size="{ minRows: 2, maxRows: 4 }"
            placeholder="填写文件简介或备注，保存后会显示在知识库文件列表中"
          />
          <p v-if="pendingFiles.length" class="pending-files">
            已选择 {{ pendingFiles.length }} 个待上传文件
          </p>
        </a-form-item>
      </a-form>
    </a-card>

    <a-card v-else class="article-card">
      <MdPreview :model-value="article?.markdownContent || '暂无正文内容。'" />
    </a-card>

    <a-card class="article-card">
      <template #title>附件</template>
      <a-table
        :columns="attachmentColumns"
        :data="attachments"
        :pagination="false"
        row-key="id"
      >
        <template #fileName="{ record }">
          <div class="attachment-name-cell">
            <strong>{{ record.originalName }}</strong>
            <p v-if="record.remark">{{ record.remark }}</p>
          </div>
        </template>
        <template #fileSize="{ record }">
          {{ formatFileSize(record.fileSize) }}
        </template>
        <template #uploader="{ record }">
          {{ record.uploader?.realName || '-' }}
        </template>
        <template #createdAt="{ record }">
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
            <a-button
              v-if="editing"
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
    </a-card>

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
  </a-spin>
</template>

<style scoped lang="scss">
.article-page {
  display: block;
}

.page-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;

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

.article-card {
  margin-bottom: 16px;
  border-radius: 8px;
}

.file-picker input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--color-border-2);
  border-radius: 6px;
}

.pending-files {
  margin: 8px 0 0;
  color: var(--color-text-3);
  font-size: 12px;
}

.attachment-name-cell {
  min-width: 0;
  display: grid;
  gap: 3px;

  strong {
    min-width: 0;
    overflow: hidden;
    color: var(--color-text-1);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    margin: 0;
    overflow: hidden;
    color: var(--color-text-3);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
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

@media (max-width: 900px) {
  .page-toolbar {
    flex-direction: column;
  }
}
</style>
