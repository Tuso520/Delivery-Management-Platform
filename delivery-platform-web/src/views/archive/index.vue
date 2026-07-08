<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { archiveApi } from '@/api/archive'
import { archiveTemplateApi } from '@/api/archive-template'
import { fileApi } from '@/api/file'
import { projectApi } from '@/api/project'
import { reviewApi } from '@/api/review'
import FileUploader from '@/components/FileUploader/index.vue'
import { arcoConfirm } from '@/utils/arco-dialog'
import { downloadBlob } from '@/utils/blob'
import { openSignedPreview } from '@/utils/preview-link'
import {
  localizeProjectRisk,
  localizeProjectStage,
  localizeProjectStatus,
} from '@/utils/project-localization'
import { useLocaleStore } from '@/store/locale'
import type {
  ArchiveItem,
  ArchiveStatistics,
  ArchiveTemplate,
  ArchiveTreeData,
} from '@/types/archive'
import { ARCHIVE_ITEM_STATUS_OPTIONS } from '@/types/archive'
import type { PendingReview } from '@/types/file'
import type { Project } from '@/types/project'
import type { TagType } from '@/types/ui'
import ProjectRecordsPanel from './components/ProjectRecordsPanel.vue'
import ReviewDialog from '../review/components/ReviewDialog.vue'

type ArchiveFile = NonNullable<ArchiveItem['files']>[number]

interface UploadPoint extends ArchiveItem {
  parentName?: string
  guideText: string
}

interface ArchiveSection {
  stageCode: string
  stageName: string
  items: UploadPoint[]
  totalItems: number
  completedItems: number
}

const localeStore = useLocaleStore()

const projectList = ref<Project[]>([])
const selectedProjectId = ref('')
const loadingProjects = ref(false)
const archiveTree = ref<ArchiveTreeData | null>(null)
const statistics = ref<ArchiveStatistics | null>(null)
const loadingArchive = ref(false)
const templateList = ref<ArchiveTemplate[]>([])
const loadingTemplates = ref(false)
const showGenerateDialog = ref(false)
const selectedTemplateId = ref('')
const generatingArchive = ref(false)
const activeStage = ref('')
const activeArchiveView = ref<'directory' | 'records' | 'reviews'>('directory')
const showItemDetail = ref(false)
const showProjectDetail = ref(false)
const currentItem = ref<ArchiveItem | null>(null)
const loadingItem = ref(false)
const pendingReviews = ref<PendingReview[]>([])
const loadingReviews = ref(false)
const reviewDialogVisible = ref(false)
const selectedReviewFileId = ref('')
const selectedReviewFileName = ref('')
const archiveStreamRef = ref<HTMLElement>()

const defaultAllowedTypes = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'jpg', 'jpeg', 'png']
const archiveViewOptions = [
  { label: '档案目录', value: 'directory' },
  { label: '上传记录', value: 'records' },
  { label: '待审核', value: 'reviews' },
] as const

const selectedProjectName = computed(() =>
  projectList.value.find((project) => project.id === selectedProjectId.value)?.projectName || '',
)

const selectedProject = computed(() =>
  projectList.value.find((project) => project.id === selectedProjectId.value),
)

const archiveSections = computed<ArchiveSection[]>(() =>
  (archiveTree.value?.stages || []).map((stage) => {
    const stats = getStageStats(stage.stageCode)
    const items = flattenUploadPoints(stage.items || [])
    return {
      stageCode: stage.stageCode,
      stageName: localizeProjectStage(stage.stageCode, localeStore.currentLocale),
      items,
      totalItems: stats?.totalItems ?? items.length,
      completedItems: stats?.completedItems ?? items.filter((item) => item.status === 'Completed').length,
    }
  }),
)

const activeArchiveSection = computed(() =>
  archiveSections.value.find((section) => section.stageCode === activeStage.value)
  || archiveSections.value[0],
)

const currentProjectReviews = computed(() =>
  pendingReviews.value.filter((review) => review.file.project?.id === selectedProjectId.value),
)

