<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import type { TableColumnData } from '@arco-design/web-vue'
import { IconDownload, IconEye } from '@arco-design/web-vue/es/icon'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { arcoConfirm } from '@/utils/arco-dialog'
import { templateApi } from '@/api/template'
import { attachmentApi } from '@/api/attachment'
import { approvalApi } from '@/api/platform'
import type { DocumentTemplate, QueryTemplateDto } from '@/types/template'
import type { PaginatedData } from '@/types/api'
import type { ApprovalTask } from '@/types/platform'
import type { TagType } from '@/types/ui'
import { downloadBlob } from '@/utils/blob'
import { openSignedPreview } from '@/utils/preview-link'

interface TemplateStage {
  code: string
  name: string
  description: string
}

interface TemplateSection {
  stage: TemplateStage
  templates: DocumentTemplate[]
}

const router = useRouter()

const loading = ref(false)
const templateList = ref<DocumentTemplate[]>([])
const activeStageCode = ref('')
const templateStreamRef = ref<HTMLElement>()
const createVisible = ref(false)
const createSubmitting = ref(false)
const createMode = ref<'markdown' | 'upload'>('markdown')
const createFiles = ref<File[]>([])
const approvalVisible = ref(false)
const approvalLoading = ref(false)
const approvalTasks = ref<ApprovalTask[]>([])
const createForm = ref({
  name: '',
  stageCode: '',
  category: 'Process',
  markdownContent: '',
  remark: '',
})

const stages: TemplateStage[] = [
  { code: '01_presale', name: '售前与启动', description: '立项、启动会、项目计划和职责分工模板' },
  { code: '02_design', name: '设计与配置', description: '设计说明、点表、软件配置和评审模板' },
  { code: '03_procurement', name: '采购与物流', description: '选型报价、采购、进出口和到货验收模板' },
  { code: '04_construction', name: '施工与调试', description: '现场施工、安全交底、调试记录和问题闭环模板' },
  { code: '05_acceptance', name: '验收与移交', description: '验收清单、交付确认、培训和资料移交模板' },
  { code: '06_review', name: '复盘与归档', description: '项目复盘、经验沉淀和归档检查模板' },
  { code: 'unassigned', name: '未归类模板', description: '尚未绑定交付流程阶段的模板' },
]

const statusOptions = [
  { value: 'Draft', label: '草稿' },
  { value: 'Reviewing', label: '审核中' },
  { value: 'Published', label: '已发布' },
  { value: 'Deprecated', label: '已废弃' },
]

const templateCategoryOptions = [
  { value: 'Process', label: '流程模板' },
  { value: 'Checklist', label: '清单模板' },
  { value: 'Form', label: '表单模板' },
  { value: 'Report', label: '报告模板' },
  { value: 'Config', label: '配置模板' },
  { value: 'Plan', label: '项目计划' },
  { value: 'Meeting', label: '会议纪要' },
  { value: 'Record', label: '记录模板' },
]

const NEW_TEMPLATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const HOT_TEMPLATE_THRESHOLD = 20

function normalizeStageCode(stageCode?: string | null): string {
  return stageCode || 'unassigned'
}

const templateSections = computed<TemplateSection[]>(() =>
  stages.map((stage) => ({
    stage,
    templates: templateList.value.filter(
      (template) => normalizeStageCode(template.stageCode) === stage.code,
    ),
  })),
)

const activeSection = computed(() =>
  templateSections.value.find((section) => section.stage.code === activeStageCode.value)
  || templateSections.value.find((section) => section.templates.length)
  || templateSections.value[0],
)

const totalTemplateCount = computed(() =>
  templateSections.value.reduce((total, section) => total + section.templates.length, 0),
)

function columnsFor(stageName: string): TableColumnData[] {
  return [
    { title: stageName, dataIndex: 'name', slotName: 'name', minWidth: 640 },
    { title: '分类', dataIndex: 'category', slotName: 'category', width: 96 },
    { title: '格式', dataIndex: 'fileFormat', slotName: 'format', width: 74 },
    { title: '状态', dataIndex: 'status', slotName: 'status', width: 90 },
    { title: '发布时间', dataIndex: 'publishedAt', slotName: 'publishedAt', width: 136 },
    { title: '操作', slotName: 'actions', width: 230, fixed: 'right' },
  ]
}

