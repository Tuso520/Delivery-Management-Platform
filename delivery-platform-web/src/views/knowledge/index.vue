<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import type { TableColumnData } from '@arco-design/web-vue'
import { IconDownload, IconEye } from '@arco-design/web-vue/es/icon'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { attachmentApi } from '@/api/attachment'
import { knowledgeApi } from '@/api/knowledge'
import { approvalApi } from '@/api/platform'
import AttachmentPreviewModal from '@/components/AttachmentPreviewModal/index.vue'
import AttachmentPreviewPane from '@/components/AttachmentPreviewPane/index.vue'
import type {
  KnowledgeArticle,
  KnowledgeAttachment,
  KnowledgeCategory,
  KnowledgeFileRevisionDiff,
  QueryKnowledgeArticleDto,
} from '@/types/knowledge'
import type { ApprovalTask } from '@/types/platform'
import { downloadBlob } from '@/utils/blob'
import { arcoPrompt } from '@/utils/arco-dialog'

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

const loading = ref(false)
const categories = ref<KnowledgeCategory[]>([])
const articles = ref<KnowledgeArticle[]>([])
const activeCategoryId = ref('')
const fileStreamRef = ref<HTMLElement>()
const previewVisible = ref(false)
const previewTarget = ref<KnowledgeFileRow | KnowledgeAttachment>()

const revisionVisible = ref(false)
const revisionSubmitting = ref(false)
const revisionTarget = ref<KnowledgeFileRow>()
const replacementFiles = ref<File[]>([])

const approvalVisible = ref(false)
const approvalLoading = ref(false)
const approvalTasks = ref<ApprovalTask[]>([])
const diffVisible = ref(false)
const diffLoading = ref(false)
const currentDiff = ref<KnowledgeFileRevisionDiff>()

const createVisible = ref(false)
const createSubmitting = ref(false)
const createMode = ref<'markdown' | 'upload'>('markdown')
const createFiles = ref<File[]>([])
const createForm = ref({
  categoryId: '',
  title: '',
  markdownContent: '',
  remark: '',
  replaceExisting: false,
  replaceAttachmentId: '',
})

function fileColumnsFor(categoryName: string): TableColumnData[] {
  return [
    { title: categoryName, dataIndex: 'originalName', slotName: 'file', minWidth: 520 },
    { title: '类型', dataIndex: 'fileExt', slotName: 'type', width: 64 },
    { title: '大小', dataIndex: 'fileSize', slotName: 'size', width: 78 },
    { title: '更新时间', dataIndex: 'createdAt', slotName: 'updatedAt', width: 132 },
    { title: '操作', slotName: 'actions', width: 224, fixed: 'right' },
  ]
}

const approvalColumns: TableColumnData[] = [
  { title: '审批事项', dataIndex: 'businessTitle', minWidth: 260 },
  { title: '类型', dataIndex: 'businessType', slotName: 'businessType', width: 126 },
  { title: '申请人', slotName: 'applicant', width: 96 },
  { title: '审批人', slotName: 'approver', width: 96 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 92 },
  { title: '创建时间', dataIndex: 'createdAt', slotName: 'createdAt', width: 150 },
  { title: '操作', slotName: 'actions', width: 190, fixed: 'right' },
]