async function fetchProjects(): Promise<void> {
  loadingProjects.value = true
  try {
    const res = await projectApi.getList({ page: 1, pageSize: 100 })
    const data = res as unknown as { list: Project[] }
    projectList.value = data.list || []
    if (!selectedProjectId.value && projectList.value.length) {
      selectedProjectId.value = projectList.value[0].id
    }
    if (selectedProjectId.value) {
      await Promise.all([fetchArchive(), fetchPendingReviews()])
    }
  } catch {
    projectList.value = []
  } finally {
    loadingProjects.value = false
  }
}

async function fetchArchive(): Promise<void> {
  if (!selectedProjectId.value) {
    archiveTree.value = null
    statistics.value = null
    return
  }
  loadingArchive.value = true
  try {
    const [treeRes, statsRes] = await Promise.all([
      archiveApi.getArchiveTree(selectedProjectId.value),
      archiveApi.getStatistics(selectedProjectId.value),
    ])
    archiveTree.value = treeRes as unknown as ArchiveTreeData
    statistics.value = statsRes as unknown as ArchiveStatistics
    const stages = archiveTree.value?.stages || []
    if (!stages.some((stage) => stage.stageCode === activeStage.value)) {
      activeStage.value = stages[0]?.stageCode || ''
    }
  } catch {
    archiveTree.value = null
    statistics.value = null
  } finally {
    loadingArchive.value = false
  }
}

async function fetchTemplates(): Promise<void> {
  loadingTemplates.value = true
  try {
    templateList.value = (await archiveTemplateApi.getList()) as unknown as ArchiveTemplate[]
  } catch {
    templateList.value = []
  } finally {
    loadingTemplates.value = false
  }
}

function flattenUploadPoints(items: ArchiveItem[], parentName?: string): UploadPoint[] {
  return items.flatMap((item) => {
    if (item.children?.length) {
      return flattenUploadPoints(item.children, item.secondName || item.name)
    }
    const name = item.secondName || item.name
    return [{
      ...item,
      parentName,
      guideText: item.usageDescription
        || (parentName
          ? `请上传「${parentName} / ${name}」对应的最终版文件、过程记录或审批确认材料。`
          : `请上传「${name}」对应的文件，并在备注中说明适用范围和版本。`),
    }]
  })
}

function handleProjectChange(): void {
  activeArchiveView.value = 'directory'
  Promise.all([fetchArchive(), fetchPendingReviews()])
}

async function scrollToArchiveStage(stageCode: string): Promise<void> {
  activeStage.value = stageCode
  await nextTick()
  const container = archiveStreamRef.value
  const target = document.getElementById(`archive-stage-${stageCode}`)
  if (container && target) {
    container.scrollTo({ top: target.offsetTop, behavior: 'smooth' })
  }
}

function updateActiveArchiveStageByScroll(): void {
  const container = archiveStreamRef.value
  if (!container || !archiveSections.value.length) return
  const containerTop = container.getBoundingClientRect().top
  let currentCode = archiveSections.value[0].stageCode
  for (const section of archiveSections.value) {
    const element = document.getElementById(`archive-stage-${section.stageCode}`)
    if (!element) continue
    if (element.getBoundingClientRect().top - containerTop <= 56) {
      currentCode = section.stageCode
    } else {
      break
    }
  }
  activeStage.value = currentCode
}

async function fetchPendingReviews(): Promise<void> {
  loadingReviews.value = true
  try {
    pendingReviews.value = await reviewApi.getPending()
  } catch {
    pendingReviews.value = []
  } finally {
    loadingReviews.value = false
  }
}

function openGenerateDialog(): void {
  selectedTemplateId.value = ''
  fetchTemplates()
  showGenerateDialog.value = true
}

async function handleGenerateArchive(): Promise<void> {
  if (!selectedProjectId.value || !selectedTemplateId.value) {
    Message.warning('请选择项目和档案模板')
    return
  }
  generatingArchive.value = true
  try {
    await archiveApi.generate(selectedProjectId.value, selectedTemplateId.value)
    Message.success('档案目录生成成功')
    showGenerateDialog.value = false
    await fetchArchive()
  } finally {
    generatingArchive.value = false
  }
}