async function fetchList(): Promise<void> {
  loading.value = true
  try {
    const params: QueryTemplateDto = { page: 1, pageSize: 300 }
    const res = await templateApi.getList(params)
    const data = res as PaginatedData<DocumentTemplate>
    templateList.value = data.list
    if (!activeStageCode.value) {
      activeStageCode.value = templateSections.value.find((section) => section.templates.length)?.stage.code
        || stages[0].code
    }
    await nextTick()
    updateActiveStageByScroll()
  } catch {
    templateList.value = []
  } finally {
    loading.value = false
  }
}

async function scrollToStage(stageCode: string): Promise<void> {
  activeStageCode.value = stageCode
  await nextTick()
  const container = templateStreamRef.value
  const target = document.getElementById(`template-stage-${stageCode}`)
  if (container && target) {
    container.scrollTo({ top: target.offsetTop, behavior: 'smooth' })
    return
  }
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function updateActiveStageByScroll(): void {
  const container = templateStreamRef.value
  if (!container || !templateSections.value.length) return

  const containerTop = container.getBoundingClientRect().top
  const threshold = 56
  let currentCode = templateSections.value[0].stage.code

  for (const section of templateSections.value) {
    const element = document.getElementById(`template-stage-${section.stage.code}`)
    if (!element) continue
    const top = element.getBoundingClientRect().top - containerTop
    if (top <= threshold) {
      currentCode = section.stage.code
    } else {
      break
    }
  }

  activeStageCode.value = currentCode
}

function handleCreate(): void {
  resetCreateForm()
  createVisible.value = true
}

function handleEdit(row: DocumentTemplate): void {
  router.push(`/template/${row.id}`)
}

async function handleDelete(row: DocumentTemplate): Promise<void> {
  try {
    await arcoConfirm(`确定删除模板"${row.name}"吗？`, '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await templateApi.delete(row.id)
    Message.success('删除成功')
    await fetchList()
  } catch {
    // cancelled
  }
}

async function handlePublish(row: DocumentTemplate): Promise<void> {
  try {
    await templateApi.publish(row.id)
    Message.success('模板已提交发布审批')
    await fetchList()
  } catch {
    // error handled by request interceptor
  }
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
      businessType: 'template',
    })
    approvalTasks.value = page.list
  } finally {
    approvalLoading.value = false
  }
}

async function openApprovalTasks(): Promise<void> {
  approvalVisible.value = true
  await fetchApprovalTasks()
}

async function decideApprovalTask(task: ApprovalTask, decision: 'Approved' | 'Rejected'): Promise<void> {
  try {
    await arcoConfirm(
      decision === 'Approved' ? '确认通过该模板发布审批？' : '确认驳回该模板发布审批？',
      decision === 'Approved' ? '审批通过' : '驳回审批',
      {
        confirmButtonText: decision === 'Approved' ? '通过' : '驳回',
        cancelButtonText: '取消',
        type: decision === 'Approved' ? 'success' : 'warning',
      },
    )
    await approvalApi.decide(task.id, {
      decision,
      comment: decision === 'Approved' ? '模板发布审批通过' : '模板发布审批驳回',
    })
    Message.success(decision === 'Approved' ? '审批已通过' : '审批已驳回')
    await Promise.all([fetchApprovalTasks(), fetchList()])
  } catch {
    // user cancelled or interceptor handled the error
  }
}

function incrementTemplateHeat(templateId: string, key: 'previewCount' | 'downloadCount'): void {
  const target = templateList.value.find((item) => item.id === templateId)
  if (target) {
    target[key] = (target[key] || 0) + 1
  }
}

