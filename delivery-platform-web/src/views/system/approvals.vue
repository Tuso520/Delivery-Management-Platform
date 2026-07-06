<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import type { TableColumnData } from '@arco-design/web-vue'
import { attachmentApi } from '@/api/attachment'
import type { AttachmentPreview } from '@/api/attachment'
import { countryApi } from '@/api/country'
import { knowledgeApi } from '@/api/knowledge'
import { approvalApi } from '@/api/platform'
import { roleApi } from '@/api/role'
import { userApi } from '@/api/user'
import type { Country } from '@/types/country'
import type { KnowledgeAttachment, KnowledgeFileRevisionDiff } from '@/types/knowledge'
import type { ApprovalStep, ApprovalTask, ApprovalTemplate } from '@/types/platform'
import type { Role } from '@/types/role'
import type { UserListItem } from '@/types/user'
import { arcoPrompt } from '@/utils/arco-dialog'
import { getApprovalBusinessLabel } from '@/utils/approval'
import { downloadBlob } from '@/utils/blob'

type PreviewState = AttachmentPreview & { objectUrl?: string }

const route = useRoute()
const loading = ref(false)
const activeTab = ref(route.query.tab === 'tasks' ? 'tasks' : 'templates')
const templates = ref<ApprovalTemplate[]>([])
const tasks = ref<ApprovalTask[]>([])
const roles = ref<Role[]>([])
const users = ref<UserListItem[]>([])
const countries = ref<Country[]>([])

const dialogVisible = ref(false)
const diffVisible = ref(false)
const diffLoading = ref(false)
const currentDiff = ref<KnowledgeFileRevisionDiff>()
const previewVisible = ref(false)
const previewLoading = ref(false)
const preview = ref<PreviewState>()

const defaultStep = (): ApprovalStep => ({
  stepOrder: 1,
  stepName: '负责人审核',
  approverType: 'role',
  approverValue: '',
})

const form = ref({
  templateCode: '',
  templateName: '',
  businessType: 'report',
  countryCode: '',
  isEnabled: true,
  steps: [defaultStep()] as ApprovalStep[],
})

const businessOptions = [
  { value: 'report', label: '工作报告' },
  { value: 'knowledge', label: '知识发布' },
  { value: 'knowledge-file-update', label: '知识库文件更新' },
  { value: 'checklist', label: '检查模板记录' },
  { value: 'process_record', label: '项目过程记录' },
  { value: 'performance', label: '绩效评分' },
]

const templateColumns: TableColumnData[] = [
  { title: '编码', dataIndex: 'templateCode', width: 190 },
  { title: '名称', dataIndex: 'templateName', minWidth: 180 },
  { title: '业务类型', dataIndex: 'businessType', slotName: 'businessType', width: 150 },
  { title: '审批步骤', slotName: 'steps', minWidth: 260 },
  { title: '启用', dataIndex: 'isEnabled', slotName: 'enabled', width: 90 },
  { title: '操作', slotName: 'templateActions', width: 100, fixed: 'right' },
]

const taskColumns: TableColumnData[] = [
  { title: '审批类型', slotName: 'taskType', minWidth: 170 },
  { title: '业务事项', dataIndex: 'businessTitle', minWidth: 260 },
  { title: '业务', dataIndex: 'businessType', slotName: 'taskBusiness', width: 140 },
  { title: '申请人', slotName: 'applicant', width: 120 },
  { title: '当前审批人', slotName: 'approver', width: 130 },
  { title: '步骤', dataIndex: 'currentStep', width: 80 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 100 },
  { title: '创建时间', dataIndex: 'createdAt', slotName: 'createdAt', width: 170 },
  { title: '操作', slotName: 'taskActions', width: 240, fixed: 'right' },
]

const diffColumns: TableColumnData[] = [
  { title: '对比项', dataIndex: 'label', width: 130 },
  { title: '原文件', dataIndex: 'before', ellipsis: true, tooltip: true },
  { title: '新文件', dataIndex: 'after', ellipsis: true, tooltip: true },
  { title: '结果', dataIndex: 'changed', slotName: 'changed', width: 100 },
]