async function viewItemDetail(itemId: string): Promise<void> {
  if (!selectedProjectId.value) return
  showItemDetail.value = true
  loadingItem.value = true
  try {
    currentItem.value = await archiveApi.getItem(selectedProjectId.value, itemId) as unknown as ArchiveItem
  } finally {
    loadingItem.value = false
  }
}

async function reloadCurrentItem(): Promise<void> {
  if (currentItem.value?.id) {
    await viewItemDetail(currentItem.value.id)
  }
  await fetchArchive()
}

async function handleUploadSuccess(): Promise<void> {
  Message.success('文件已上传，系统已按目录规则进入审核流程')
  await reloadCurrentItem()
  await fetchPendingReviews()
}

async function openFilePreview(file: ArchiveFile): Promise<void> {
  await openSignedPreview(
    () => fileApi.createPreviewLink(file.id),
    { title: file.originalName },
  )
}

async function openReviewPreview(row: PendingReview): Promise<void> {
  await openSignedPreview(
    () => fileApi.createPreviewLink(row.fileId),
    { title: row.file.fileName },
  )
}

function openReviewDialog(row: PendingReview): void {
  selectedReviewFileId.value = row.fileId
  selectedReviewFileName.value = row.file.fileName
  reviewDialogVisible.value = true
}

async function handleReviewComplete(): Promise<void> {
  reviewDialogVisible.value = false
  Message.success('审核完成')
  await Promise.all([fetchPendingReviews(), fetchArchive()])
  if (currentItem.value?.id) {
    await reloadCurrentItem()
  }
}

async function downloadFile(file: ArchiveFile): Promise<void> {
  downloadBlob(await fileApi.download(file.id), file.originalName)
}

