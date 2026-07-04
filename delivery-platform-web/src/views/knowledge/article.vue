<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message, Modal } from '@arco-design/web-vue'
import type { TableColumnData } from '@arco-design/web-vue'
import { MdEditor, MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { attachmentApi } from '@/api/attachment'
import type { Attachment, AttachmentPreview } from '@/api/attachment'
import { downloadBlob } from '@/utils/blob'
import { countryApi } from '@/api/country'
import { checklistApi } from '@/api/checklist'
import { knowledgeApi } from '@/api/knowledge'
import { dictionaryApi } from '@/api/platform'
import { roleApi } from '@/api/role'
import { templateApi } from '@/api/template'
import { workflowApi } from '@/api/workflow'
import type { ChecklistTemplate } from '@/types/checklist'
import type { Country } from '@/types/country'
import type { KnowledgeArticle, KnowledgeCategory } from '@/types/knowledge'
import type { DictionaryItem } from '@/types/platform'
import type { Role } from '@/types/role'
import type { DocumentTemplate } from '@/types/template'
import type { WorkflowDocument } from '@/types/workflow'

type PreviewState = AttachmentPreview & { objectUrl?: string }

const route = useRoute()
const router = useRouter()
const articleId = computed(() => String(route.params.id ?? ''))
const isNew = computed(() => !articleId.value)
const editing = ref(isNew.value || route.query.edit === '1')
const loading = ref(false)
const previewVisible = ref(false)
const previewLoading = ref(false)
const preview = ref<PreviewState>()
const article = ref<KnowledgeArticle>()
const categories = ref<KnowledgeCategory[]>([])
const countries = ref<Country[]>([])
const projectTypes = ref<DictionaryItem[]>([])
const stages = ref<DictionaryItem[]>([])
const roles = ref<Role[]>([])
const attachments = ref<Attachment[]>([])
const workflows = ref<WorkflowDocument[]>([])
const checklistTemplates = ref<ChecklistTemplate[]>([])
const documentTemplates = ref<DocumentTemplate[]>([])
const pendingFiles = ref<File[]>([])
const form = ref({
  categoryId: '',
  title: '',
  countryCode: '',
  projectType: '',
  stageCode: '',
  applicableRole: '',
  markdownContent: '',
  sourceStatus: 'Ready',
  needsRevision: false,
  contentType: 'article',
  relatedFlow: '',
  relatedChecklist: '',
  relatedTemplate: '',
})

const attachmentColumns: TableColumnData[] = [
  { title: '文件名', dataIndex: 'originalName', slotName: 'fileName', width: 320 },
  { title: '类型', dataIndex: 'fileExt', width: 90 },
  { title: '大小', dataIndex: 'fileSize', slotName: 'fileSize', width: 110 },
  { title: '上传人', dataIndex: 'uploader.realName', slotName: 'uploader', width: 120 },
  { title: '上传时间', dataIndex: 'createdAt', width: 180 },
  { title: '操作', slotName: 'actions', width: 220, fixed: 'right' },
]

const categoryOptions = computed(() => flattenCategories(categories.value))
const previewTitle = computed(() => preview.value?.title || preview.value?.fileName || '在线预览')

function flattenCategories(nodes: KnowledgeCategory[], prefix = ''): Array<{ id: string; label: string }> {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${prefix}${node.name}` },
    ...flattenCategories(node.children || [], `${prefix}${node.name} / `),
  ])
}

function formatFileSize(value: string | number): string {
  const size = Number(value)
  if (!Number.isFinite(size)) return '-'
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
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
  const [
    categoryTree,
    countryPage,
    projectTypeDictionary,
    stageDictionary,
    roleList,
    workflowPage,
    checklistPage,
    templatePage,
  ] = await Promise.all([
    knowledgeApi.getCategories(),
    countryApi.getList({ page: 1, pageSize: 100 }),
    dictionaryApi.getByCode('project_type'),
    dictionaryApi.getByCode('project_stage'),
    roleApi.getList(),
    workflowApi.getDocuments({ page: 1, pageSize: 200, status: 'Active' }),
    checklistApi.getTemplates({ page: 1, pageSize: 200, status: 'Active' }),
    templateApi.getList({ page: 1, pageSize: 200, status: 'Published' }),
  ])
  categories.value = categoryTree
  countries.value = countryPage.list
  projectTypes.value = projectTypeDictionary.items
  stages.value = stageDictionary.items
  roles.value = roleList
  workflows.value = workflowPage.list
  checklistTemplates.value = checklistPage.list
  documentTemplates.value = templatePage.list
}

async function fetchArticle(): Promise<void> {
  if (isNew.value) return
  article.value = await knowledgeApi.getArticleById(articleId.value)
  const item = article.value
  form.value = {
    categoryId: item.categoryId,
    title: item.title,
    countryCode: item.countryCode ?? '',
    projectType: item.projectType ?? '',
    stageCode: item.stageCode ?? '',
    applicableRole: item.applicableRole ?? '',
    markdownContent: item.markdownContent ?? '',
    sourceStatus: item.sourceStatus,
    needsRevision: item.needsRevision,
    contentType: item.contentType,
    relatedFlow: item.relatedFlow ?? '',
    relatedChecklist: item.relatedChecklist ?? '',
    relatedTemplate: item.relatedTemplate ?? '',
  }
  await fetchAttachments()
}

async function fetchAttachments(): Promise<void> {
  if (isNew.value) return
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
  await attachmentApi.upload(data)
  pendingFiles.value = []
}

async function save(): Promise<void> {
  if (!form.value.categoryId || !form.value.title.trim()) {
    Message.warning('请选择分类并填写标题')
    return
  }
  loading.value = true
  try {
    if (isNew.value) {
      const created = await knowledgeApi.createArticle(form.value)
      await uploadPending(created.id)
      Message.success('知识条目已创建')
      await router.replace(`/knowledge/${created.id}?edit=1`)
      await fetchArticle()
    } else {
      await knowledgeApi.updateArticle(articleId.value, form.value)
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
  Message.success('已提交发布审核')
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
      const blob = await attachmentApi.getContent(item.id)
      preview.value = {
        ...metadata,
        objectUrl: URL.createObjectURL(blob),
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

watch(() => route.query.edit, (value) => {
  editing.value = isNew.value || value === '1'
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
        <p v-if="article">
          版本 {{ article.version }} / {{ article.status }} / {{ article.sourceStatus }}
        </p>
        <p v-else>使用 Markdown 和附件沉淀可复用的交付知识</p>
      </div>
      <a-space wrap>
        <a-button @click="router.push('/knowledge')">返回</a-button>
        <a-button v-if="!isNew && !editing" @click="editing = true">编辑</a-button>
        <a-button v-if="editing" type="primary" @click="save">保存</a-button>
        <a-button
          v-if="!isNew && article && !['Published', 'Reviewing'].includes(article.status)"
          status="success"
          @click="publish"
        >
          提交发布
        </a-button>
      </a-space>
    </div>

    <template v-if="editing">
      <a-form :model="form" layout="vertical" class="knowledge-form">
        <div class="form-grid">
          <a-form-item label="知识分类" required>
            <a-select v-model="form.categoryId" allow-search>
              <a-option
                v-for="item in categoryOptions"
                :key="item.id"
                :value="item.id"
              >
                {{ item.label }}
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="知识标题" required>
            <a-input v-model="form.title" :max-length="200" show-word-limit />
          </a-form-item>
          <a-form-item label="适用国家">
            <a-select v-model="form.countryCode" allow-clear allow-search>
              <a-option
                v-for="item in countries"
                :key="item.id"
                :value="item.countryCode"
              >
                {{ item.nameZh }}
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="项目类型">
            <a-select v-model="form.projectType" allow-clear>
              <a-option
                v-for="item in projectTypes"
                :key="item.id"
                :value="item.itemValue"
              >
                {{ item.itemLabel }}
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="交付阶段">
            <a-select v-model="form.stageCode" allow-clear>
              <a-option
                v-for="item in stages"
                :key="item.id"
                :value="item.itemValue"
              >
                {{ item.itemLabel }}
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="适用角色">
            <a-select v-model="form.applicableRole" allow-clear allow-search>
              <a-option
                v-for="item in roles"
                :key="item.id"
                :value="item.roleCode"
              >
                {{ item.roleName }}
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="关联交付流程">
            <a-select v-model="form.relatedFlow" allow-clear allow-search>
              <a-option
                v-for="item in workflows"
                :key="item.id"
                :value="item.id"
              >
                {{ item.name }}
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="关联检查模板">
            <a-select v-model="form.relatedChecklist" allow-clear allow-search>
              <a-option
                v-for="item in checklistTemplates"
                :key="item.id"
                :value="item.id"
              >
                {{ item.templateName }}
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="关联文档模板">
            <a-select v-model="form.relatedTemplate" allow-clear allow-search>
              <a-option
                v-for="item in documentTemplates"
                :key="item.id"
                :value="item.id"
              >
                {{ item.name }}
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="原始资料">
            <a-radio-group v-model="form.sourceStatus" type="button">
              <a-radio value="Ready">资料齐全</a-radio>
              <a-radio value="PendingUpload">待上传</a-radio>
            </a-radio-group>
          </a-form-item>
          <a-form-item label="修订标记">
            <a-switch v-model="form.needsRevision">
              <template #checked>需要</template>
              <template #unchecked>不需要</template>
            </a-switch>
          </a-form-item>
        </div>
        <a-form-item label="Markdown 正文">
          <MdEditor v-model="form.markdownContent" language="zh-CN" :preview="true" />
        </a-form-item>
        <a-form-item label="资料附件">
          <div class="file-picker">
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.md,.txt"
              @change="selectFiles"
            />
            <span v-if="pendingFiles.length" class="file-note">
              已选择 {{ pendingFiles.length }} 个文件
            </span>
          </div>
        </a-form-item>
      </a-form>
    </template>

    <template v-else-if="article">
      <div class="article-meta">
        <a-tag v-if="article.countryCode">{{ article.countryCode }}</a-tag>
        <a-tag v-if="article.projectType" color="green">{{ article.projectType }}</a-tag>
        <a-tag v-if="article.stageCode" color="orange">{{ article.stageCode }}</a-tag>
        <a-tag v-if="article.needsRevision" color="red">待修订</a-tag>
        <a-tag v-if="article.relatedFlow" color="arcoblue">已关联流程</a-tag>
        <a-tag v-if="article.relatedChecklist" color="arcoblue">已关联检查模板</a-tag>
        <a-tag v-if="article.relatedTemplate" color="arcoblue">已关联文档模板</a-tag>
      </div>
      <div class="markdown-panel">
        <MdPreview :model-value="article.markdownContent || '暂无 Markdown 正文'" language="zh-CN" />
      </div>
      <div class="version-list">
        <h3>版本记录</h3>
        <a-timeline>
          <a-timeline-item
            v-for="version in article.versions"
            :key="version.id"
            :label="version.createdAt"
          >
            {{ version.version }} / {{ version.changeNotes || '版本快照' }} / {{ version.creator.realName }}
          </a-timeline-item>
        </a-timeline>
      </div>
    </template>

    <div v-if="!isNew" class="attachment-section">
      <div class="section-heading">
        <h3>附件</h3>
        <span>支持 doc/docx、xls/xlsx、ppt/pptx、pdf、图片和文本在线查阅</span>
      </div>
      <a-table
        :columns="attachmentColumns"
        :data="attachments"
        :pagination="false"
        :bordered="{ cell: true }"
        row-key="id"
      >
        <template #fileName="{ record }">
          <span class="file-name">{{ record.originalName }}</span>
        </template>
        <template #fileSize="{ record }">
          {{ formatFileSize(record.fileSize) }}
        </template>
        <template #uploader="{ record }">
          {{ record.uploader?.realName || '-' }}
        </template>
        <template #actions="{ record }">
          <a-space size="mini">
            <a-button type="text" @click="previewAttachment(record)">在线预览</a-button>
            <a-button type="text" @click="downloadAttachment(record)">下载</a-button>
            <a-button
              v-if="editing"
              type="text"
              status="danger"
              @click="deleteAttachment(record)"
            >
              删除
            </a-button>
          </a-space>
        </template>
      </a-table>
    </div>

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
  min-width: 0;
}

.page-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
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

.knowledge-form,
.markdown-panel,
.attachment-section,
.version-list {
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: var(--color-bg-2);
}

.knowledge-form {
  padding: 18px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 18px;
}

.file-picker {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.file-note {
  color: var(--color-text-3);
  font-size: 12px;
}

.article-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.markdown-panel {
  padding: 14px 18px;
}

.attachment-section,
.version-list {
  margin-top: 24px;
  padding: 18px;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;

  h3 {
    margin: 0;
    color: var(--color-text-1);
    font-size: 16px;
  }

  span {
    color: var(--color-text-3);
    font-size: 12px;
  }
}

.version-list h3 {
  margin: 0 0 14px;
  font-size: 16px;
}

.file-name {
  color: var(--color-text-1);
  font-weight: 520;
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

@media (max-width: 760px) {
  .page-toolbar,
  .section-heading {
    flex-direction: column;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