const previewTitle = computed(() => preview.value?.title || preview.value?.fileName || '在线预览')

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [templatePage, taskPage] = await Promise.all([
      approvalApi.getTemplates({ page: 1, pageSize: 100 }),
      approvalApi.getTasks({ page: 1, pageSize: 100 }),
    ])
    templates.value = templatePage.list
    tasks.value = taskPage.list

    const [roleResult, userResult, countryResult] = await Promise.allSettled([
      roleApi.getList(),
      userApi.getList({ page: 1, pageSize: 100, status: 'Active' }),
      countryApi.getList({ page: 1, pageSize: 100 }),
    ])
    roles.value = roleResult.status === 'fulfilled' ? roleResult.value : []
    users.value = userResult.status === 'fulfilled' ? userResult.value.list : []
    countries.value = countryResult.status === 'fulfilled' ? countryResult.value.list : []
  } finally {
    loading.value = false
  }
}

function openTemplate(row?: ApprovalTemplate): void {
  form.value = row
    ? {
        templateCode: row.templateCode,
        templateName: row.templateName,
        businessType: row.businessType,
        countryCode: row.countryCode ?? '',
        isEnabled: row.isEnabled,
        steps: row.steps.length ? row.steps.map((step) => ({ ...step })) : [defaultStep()],
      }
    : {
        templateCode: '',
        templateName: '',
        businessType: 'report',
        countryCode: '',
        isEnabled: true,
        steps: [defaultStep()],
      }
  dialogVisible.value = true
}

function addStep(): void {
  form.value.steps.push({
    stepOrder: form.value.steps.length + 1,
    stepName: `第 ${form.value.steps.length + 1} 步审核`,
    approverType: 'role',
    approverValue: '',
  })
}

async function saveTemplate(): Promise<void> {
  await approvalApi.saveTemplate({
    ...form.value,
    countryCode: form.value.countryCode || undefined,
  })
  Message.success('审批模板已保存')
  dialogVisible.value = false
  await fetchData()
}

async function decide(task: ApprovalTask, decision: 'Approved' | 'Rejected'): Promise<void> {
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
    await fetchData()
    if (currentDiff.value?.incoming.id === task.businessId) {
      diffVisible.value = false
      currentDiff.value = undefined
    }
  } catch {
    // 用户取消审批弹窗。
  }
}