async function deleteFile(file: ArchiveFile): Promise<void> {
  await arcoConfirm(`确定删除文件「${file.originalName}」？`, '确认删除', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
  await fileApi.delete(file.id)
  Message.success('文件已删除')
  await reloadCurrentItem()
}

function getStageStats(stageCode: string) {
  return statistics.value?.stages.find((stage) => stage.stageCode === stageCode)
}

function getStatusTag(status: string): { type: TagType; label: string } {
  const option = ARCHIVE_ITEM_STATUS_OPTIONS.find((item) => item.value === status)
  return {
    type: (option?.type || 'info') as TagType,
    label: option?.label || status,
  }
}

function getAllowedTypes(item?: ArchiveItem | null): string[] {
  const configured = item?.allowedFileTypes
    ?.split(',')
    .map((type) => type.trim().toLowerCase())
    .filter(Boolean)
  return configured?.length ? configured : defaultAllowedTypes
}

function formatFileSize(value?: number | string): string {
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

function formatDateOnly(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN')
}

function openProjectDetail(): void {
  showProjectDetail.value = true
}

onMounted(fetchProjects)

watch(activeArchiveView, (view) => {
  if (view === 'reviews') {
    fetchPendingReviews()
  }
})
</script>

<template>
  <div class="archive-page">
    <a-card class="archive-shell" :bordered="false">
      <div class="archive-topbar">
        <div class="project-picker">
          <span>项目</span>
          <a-select
            v-model="selectedProjectId"
            :loading="loadingProjects"
            placeholder="请选择项目"
            class="project-selector"
            filterable
            @change="handleProjectChange"
          >
            <a-option
              v-for="item in projectList"
              :key="item.id"
              :label="item.projectName"
              :value="item.id"
            />
          </a-select>
          <a-tag v-if="selectedProject?.projectCode" size="small" class="project-code-tag">
            {{ selectedProject.projectCode }}
          </a-tag>
          <a-button size="mini" type="text" :disabled="!selectedProjectId" @click="openProjectDetail">
            详情
          </a-button>
        </div>

        <div class="archive-actions">
          <div class="archive-view-switch" role="tablist" aria-label="项目档案视图切换">
            <a-button
              v-for="option in archiveViewOptions"
              :key="option.value"
              size="small"
              :type="activeArchiveView === option.value ? 'primary' : 'secondary'"
              role="tab"
              @click="activeArchiveView = option.value"
            >
              {{ option.label }}
            </a-button>
          </div>
          <a-button size="small" type="primary" :disabled="!selectedProjectId" @click="openGenerateDialog">
            生成目录
          </a-button>
        </div>
      </div>

      <ProjectRecordsPanel
        v-if="activeArchiveView === 'records' && selectedProjectId"
        :project-id="selectedProjectId"
        :project-name="selectedProjectName"
      />

      <div v-else-if="activeArchiveView === 'reviews' && selectedProjectId" class="archive-review-panel">
        <div class="stage-title-row">
          <h3>待审核文件</h3>
          <span>上传后自动进入这里，由负责人或交付管理人员完成预览、通过或驳回。</span>
        </div>
        <a-table
          :loading="loadingReviews"
          :data="currentProjectReviews"
          row-key="id"
          border
          stripe
          class="archive-table"
          empty-text="当前项目暂无待审核文件"
          :scroll="{ y: '100%', x: 980 }"
        >
          <a-table-column label="文件名称" :min-width="260">
            <template #default="{ row }">
              <button class="file-link" type="button" @click="openReviewPreview(row)">
                {{ row.file.fileName }}
              </button>
            </template>
          </a-table-column>
          <a-table-column label="档案项" :min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.archiveItem.name }}</template>
          </a-table-column>
          <a-table-column label="版本" :width="76" align="center">
            <template #default="{ row }">{{ row.file.versionNo }}</template>
          </a-table-column>
          <a-table-column label="审核人" :width="108">
            <template #default="{ row }">{{ row.reviewer.realName }}</template>
          </a-table-column>
          <a-table-column label="提交时间" :width="152">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </a-table-column>
          <a-table-column label="状态" :width="90" align="center">
            <template #default>
              <a-tag color="orange" size="small">待审核</a-tag>
            </template>
          </a-table-column>
          <a-table-column label="操作" :width="124" fixed="right">
            <template #default="{ row }">
              <a-space size="mini" :wrap="false">
                <a-button type="text" size="mini" @click="openReviewPreview(row)">预览</a-button>
                <a-button type="primary" size="mini" @click="openReviewDialog(row)">审核</a-button>
              </a-space>
            </template>
          </a-table-column>
        </a-table>
      </div>

      <template v-else-if="selectedProjectId">
        <a-spin :loading="loadingArchive" class="archive-spin">
          <template v-if="archiveTree?.stages?.length">
            <div class="archive-library">
              <aside class="archive-sidebar">
                <div class="archive-sidebar-header">
                  <h3>{{ activeArchiveSection?.stageName || '项目档案' }}</h3>
                  <span>{{ statistics?.completionRate || 0 }}%</span>
                </div>
                <div class="archive-stage-list">
                  <button
                    v-for="section in archiveSections"
                    :key="section.stageCode"
                    class="archive-stage-item"
                    :class="{ active: section.stageCode === activeStage }"
                    type="button"
                    @click="scrollToArchiveStage(section.stageCode)"
                  >
                    <span>{{ section.stageName }}</span>
                    <em>{{ section.completedItems }}/{{ section.totalItems }}</em>
                  </button>
                </div>
              </aside>

              <main class="archive-list-panel">
                <div class="archive-list-toolbar">
                  <div class="toolbar-title">
                    <strong>{{ activeArchiveSection?.stageName || '项目档案' }}</strong>
                    <span>文件上传后进入审批，通过后作为当前可查阅版本。</span>
                  </div>
                  <div class="summary-metrics">
                    <span>总项 <strong>{{ statistics?.totalItems || 0 }}</strong></span>
                    <span>已完成 <strong>{{ statistics?.completedItems || 0 }}</strong></span>
                    <span>必填 <strong>{{ statistics?.requiredItems || 0 }}</strong></span>
                  </div>
                </div>

                <div
                  ref="archiveStreamRef"
                  class="archive-stream"
                  @scroll.passive="updateActiveArchiveStageByScroll"
                >
                  <section
                    v-for="section in archiveSections"
                    :id="`archive-stage-${section.stageCode}`"
                    :key="section.stageCode"
                    class="archive-section"
                  >
                    <a-table
                      :data="section.items"
                      row-key="id"
                      border
                      stripe
                      class="archive-table"
                      empty-text="当前阶段暂无档案项"
                      :pagination="false"
                      :scroll="{ x: 1260 }"
                    >
                      <a-table-column :label="section.stageName" :width="200">
                        <template #default="{ row }">
                          <div class="archive-name-cell">
                            <strong>{{ row.secondName || row.name }}</strong>
                            <span v-if="row.parentName">{{ row.parentName }}</span>
                          </div>
                        </template>
                      </a-table-column>
                      <a-table-column label="上传指导" :width="350" show-overflow-tooltip>
                        <template #default="{ row }">{{ row.guideText }}</template>
                      </a-table-column>
                      <a-table-column label="当前文件" :width="280">
                        <template #default="{ row }">
                          <button
                            v-if="row.files?.length"
                            class="file-link"
                            type="button"
                            @click="openFilePreview(row.files[0])"
                          >
                            {{ row.files[0].originalName }}
                          </button>
                          <span v-else class="muted-text">待上传</span>
                        </template>
                      </a-table-column>
                      <a-table-column label="数量" :width="60" align="center">
                        <template #default="{ row }">{{ row.files?.length || 0 }}</template>
                      </a-table-column>
                      <a-table-column label="状态" :width="86">
                        <template #default="{ row }">
                          <a-tag :type="getStatusTag(row.status).type" size="small">
                            {{ getStatusTag(row.status).label }}
                          </a-tag>
                        </template>
                      </a-table-column>
                      <a-table-column label="负责人" :width="96">
                        <template #default="{ row }">{{ row.responsibleUser?.realName || '-' }}</template>
                      </a-table-column>
                      <a-table-column label="审核人" :width="96">
                        <template #default="{ row }">
                          {{ row.reviewUser?.realName || row.responsibleUser?.realName || '-' }}
                        </template>
                      </a-table-column>
                      <a-table-column label="操作" :width="120" align="center" fixed="right">
                        <template #default="{ row }">
                          <a-button type="text" size="mini" @click="viewItemDetail(row.id)">
                            查看/上传
                          </a-button>
                        </template>
                      </a-table-column>
                    </a-table>
                  </section>
                </div>
              </main>
            </div>
          </template>
          <a-empty v-else description="暂无档案目录，请先生成目录" class="archive-empty" />
        </a-spin>
      </template>
    </a-card>

    <a-modal
      v-model:visible="showGenerateDialog"
      title="生成项目档案目录"
      :width="500"
      :mask-closable="false"
    >
      <a-form :model="{}" label-width="92px">
        <a-form-item label="档案模板">
          <a-select
            v-model="selectedTemplateId"
            :loading="loadingTemplates"
            placeholder="请选择档案模板"
            filterable
          >
            <a-option
              v-for="item in templateList"
              :key="item.id"
              :label="`${item.templateCode} - ${item.templateName}`"
              :value="item.id"
            />
          </a-select>
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="showGenerateDialog = false">取消</a-button>
        <a-button type="primary" :loading="generatingArchive" @click="handleGenerateArchive">
          生成
        </a-button>
      </template>
    </a-modal>

    <a-modal
      v-model:visible="showProjectDetail"
      title="项目详情"
      :width="680"
      :footer="false"
    >
      <a-descriptions
        v-if="selectedProject"
        :column="2"
        bordered
        size="small"
        class="project-detail-descriptions"
      >
        <a-descriptions-item label="项目名称">{{ selectedProject.projectName }}</a-descriptions-item>
        <a-descriptions-item label="项目编号">{{ selectedProject.projectCode }}</a-descriptions-item>
        <a-descriptions-item label="客户">{{ selectedProject.customerName || '-' }}</a-descriptions-item>
        <a-descriptions-item label="国家/城市">
          {{ selectedProject.countryCode || '-' }} / {{ selectedProject.city || '-' }}
        </a-descriptions-item>
        <a-descriptions-item label="项目类型">{{ selectedProject.projectType || '-' }}</a-descriptions-item>
        <a-descriptions-item label="项目状态">
          {{ selectedProject.projectStatus ? localizeProjectStatus(selectedProject.projectStatus, localeStore.currentLocale) : '-' }}
        </a-descriptions-item>
        <a-descriptions-item label="当前阶段">
          {{ selectedProject.currentStage ? localizeProjectStage(selectedProject.currentStage, localeStore.currentLocale) : '-' }}
        </a-descriptions-item>
        <a-descriptions-item label="风险等级">
          {{ selectedProject.riskLevel ? localizeProjectRisk(selectedProject.riskLevel, localeStore.currentLocale) : '-' }}
        </a-descriptions-item>
        <a-descriptions-item label="计划周期" :span="2">
          {{ formatDateOnly(selectedProject.startDate) }} 至 {{ formatDateOnly(selectedProject.plannedEndDate) }}
        </a-descriptions-item>
      </a-descriptions>
    </a-modal>

    <a-modal
      v-model:visible="showItemDetail"
      :title="currentItem?.secondName || currentItem?.name || '档案项详情'"
      :width="920"
      :mask-closable="false"
      :footer="false"
    >
      <a-spin :loading="loadingItem" class="item-detail-spin">
        <div v-if="currentItem" class="item-detail">
          <section class="detail-guide">
            <div>
              <h3>{{ currentItem.secondName || currentItem.name }}</h3>
              <p>{{ currentItem.usageDescription || '请按项目实际情况上传该档案项对应文件。' }}</p>
            </div>
            <div class="detail-meta">
              <a-tag :type="getStatusTag(currentItem.status).type">
                {{ getStatusTag(currentItem.status).label }}
              </a-tag>
              <span>负责人：{{ currentItem.responsibleUser?.realName || '-' }}</span>
              <span>审核人：{{ currentItem.reviewUser?.realName || currentItem.responsibleUser?.realName || '-' }}</span>
            </div>
          </section>

          <FileUploader
            :project-id="selectedProjectId"
            :archive-item-id="currentItem.id"
            :allowed-types="getAllowedTypes(currentItem)"
            @upload-success="handleUploadSuccess"
          />

          <div class="files-block">
            <div class="files-heading">
              <h4>已上传文件</h4>
              <span>{{ currentItem.files?.length || 0 }} 个文件</span>
            </div>
            <a-table
              v-if="currentItem.files?.length"
              :data="currentItem.files"
              row-key="id"
              border
              stripe
              class="file-table"
            >
              <a-table-column label="文件名称" :min-width="260">
                <template #default="{ row }">
                  <button class="file-link" type="button" @click="openFilePreview(row)">
                    {{ row.originalName }}
                  </button>
                </template>
              </a-table-column>
              <a-table-column prop="fileExt" label="格式" :width="70" />
              <a-table-column label="大小" :width="90">
                <template #default="{ row }">{{ formatFileSize(row.fileSize) }}</template>
              </a-table-column>
              <a-table-column prop="versionNo" label="版本" :width="76" />
              <a-table-column label="状态" :width="92">
                <template #default="{ row }">
                  <a-tag :type="getStatusTag(row.fileStatus).type" size="small">
                    {{ getStatusTag(row.fileStatus).label }}
                  </a-tag>
                </template>
              </a-table-column>
              <a-table-column label="上传人" :width="100">
                <template #default="{ row }">{{ row.uploadUser?.realName || '-' }}</template>
              </a-table-column>
              <a-table-column label="上传时间" :width="150">
                <template #default="{ row }">{{ formatDate(row.uploadTime) }}</template>
              </a-table-column>
              <a-table-column label="操作" :width="132" fixed="right">
                <template #default="{ row }">
                  <a-space size="mini" :wrap="false">
                    <a-button type="text" size="mini" @click="downloadFile(row)">下载</a-button>
                    <a-button type="text" status="danger" size="mini" @click="deleteFile(row)">删除</a-button>
                  </a-space>
                </template>
              </a-table-column>
            </a-table>
            <a-empty v-else description="暂无上传文件" class="detail-empty" />
          </div>
        </div>
      </a-spin>
    </a-modal>

    <ReviewDialog
      v-model:visible="reviewDialogVisible"
      :file-id="selectedReviewFileId"
      :file-name="selectedReviewFileName"
      @review-complete="handleReviewComplete"
    />
  </div>
</template>

<style scoped lang="scss" src="./index.scss"></style>