function isNewTemplate(template: DocumentTemplate): boolean {
  const createdAt = new Date(template.publishedAt || template.createdAt).getTime()
  return Number.isFinite(createdAt) && Date.now() - createdAt <= NEW_TEMPLATE_WINDOW_MS
}

function isHotTemplate(template: DocumentTemplate): boolean {
  return (template.previewCount || 0) + (template.downloadCount || 0) >= HOT_TEMPLATE_THRESHOLD
}

function showMissingTemplateFile(): void {
  Message.warning('该模板暂无可预览文件')
}

function displayTemplateFileName(row: DocumentTemplate): string {
  const sourceName = row.attachmentFileName || row.name || '未命名模板'
  const format = (row.fileFormat || '').trim().toLowerCase()
  if (!format || sourceName.toLowerCase().endsWith(`.${format}`)) {
    return sourceName
  }
  return `${sourceName}.${format}`
}

async function openTemplatePreview(row: DocumentTemplate): Promise<void> {
  if (!row.attachmentId) {
    showMissingTemplateFile()
    return
  }
  await openSignedPreview(
    () => attachmentApi.createPreviewLink(row.attachmentId as string),
    {
      title: displayTemplateFileName(row),
      onOpened: () => incrementTemplateHeat(row.id, 'previewCount'),
    },
  )
}

function resetCreateForm(): void {
  createMode.value = 'markdown'
  createFiles.value = []
  createForm.value = {
    name: '',
    stageCode: activeStageCode.value || stages[0].code,
    category: 'Process',
    markdownContent: '',
    remark: '',
  }
}

function selectCreateFiles(event: Event): void {
  createFiles.value = Array.from((event.target as HTMLInputElement).files ?? [])
  const firstFile = createFiles.value[0]
  if (firstFile && !createForm.value.name.trim()) {
    createForm.value.name = firstFile.name
  }
}