const NEW_FILE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const HOT_FILE_THRESHOLD = 20

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
      const articleCategoryId = article.categoryId || article.category?.id
      if (!articleCategoryId) return []
      const rootId = categoryRootLookup.value.get(articleCategoryId) || articleCategoryId
      if (rootId !== category.id) return []

      return (article.files || []).map((file) => ({
        ...file,
        articleId: article.id,
        articleTitle: article.title,
        categoryId: articleCategoryId,
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

const totalFileCount = computed(() =>
  categorySections.value.reduce((total, section) => total + section.files.length, 0),
)

const replaceTargetOptions = computed(() => {
  const selectedRootId = createForm.value.categoryId || activeCategoryId.value
  return categorySections.value
    .filter((section) => !selectedRootId || section.category.id === selectedRootId)
    .flatMap((section) => section.files)
})

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

function incrementFileHeat(fileId: string, key: 'previewCount' | 'downloadCount'): void {
  for (const article of articles.value) {
    const target = article.files?.find((file) => file.id === fileId)
    if (target) {
      target[key] = (target[key] || 0) + 1
      return
    }
  }
}

function isNewFile(file: KnowledgeFileRow | KnowledgeAttachment): boolean {
  const createdAt = new Date(file.createdAt).getTime()
  return Number.isFinite(createdAt) && Date.now() - createdAt <= NEW_FILE_WINDOW_MS
}

function isHotFile(file: KnowledgeFileRow | KnowledgeAttachment): boolean {
  return (file.previewCount || 0) + (file.downloadCount || 0) >= HOT_FILE_THRESHOLD
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

function openAttachmentPreview(file: KnowledgeFileRow | KnowledgeAttachment): void {
  previewTarget.value = file
  previewVisible.value = true
  incrementFileHeat(file.id, 'previewCount')
}

function resetCreateForm(): void {
  createMode.value = 'markdown'
  createFiles.value = []
  createForm.value = {
    categoryId: activeCategoryId.value || rootCategories.value[0]?.id || '',
    title: '',
    markdownContent: '',
    remark: '',
    replaceExisting: false,
    replaceAttachmentId: '',
  }
}

function openCreateKnowledge(): void {
  resetCreateForm()
  createVisible.value = true
}

function selectCreateFiles(event: Event): void {
  createFiles.value = Array.from((event.target as HTMLInputElement).files ?? [])
  const firstFile = createFiles.value[0]
  if (firstFile && !createForm.value.title.trim()) {
    createForm.value.title = firstFile.name
  }
}

function safeFileName(value: string): string {
  const clean = value.trim().replace(/[\\/:*?"<>|]/g, '-')
  return clean || `knowledge-${Date.now()}`
}

function markdownFile(title: string, content: string): File {
  return new File([content || `# ${title}\n`], `${safeFileName(title)}.md`, {
    type: 'text/markdown;charset=utf-8',
  })
}

async function submitCreateKnowledge(): Promise<void> {
  const categoryId = createForm.value.categoryId
  const title = createForm.value.title.trim()
  if (!categoryId || (!title && !createForm.value.replaceExisting)) {
    Message.warning('请填写分类和标题')
    return
  }
  if (createMode.value === 'upload' && createFiles.value.length === 0) {
    Message.warning('请先选择上传文件')
    return
  }

  createSubmitting.value = true
  try {
    const uploadFiles =
      createMode.value === 'markdown'
        ? [markdownFile(title || '知识库更新文件', createForm.value.markdownContent)]
        : createFiles.value

    if (createForm.value.replaceExisting) {
      const target = replaceTargetOptions.value.find(
        (file) => file.id === createForm.value.replaceAttachmentId,
      )
      if (!target) {
        Message.warning('请选择需要替换的在线文件')
        return
      }
      if (uploadFiles.length !== 1) {
        Message.warning('替换已有文件时一次只能提交一个新文件')
        return
      }
      const data = new FormData()
      data.append('files', uploadFiles[0])
      await knowledgeApi.submitFileRevision(target.articleId, target.id, data)
      Message.success('文件替换申请已提交审批')
      createVisible.value = false
      await fetchArticles()
      await fetchApprovalTasks()
      return
    }

    const article = await knowledgeApi.createArticle({
      categoryId,
      title,
      contentType: createMode.value === 'upload' ? 'file' : 'article',
      markdownContent: createForm.value.markdownContent || `# ${title}\n`,
      sourceStatus: 'Ready',
    })
    const data = new FormData()
    uploadFiles.forEach((file) => data.append('files', file))
    data.append('ownerType', 'KnowledgeArticle')
    data.append('ownerId', article.id)
    data.append('category', 'knowledge')
    if (createForm.value.remark.trim()) {
      data.append('remark', createForm.value.remark.trim())
    }
    await attachmentApi.upload(data)
    try {
      await knowledgeApi.publishArticle(article.id)
    } catch {
      // Publishing permission is optional for this quick-create path.
    }
    Message.success('知识资料已新增')
    createVisible.value = false
    await fetchArticles()
  } finally {
    createSubmitting.value = false
  }
}

function approvalBusinessLabel(type: string): string {
  const map: Record<string, string> = {
    knowledge: '知识发布',
    'knowledge-file-update': '文件更新',
  }
  return map[type] || type
}

function approvalStatusLabel(status: string): string {
  const map: Record<string, string> = {
    Pending: '待审批',
    Approved: '已通过',
    Rejected: '已驳回',
    Cancelled: '已取消',
  }
  return map[status] || status
}

function approvalStatusColor(status: string): string {
  const map: Record<string, string> = {
    Pending: 'orange',
    Approved: 'green',
    Rejected: 'red',
    Cancelled: 'gray',
  }
  return map[status] || 'blue'
}

async function fetchApprovalTasks(): Promise<void> {
  approvalLoading.value = true
  try {
    const page = await approvalApi.getTasks({
      page: 1,
      pageSize: 100,
      businessType: 'knowledge,knowledge-file-update',
    })
    approvalTasks.value = page.list.filter((task) =>
      ['knowledge', 'knowledge-file-update'].includes(task.businessType),
    )
  } finally {
    approvalLoading.value = false
  }
}

async function openApprovalTasks(): Promise<void> {
  approvalVisible.value = true
  await fetchApprovalTasks()
}

async function decideApproval(task: ApprovalTask, decision: 'Approved' | 'Rejected'): Promise<void> {
  try {
    const result = await arcoPrompt(
      decision === 'Approved' ? '可填写审批意见' : '请填写驳回原因',
      decision === 'Approved' ? '审批通过' : '驳回审批',
      {
        inputType: 'textarea',
        inputValidator: (value) =>
          decision === 'Rejected' && !value.trim() ? '驳回时必须填写原因' : true,
      },
    )
    await approvalApi.decide(task.id, {
      decision,
      comment: result.value.trim() || undefined,
    })
    Message.success(decision === 'Approved' ? '审批已通过' : '审批已驳回')
    await Promise.all([fetchApprovalTasks(), fetchArticles()])
    if (currentDiff.value?.incoming.id === task.businessId) {
      diffVisible.value = false
      currentDiff.value = undefined
    }
  } catch {
    // 用户取消审批。
  }
}

async function openRevisionDiff(task: ApprovalTask): Promise<void> {
  if (task.businessType !== 'knowledge-file-update') {
    Message.info('当前审批事项没有文件差异对比')
    return
  }

  diffVisible.value = true
  diffLoading.value = true
  currentDiff.value = undefined
  try {
    currentDiff.value = await knowledgeApi.getFileRevisionDiff(task.businessId)
  } finally {
    diffLoading.value = false
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

onMounted(async () => {
  await Promise.all([fetchCategories(), fetchArticles()])
  await nextTick()
  updateActiveCategoryByScroll()
})
</script>

<template>
  <section class="knowledge-page">
    <aside class="category-sidebar">
      <div class="category-header">
        <div>
          <h2>知识分类</h2>
        </div>
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
          <a-button size="small" @click="openApprovalTasks">更新审批</a-button>
          <a-button size="small" type="primary" @click="openCreateKnowledge">
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
                    <button
                      class="file-title-button"
                      type="button"
                      @click="openAttachmentPreview(record)"
                    >
                      {{ record.originalName }}
                    </button>
                    <span class="file-heat" title="在线预览热度">
                      <IconEye />
                      {{ record.previewCount || 0 }}
                    </span>
                    <span class="file-heat" title="下载热度">
                      <IconDownload />
                      {{ record.downloadCount || 0 }}
                    </span>
                    <span v-if="isNewFile(record)" class="file-badge file-badge-new">NEW</span>
                    <span v-if="isHotFile(record)" class="file-badge file-badge-hot">热门</span>
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
              v-else-if="!totalFileCount"
              description="暂无文件"
              class="section-empty"
            />
          </section>
        </div>
      </a-spin>
    </main>

    <a-modal
      v-model:visible="createVisible"
      title="新增知识资料"
      :width="900"
      :confirm-loading="createSubmitting"
      ok-text="保存"
      cancel-text="取消"
      @ok="submitCreateKnowledge"
    >
      <div class="quick-create-form">
        <a-form :model="createForm" layout="vertical">
          <a-grid :cols="2" :col-gap="12" :row-gap="12">
            <a-grid-item>
              <a-form-item label="知识分类" required>
                <a-select v-model="createForm.categoryId" placeholder="请选择分类">
                  <a-option
                    v-for="section in categorySections"
                    :key="section.category.id"
                    :value="section.category.id"
                  >
                    {{ section.category.name }}
                  </a-option>
                </a-select>
              </a-form-item>
            </a-grid-item>
            <a-grid-item>
              <a-form-item label="标题" required>
                <a-input v-model="createForm.title" placeholder="请输入资料标题" />
              </a-form-item>
            </a-grid-item>
          </a-grid>

          <a-form-item label="简介备注">
            <a-textarea
              v-model="createForm.remark"
              placeholder="用于列表展示的简短说明"
              :auto-size="{ minRows: 2, maxRows: 3 }"
            />
          </a-form-item>

          <a-form-item label="是否替换已有在线文件">
            <a-switch v-model="createForm.replaceExisting">
              <template #checked>替换</template>
              <template #unchecked>新增</template>
            </a-switch>
          </a-form-item>

          <a-form-item v-if="createForm.replaceExisting" label="选择替换目标" required>
            <a-select
              v-model="createForm.replaceAttachmentId"
              placeholder="请选择需要替换的在线文件"
              allow-search
            >
              <a-option
                v-for="file in replaceTargetOptions"
                :key="file.id"
                :value="file.id"
              >
                {{ file.categoryName }} / {{ file.originalName }}
              </a-option>
            </a-select>
          </a-form-item>
        </a-form>

        <div class="create-mode-bar">
          <a-radio-group v-model="createMode" type="button" size="small">
            <a-radio value="markdown">书写 Markdown</a-radio>
            <a-radio value="upload">上传文件</a-radio>
          </a-radio-group>
        </div>

        <MdEditor
          v-if="createMode === 'markdown'"
          v-model="createForm.markdownContent"
          language="zh-CN"
          class="quick-md-editor"
        />
        <label v-else class="file-picker upload-picker">
          <span>选择文件</span>
          <input
            type="file"
            multiple
            accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
            @change="selectCreateFiles"
          />
          <em v-if="createFiles.length">
            已选择 {{ createFiles.length }} 个文件
          </em>
        </label>
      </div>
    </a-modal>

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
      v-model:visible="approvalVisible"
      title="知识库审批任务"
      :width="1120"
      :footer="false"
    >
      <a-table
        :loading="approvalLoading"
        :columns="approvalColumns"
        :data="approvalTasks"
        :pagination="false"
        row-key="id"
        class="approval-table"
      >
        <template #businessType="{ record }">
          <a-tag size="small">{{ approvalBusinessLabel(record.businessType) }}</a-tag>
        </template>
        <template #applicant="{ record }">
          {{ record.applicant?.realName || '-' }}
        </template>
        <template #approver="{ record }">
          {{ record.approver?.realName || '-' }}
        </template>
        <template #status="{ record }">
          <a-tag :color="approvalStatusColor(record.status)" size="small">
            {{ approvalStatusLabel(record.status) }}
          </a-tag>
        </template>
        <template #createdAt="{ record }">
          {{ formatDate(record.createdAt) }}
        </template>
        <template #actions="{ record }">
          <a-space size="mini" :wrap="false" class="approval-actions">
            <a-button
              v-if="record.businessType === 'knowledge-file-update'"
              type="text"
              size="mini"
              @click="openRevisionDiff(record)"
            >
              差异
            </a-button>
            <template v-if="record.status === 'Pending'">
              <a-button type="text" size="mini" @click="decideApproval(record, 'Approved')">
                通过
              </a-button>
              <a-button
                type="text"
                status="danger"
                size="mini"
                @click="decideApproval(record, 'Rejected')"
              >
                驳回
              </a-button>
            </template>
          </a-space>
        </template>
      </a-table>
    </a-modal>

    <a-modal
      v-model:visible="diffVisible"
      title="文件差异对比"
      :width="'94vw'"
      :footer="false"
      class="diff-modal"
    >
      <a-spin :loading="diffLoading">
        <div v-if="currentDiff" class="diff-layout">
          <section>
            <header>
              <strong>当前线上文件</strong>
              <span>{{ currentDiff.original.originalName }}</span>
            </header>
            <AttachmentPreviewPane
              :attachment-id="currentDiff.original.id"
              height="64vh"
              compact
            />
          </section>
          <section>
            <header>
              <strong>待审批新文件</strong>
              <span>{{ currentDiff.incoming.originalName }}</span>
            </header>
            <AttachmentPreviewPane
              :attachment-id="currentDiff.incoming.id"
              height="64vh"
              compact
            />
          </section>
        </div>
        <a-empty v-else-if="!diffLoading" description="暂无可对比内容" />
      </a-spin>
    </a-modal>

    <AttachmentPreviewModal
      v-model:visible="previewVisible"
      source="attachment"
      :attachment-id="previewTarget?.id"
      :title="previewTarget?.originalName || '在线预览'"
    />

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
}

.file-title-button {
  min-width: 0;
  padding: 0;
  border: 0;
  overflow: hidden;
  color: rgb(var(--primary-6));
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    color: rgb(var(--primary-5));
    text-decoration: underline;
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

.file-badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 5px;
  border: 1px solid var(--color-border-2);
  color: var(--color-text-3);
  background: var(--color-fill-1);
  font-size: 10px;
  font-weight: 650;
  line-height: 1;
}

.file-badge-new {
  border-color: rgb(var(--primary-2));
  color: rgb(var(--primary-6));
  background: rgb(var(--primary-1));
}

.file-badge-hot {
  border-color: #f7c88a;
  color: #a86612;
  background: #fff7e8;
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

.quick-create-form {
  display: grid;
  gap: 12px;
}

.create-mode-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.quick-md-editor {
  height: 420px;
}

.upload-picker {
  min-height: 160px;
  align-content: center;
  padding: 18px;
  border: 1px dashed var(--color-border-3);
  background: var(--color-fill-1);

  em {
    color: var(--color-text-3);
    font-size: 12px;
    font-style: normal;
  }
}

.approval-table :deep(.arco-table-th),
.approval-table :deep(.arco-table-cell) {
  padding: 7px 8px;
  font-size: 12px;
  line-height: 1.42;
}

.approval-actions {
  white-space: nowrap;
}

.diff-modal :deep(.arco-modal-body) {
  padding-top: 10px;
}

.diff-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  section {
    min-width: 0;
    border: 1px solid var(--color-border-2);
    background: var(--color-bg-2);
  }

  header {
    min-height: 42px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--color-border-2);
  }

  strong {
    flex: 0 0 auto;
    color: var(--color-text-1);
    font-size: 13px;
  }

  span {
    min-width: 0;
    overflow: hidden;
    color: var(--color-text-2);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
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

  .diff-layout {
    grid-template-columns: 1fr;
  }
}
</style>