async function openDiff(task: ApprovalTask): Promise<void> {
  if (task.businessType !== 'knowledge-file-update') {
    Message.info('当前任务没有文件差异对比')
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

function statusColor(status: string): string {
  if (status === 'Pending') return 'orange'
  if (status === 'Approved') return 'green'
  if (status === 'Rejected') return 'red'
  return 'gray'
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

async function previewAttachment(item: KnowledgeAttachment): Promise<void> {
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

async function downloadAttachment(item: KnowledgeAttachment): Promise<void> {
  downloadBlob(await attachmentApi.getContent(item.id), item.originalName)
}

function releasePreviewObjectUrl(): void {
  if (preview.value?.objectUrl) {
    URL.revokeObjectURL(preview.value.objectUrl)
  }
}

onMounted(fetchData)

onBeforeUnmount(() => {
  releasePreviewObjectUrl()
})
</script>

<template>
  <a-spin :loading="loading" class="approval-spin">
    <section class="approval-page">
      <div class="page-toolbar">
        <div>
          <h2>审批配置</h2>
          <p>配置业务审批模板，处理知识库文件更新等后台审批任务。</p>
        </div>
        <a-space>
          <a-button @click="fetchData">刷新</a-button>
          <a-button v-if="activeTab === 'templates'" type="primary" @click="openTemplate()">
            新增模板
          </a-button>
        </a-space>
      </div>

      <a-tabs v-model="activeTab" class="approval-tabs">
        <a-tab-pane label="审批模板" name="templates" />
        <a-tab-pane label="审批任务" name="tasks" />
      </a-tabs>

      <a-table
        v-if="activeTab === 'templates'"
        :columns="templateColumns"
        :data="templates"
        :pagination="false"
        row-key="id"
      >
        <template #businessType="{ record }">
          <a-tag>{{ getApprovalBusinessLabel(record.businessType) }}</a-tag>
        </template>
        <template #steps="{ record }">
          <a-space wrap>
            <a-tag v-for="step in record.steps" :key="`${record.id}-${step.stepOrder}`">
              {{ step.stepOrder }}. {{ step.stepName }}
            </a-tag>
          </a-space>
        </template>
        <template #enabled="{ record }">
          <a-tag :color="record.isEnabled ? 'green' : 'gray'">
            {{ record.isEnabled ? '是' : '否' }}
          </a-tag>
        </template>
        <template #templateActions="{ record }">
          <a-button type="text" size="small" @click="openTemplate(record)">编辑</a-button>
        </template>
      </a-table>

      <a-table
        v-else
        :columns="taskColumns"
        :data="tasks"
        :pagination="false"
        row-key="id"
      >
        <template #taskType="{ record }">
          {{ record.template?.templateName || getApprovalBusinessLabel(record.businessType) }}
        </template>
        <template #taskBusiness="{ record }">
          <a-tag>{{ getApprovalBusinessLabel(record.businessType) }}</a-tag>
        </template>
        <template #applicant="{ record }">
          {{ record.applicant?.realName || '-' }}
        </template>
        <template #approver="{ record }">
          {{ record.approver?.realName || '-' }}
        </template>
        <template #status="{ record }">
          <a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag>
        </template>
        <template #createdAt="{ record }">
          {{ formatDate(record.createdAt) }}
        </template>
        <template #taskActions="{ record }">
          <a-space size="mini" wrap>
            <a-button
              v-if="record.businessType === 'knowledge-file-update'"
              type="text"
              size="small"
              @click="openDiff(record)"
            >
              差异对比
            </a-button>
            <template v-if="record.status === 'Pending'">
              <a-button type="text" size="small" @click="decide(record, 'Approved')">
                通过
              </a-button>
              <a-button type="text" size="small" status="danger" @click="decide(record, 'Rejected')">
                驳回
              </a-button>
            </template>
          </a-space>
        </template>
      </a-table>

      <a-modal
        v-model:visible="dialogVisible"
        title="审批模板"
        :width="760"
        ok-text="保存"
        cancel-text="取消"
        @ok="saveTemplate"
      >
        <a-form :model="form" layout="vertical">
          <div class="template-form-grid">
            <a-form-item label="模板编码" field="templateCode" required>
              <a-input v-model="form.templateCode" />
            </a-form-item>
            <a-form-item label="模板名称" field="templateName" required>
              <a-input v-model="form.templateName" />
            </a-form-item>
            <a-form-item label="业务类型" field="businessType" required>
              <a-select v-model="form.businessType">
                <a-option
                  v-for="option in businessOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </a-option>
              </a-select>
            </a-form-item>
            <a-form-item label="适用国家">
              <a-select v-model="form.countryCode" allow-clear placeholder="不限制国家">
                <a-option
                  v-for="country in countries"
                  :key="country.countryCode"
                  :value="country.countryCode"
                >
                  {{ country.nameZh }}
                </a-option>
              </a-select>
            </a-form-item>
            <a-form-item label="启用">
              <a-switch v-model="form.isEnabled" />
            </a-form-item>
          </div>

          <a-form-item label="审批步骤">
            <div class="steps-editor">
              <div v-for="(step, index) in form.steps" :key="index" class="step-row">
                <a-input-number v-model="step.stepOrder" :min="1" />
                <a-input v-model="step.stepName" placeholder="步骤名称" />
                <a-select v-model="step.approverType">
                  <a-option value="role">角色</a-option>
                  <a-option value="user">用户</a-option>
                </a-select>
                <a-select v-model="step.approverValue" placeholder="选择审批人">
                  <template v-if="step.approverType === 'role'">
                    <a-option
                      v-for="role in roles"
                      :key="role.id"
                      :value="role.roleCode"
                    >
                      {{ role.roleName }}
                    </a-option>
                  </template>
                  <template v-else>
                    <a-option
                      v-for="user in users"
                      :key="user.id"
                      :value="user.id"
                    >
                      {{ user.realName }}
                    </a-option>
                  </template>
                </a-select>
                <a-button status="danger" type="text" @click="form.steps.splice(index, 1)">
                  删除
                </a-button>
              </div>
              <a-button @click="addStep">增加步骤</a-button>
            </div>
          </a-form-item>
        </a-form>
      </a-modal>

      <a-modal
        v-model:visible="diffVisible"
        title="知识库文件更新差异对比"
        :footer="false"
        :width="1040"
      >
        <a-spin :loading="diffLoading">
          <template v-if="currentDiff">
            <div class="diff-header">
              <div>
                <span>知识条目</span>
                <strong>{{ currentDiff.article?.title || '-' }}</strong>
              </div>
              <a-tag>{{ currentDiff.article?.category?.name || '知识库' }}</a-tag>
            </div>

            <div class="diff-files">
              <div class="diff-file-card">
                <span>原文件</span>
                <strong>{{ currentDiff.original.originalName }}</strong>
                <p>
                  {{ currentDiff.original.fileExt.toUpperCase() }} /
                  {{ formatFileSize(currentDiff.original.fileSize) }}
                </p>
                <a-space size="mini">
                  <a-button type="text" @click="previewAttachment(currentDiff.original)">
                    预览原文件
                  </a-button>
                  <a-button type="text" @click="downloadAttachment(currentDiff.original)">
                    下载
                  </a-button>
                </a-space>
              </div>
              <div class="diff-file-card incoming">
                <span>新文件</span>
                <strong>{{ currentDiff.incoming.originalName }}</strong>
                <p>
                  {{ currentDiff.incoming.fileExt.toUpperCase() }} /
                  {{ formatFileSize(currentDiff.incoming.fileSize) }}
                </p>
                <a-space size="mini">
                  <a-button type="text" @click="previewAttachment(currentDiff.incoming)">
                    预览新文件
                  </a-button>
                  <a-button type="text" @click="downloadAttachment(currentDiff.incoming)">
                    下载
                  </a-button>
                </a-space>
              </div>
            </div>

            <a-table
              :columns="diffColumns"
              :data="currentDiff.changes"
              :pagination="false"
              :bordered="{ cell: true }"
              row-key="label"
            >
              <template #changed="{ record }">
                <a-tag :color="record.changed ? 'orange' : 'green'">
                  {{ record.changed ? '有变化' : '一致' }}
                </a-tag>
              </template>
            </a-table>
          </template>
        </a-spin>
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
  </a-spin>
</template>

<style scoped lang="scss">
.approval-page {
  min-width: 0;
}

.approval-spin {
  display: block;
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

.approval-tabs {
  margin-bottom: 14px;
}

.template-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.steps-editor {
  width: 100%;
  display: grid;
  gap: 10px;
}

.step-row {
  display: grid;
  grid-template-columns: 90px 1fr 120px 190px auto;
  gap: 8px;
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

  div {
    display: grid;
    gap: 4px;
  }

  span {
    color: var(--color-text-3);
    font-size: 12px;
  }

  strong {
    color: var(--color-text-1);
    font-size: 16px;
  }
}

.diff-files {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.diff-file-card {
  display: grid;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: var(--color-fill-1);

  &.incoming {
    background: rgb(var(--primary-1));
  }

  span,
  p {
    margin: 0;
    color: var(--color-text-3);
    font-size: 12px;
  }

  strong {
    overflow: hidden;
    color: var(--color-text-1);
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
  .template-form-grid,
  .diff-files {
    grid-template-columns: 1fr;
  }

  .step-row {
    grid-template-columns: 1fr;
  }

  .page-toolbar {
    flex-direction: column;
  }
}
</style>