function safeFileName(value: string): string {
  const clean = value.trim().replace(/[\\/:*?"<>|]/g, '-')
  return clean || `template-${Date.now()}`
}

function fileExtFromName(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index >= 0 ? fileName.slice(index + 1).toLowerCase() : 'md'
}

function markdownFile(title: string, content: string): File {
  return new File([content || `# ${title}\n`], `${safeFileName(title)}.md`, {
    type: 'text/markdown;charset=utf-8',
  })
}

async function submitCreateTemplate(): Promise<void> {
  const name = createForm.value.name.trim()
  if (!name || !createForm.value.stageCode || !createForm.value.category) {
    Message.warning('请填写模板名称、流程和分类')
    return
  }
  if (createMode.value === 'upload' && createFiles.value.length === 0) {
    Message.warning('请先选择上传文件')
    return
  }

  createSubmitting.value = true
  try {
    const file =
      createMode.value === 'markdown'
        ? markdownFile(name, createForm.value.markdownContent)
        : createFiles.value[0]
    const template = await templateApi.create({
      name,
      category: createForm.value.category,
      stageCode: createForm.value.stageCode,
      language: 'zh-CN',
      fileFormat: fileExtFromName(file.name),
    })
    const data = new FormData()
    data.append('files', file)
    data.append('ownerType', 'DocumentTemplate')
    data.append('ownerId', template.id)
    data.append('category', 'template-version')
    if (createForm.value.remark.trim()) {
      data.append('remark', createForm.value.remark.trim())
    }
    const attachments = await attachmentApi.upload(data)
    await templateApi.addVersion(template.id, {
      versionNo: 'V1.0',
      attachmentId: attachments[0]?.id,
      changeNotes: createForm.value.remark.trim() || '初始版本',
    })
    let submittedForApproval = false
    try {
      await templateApi.publish(template.id)
      submittedForApproval = true
    } catch {
      // Publishing permission is optional for this quick-create path.
    }
    Message.success(submittedForApproval ? '模板已新增并提交发布审批' : '模板已新增为草稿')
    createVisible.value = false
    await fetchList()
  } finally {
    createSubmitting.value = false
  }
}

async function handleDownload(row: DocumentTemplate): Promise<void> {
  try {
    const download = await templateApi.getDownloadInfo(row.id)
    const content = download.attachmentId
      ? await attachmentApi.getContent(download.attachmentId)
      : new Blob([download.generatedContent || ''], {
          type: 'text/markdown;charset=utf-8',
        })
    downloadBlob(content, download.fileName)
    incrementTemplateHeat(row.id, 'downloadCount')
  } catch {
    Message.warning('该模板尚未上传可下载文件')
  }
}

function statusTagType(status: string): TagType {
  const map: Record<string, TagType> = {
    Draft: 'info',
    Reviewing: 'warning',
    Published: 'success',
    Deprecated: 'danger',
  }
  return map[status] || 'info'
}

function statusLabel(status: string): string {
  return statusOptions.find((option) => option.value === status)?.label || status
}

function categoryLabel(category: string): string {
  return templateCategoryOptions.find((option) => option.value === category)?.label || category
}

function formatDate(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN')
}

onMounted(fetchList)
</script>

<template>
  <section class="template-page">
    <aside class="template-sidebar">
      <div class="template-sidebar-header">
        <h2>交付流程</h2>
      </div>

      <div class="stage-list">
        <button
          v-for="section in templateSections"
          :key="section.stage.code"
          class="stage-item"
          :class="{ active: section.stage.code === activeStageCode }"
          type="button"
          @click="scrollToStage(section.stage.code)"
        >
          <span>{{ section.stage.name }}</span>
          <em>{{ section.templates.length }}</em>
        </button>
      </div>
    </aside>

    <main class="template-panel">
      <div class="template-toolbar">
        <div class="toolbar-title">
          <strong>{{ activeSection?.stage.name || '文档模板' }}</strong>
          <span>{{ activeSection?.templates.length || 0 }} 个模板</span>
        </div>
        <div class="template-toolbar-actions">
          <a-button size="small" @click="openApprovalTasks">审批任务</a-button>
          <a-button size="small" type="primary" @click="handleCreate">新增模板</a-button>
        </div>
      </div>

      <a-spin :loading="loading" class="template-spin">
        <div
          ref="templateStreamRef"
          class="template-stream"
          @scroll.passive="updateActiveStageByScroll"
        >
          <section
            v-for="section in templateSections"
            :id="`template-stage-${section.stage.code}`"
            :key="section.stage.code"
            class="template-section"
          >
            <a-table
              v-if="section.templates.length"
              :columns="columnsFor(section.stage.name)"
              :data="section.templates"
              :pagination="false"
              :bordered="{ cell: false }"
              row-key="id"
              class="template-table"
            >
              <template #name="{ record }">
                <div class="template-name-cell">
                  <div class="template-title-line">
                    <button
                      v-if="record.attachmentId"
                      class="template-title-button"
                      type="button"
                      @click="openTemplatePreview(record)"
                    >
                      {{ displayTemplateFileName(record) }}
                    </button>
                    <button
                      v-else
                      class="template-title-button"
                      type="button"
                      @click="showMissingTemplateFile"
                    >
                      {{ displayTemplateFileName(record) }}
                    </button>
                    <span class="template-heat" title="在线预览热度">
                      <IconEye />
                      {{ record.previewCount || 0 }}
                    </span>
                    <span class="template-heat" title="下载热度">
                      <IconDownload />
                      {{ record.downloadCount || 0 }}
                    </span>
                    <span v-if="isNewTemplate(record)" class="template-badge template-badge-new">NEW</span>
                    <span v-if="isHotTemplate(record)" class="template-badge template-badge-hot">热门</span>
                  </div>
                  <span>{{ section.stage.description }}</span>
                </div>
              </template>
              <template #category="{ record }">
                {{ categoryLabel(record.category) }}
              </template>
              <template #format="{ record }">
                <a-tag size="small">{{ (record.fileFormat || '-').toUpperCase() }}</a-tag>
              </template>
              <template #status="{ record }">
                <a-tag :type="statusTagType(record.status)" size="small">
                  {{ statusLabel(record.status) }}
                </a-tag>
              </template>
              <template #publishedAt="{ record }">
                {{ formatDate(record.publishedAt) }}
              </template>
              <template #actions="{ record }">
                <a-space size="mini" :wrap="false" class="template-actions">
                  <a-button
                    v-if="record.status === 'Published'"
                    type="text"
                    size="mini"
                    @click="handleDownload(record)"
                  >
                    下载
                  </a-button>
                  <a-button type="text" size="mini" @click="handleEdit(record)">
                    编辑
                  </a-button>
                  <a-button
                    v-if="record.status === 'Draft'"
                    type="text"
                    status="success"
                    size="mini"
                    @click="handlePublish(record)"
                  >
                    提交审批
                  </a-button>
                  <a-button
                    type="text"
                    status="danger"
                    size="mini"
                    @click="handleDelete(record)"
                  >
                    删除
                  </a-button>
                </a-space>
              </template>
            </a-table>

            <a-empty v-else-if="!totalTemplateCount" description="暂无模板" class="template-empty" />
          </section>
        </div>
      </a-spin>
    </main>

    <a-modal
      v-model:visible="createVisible"
      title="新增模板"
      :width="900"
      :confirm-loading="createSubmitting"
      ok-text="保存"
      cancel-text="取消"
      @ok="submitCreateTemplate"
    >
      <div class="quick-create-form">
        <a-form :model="createForm" layout="vertical">
          <a-grid :cols="3" :col-gap="12" :row-gap="12">
            <a-grid-item>
              <a-form-item label="模板名称" required>
                <a-input v-model="createForm.name" placeholder="请输入模板名称" />
              </a-form-item>
            </a-grid-item>
            <a-grid-item>
              <a-form-item label="交付流程" required>
                <a-select v-model="createForm.stageCode" placeholder="请选择交付流程">
                  <a-option
                    v-for="stage in stages.filter((item) => item.code !== 'unassigned')"
                    :key="stage.code"
                    :value="stage.code"
                  >
                    {{ stage.name }}
                  </a-option>
                </a-select>
              </a-form-item>
            </a-grid-item>
            <a-grid-item>
              <a-form-item label="模板分类" required>
                <a-select v-model="createForm.category" placeholder="请选择模板分类">
                  <a-option
                    v-for="option in templateCategoryOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </a-option>
                </a-select>
              </a-form-item>
            </a-grid-item>
          </a-grid>

          <a-form-item label="简介备注">
            <a-textarea
              v-model="createForm.remark"
              placeholder="用于列表展示和版本记录的简短说明"
              :auto-size="{ minRows: 2, maxRows: 3 }"
            />
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
            accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
            @change="selectCreateFiles"
          />
          <em v-if="createFiles.length">
            已选择 {{ createFiles[0].name }}
          </em>
        </label>
      </div>
    </a-modal>

    <a-modal
      v-model:visible="approvalVisible"
      title="文档模板审批任务"
      :width="980"
      :footer="false"
    >
      <a-table
        :loading="approvalLoading"
        :data="approvalTasks"
        :pagination="false"
        row-key="id"
        class="template-approval-table"
        :bordered="{ cell: false }"
        :scroll="{ x: 900 }"
      >
        <a-table-column label="审批事项" :min-width="260" show-overflow-tooltip>
          <template #default="{ row }">
            <strong>{{ row.businessTitle || row.template?.templateName || '文档模板发布审批' }}</strong>
          </template>
        </a-table-column>
        <a-table-column label="状态" :width="92" align="center">
          <template #default="{ row }">
            <a-tag :color="approvalStatusColor(row.status)" size="small">
              {{ approvalStatusLabel(row.status) }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column label="申请人" :width="96">
          <template #default="{ row }">
            {{ row.applicant?.realName || '-' }}
          </template>
        </a-table-column>
        <a-table-column label="审批人" :width="96">
          <template #default="{ row }">
            {{ row.approver?.realName || '-' }}
          </template>
        </a-table-column>
        <a-table-column label="提交时间" :width="132">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </a-table-column>
        <a-table-column label="操作" :width="128" fixed="right">
          <template #default="{ row }">
            <a-space v-if="row.status === 'Pending'" size="mini" :wrap="false" class="template-approval-actions">
              <a-button type="primary" size="mini" @click="decideApprovalTask(row, 'Approved')">
                通过
              </a-button>
              <a-button status="danger" size="mini" @click="decideApprovalTask(row, 'Rejected')">
                驳回
              </a-button>
            </a-space>
            <span v-else class="muted-text">已处理</span>
          </template>
        </a-table-column>
      </a-table>
    </a-modal>

  </section>
</template>

<style scoped lang="scss">
.template-page {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  gap: 6px;
  overflow: hidden;
}

.template-sidebar,
.template-panel {
  min-width: 0;
  min-height: 0;
  height: 100%;
  border: 1px solid var(--color-border-2);
  border-radius: 0;
  background: var(--color-bg-2);
}

.template-sidebar {
  display: flex;
  flex-direction: column;
  padding: 6px;
  overflow: hidden;
}

.template-sidebar-header {
  min-height: 50px;
  display: flex;
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

.stage-list {
  display: grid;
  align-content: start;
  gap: 3px;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.stage-item {
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

.template-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.template-toolbar {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border-2);
  background: #fff;
}

.template-toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    flex: 0 0 auto;
    color: var(--color-text-3);
    font-size: 12px;
  }
}

.template-spin {
  min-height: 0;
  display: block;
  flex: 1;
}

.template-spin :deep(.arco-spin-children) {
  height: 100%;
  min-height: 0;
}

.template-stream {
  height: 100%;
  padding: 8px 8px 10px;
  overflow-y: auto;
  overflow-x: hidden;
}

.template-section {
  margin-bottom: 10px;
  scroll-margin-top: 8px;
}

.template-table {
  border: 1px solid var(--color-border-2);
  border-radius: 0;
  overflow: hidden;
}

.template-table :deep(.arco-table-th) {
  font-size: 12px;
}

.template-table :deep(.arco-table-cell) {
  padding: 7px 8px;
  font-size: 12px;
  line-height: 1.42;
}

.template-name-cell {
  min-width: 0;
  display: grid;
  gap: 2px;

  span {
    overflow: hidden;
    color: var(--color-text-3);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.template-title-line {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
}

.template-title-button {
  min-width: 0;
  flex: 1 1 360px;
  padding: 0;
  border: 0;
  overflow: visible;
  color: rgb(var(--primary-6));
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  text-align: left;
  text-decoration: none;
  white-space: normal;
  word-break: break-word;

  &:hover {
    color: rgb(var(--primary-5));
    text-decoration: underline;
  }
}

.template-heat {
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

.template-badge {
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

.template-badge-new {
  border-color: rgb(var(--primary-2));
  color: rgb(var(--primary-6));
  background: rgb(var(--primary-1));
}

.template-badge-hot {
  border-color: #f7c88a;
  color: #a86612;
  background: #fff7e8;
}

.template-actions {
  white-space: nowrap;
}

.template-actions :deep(.arco-btn-size-mini) {
  padding: 0 4px;
  font-size: 11px;
}

.template-approval-table :deep(.arco-table-th),
.template-approval-table :deep(.arco-table-cell) {
  padding: 7px 8px;
  font-size: 12px;
}

.template-approval-actions {
  white-space: nowrap;
}

.template-approval-actions :deep(.arco-btn-size-mini) {
  padding: 0 7px;
}

.muted-text {
  color: var(--color-text-3);
  font-size: 12px;
}

.template-empty {
  padding: 20px 0;
  border: 1px dashed var(--color-border-2);
  border-radius: 0;
  background: var(--color-fill-1);
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

.file-picker {
  display: grid;
  gap: 6px;
}

.file-picker input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--color-border-2);
  border-radius: 0;
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

@media (max-width: 980px) {
  .template-page {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(104px, 172px) minmax(0, 1fr);
  }

  .stage-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
