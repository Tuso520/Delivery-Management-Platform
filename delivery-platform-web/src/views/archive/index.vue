<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { archiveApi } from '@/api/archive'
import { archiveTemplateApi } from '@/api/archive-template'
import { fileApi } from '@/api/file'
import { projectApi } from '@/api/project'
import FileUploader from '@/components/FileUploader/index.vue'
import { arcoConfirm } from '@/utils/arco-dialog'
import { downloadBlob } from '@/utils/blob'
import { localizeProjectStage } from '@/utils/project-localization'
import { useLocaleStore } from '@/store/locale'
import type {
  ArchiveItem,
  ArchiveStatistics,
  ArchiveTemplate,
  ArchiveTreeData,
} from '@/types/archive'
import { ARCHIVE_ITEM_STATUS_OPTIONS } from '@/types/archive'
import type { Project } from '@/types/project'
import type { TagType } from '@/types/ui'
import ProjectRecordsPanel from './components/ProjectRecordsPanel.vue'

type ArchiveFile = NonNullable<ArchiveItem['files']>[number]

interface UploadPoint extends ArchiveItem {
  parentName?: string
  guideText: string
}

const router = useRouter()
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
const activeArchiveView = ref<'directory' | 'records'>('directory')
const showItemDetail = ref(false)
const currentItem = ref<ArchiveItem | null>(null)
const loadingItem = ref(false)

const defaultAllowedTypes = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'jpg', 'jpeg', 'png']

const selectedProjectName = computed(() =>
  projectList.value.find((project) => project.id === selectedProjectId.value)?.projectName || '',
)

const selectedProject = computed(() =>
  projectList.value.find((project) => project.id === selectedProjectId.value),
)

const activeStageName = computed(() =>
  activeStage.value ? localizeProjectStage(activeStage.value, localeStore.currentLocale) : '项目档案',
)

const currentStageItems = computed<UploadPoint[]>(() => {
  if (!archiveTree.value?.stages) return []
  const stage = archiveTree.value.stages.find((item) => item.stageCode === activeStage.value)
  return flattenUploadPoints(stage?.items || [])
})

async function fetchProjects(): Promise<void> {
  loadingProjects.value = true
  try {
    const res = await projectApi.getList({ page: 1, pageSize: 100 })
    const data = res as unknown as { list: Project[] }
    projectList.value = data.list || []
    if (!selectedProjectId.value && projectList.value.length) {
      selectedProjectId.value = projectList.value[0].id
      await fetchArchive()
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
        || (parentName ? `请上传“${parentName}”下的“${name}”相关文件。` : `请上传“${name}”对应文件。`),
    }]
  })
}

function handleProjectChange(): void {
  activeArchiveView.value = 'directory'
  fetchArchive()
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
  Message.success('文件已上传，并自动进入审批流')
  await reloadCurrentItem()
}

async function openFilePreview(file: ArchiveFile): Promise<void> {
  let previewWindow: Window | null = window.open('about:blank', '_blank')
  if (previewWindow) {
    previewWindow.opener = null
  }
  try {
    const { url } = await fileApi.createPreviewLink(file.id)
    if (previewWindow) {
      previewWindow.location.href = url
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  } catch {
    previewWindow?.close()
    Message.error('预览链接生成失败')
  }
}

async function downloadFile(file: ArchiveFile): Promise<void> {
  downloadBlob(await fileApi.download(file.id), file.originalName)
}

async function deleteFile(file: ArchiveFile): Promise<void> {
  await arcoConfirm(`确定删除文件“${file.originalName}”？`, '确认删除', {
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

function navigateToProject(): void {
  if (selectedProjectId.value) {
    router.push(`/project/detail/${selectedProjectId.value}`)
  }
}

onMounted(fetchProjects)
</script>

<template>
  <div class="archive-page">
    <a-card class="archive-shell" :bordered="false">
      <div class="archive-topbar">
        <div class="project-picker">
          <span>项目</span>
          <a-select
            v-model="selectedProjectId"
            v-loading="loadingProjects"
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
        </div>

        <div class="archive-actions">
          <a-segmented
            v-model="activeArchiveView"
            size="small"
            :options="[
              { label: '档案目录', value: 'directory' },
              { label: '上传记录', value: 'records' },
            ]"
          />
          <a-button size="small" :disabled="!selectedProjectId" @click="navigateToProject">
            项目详情
          </a-button>
          <a-button size="small" type="primary" :disabled="!selectedProjectId" @click="openGenerateDialog">
            生成目录
          </a-button>
        </div>
      </div>

      <div v-if="selectedProjectId" class="archive-summary">
        <div>
          <strong>{{ selectedProject?.projectName || selectedProjectName }}</strong>
          <span>{{ selectedProject?.projectCode || '-' }}</span>
        </div>
        <div class="summary-metrics">
          <span>总项 {{ statistics?.totalItems || 0 }}</span>
          <span>已完成 {{ statistics?.completedItems || 0 }}</span>
          <span>必填 {{ statistics?.requiredItems || 0 }}</span>
          <span>完成率 {{ statistics?.completionRate || 0 }}%</span>
        </div>
      </div>

      <ProjectRecordsPanel
        v-if="activeArchiveView === 'records' && selectedProjectId"
        :project-id="selectedProjectId"
        :project-name="selectedProjectName"
      />

      <template v-else-if="selectedProjectId">
        <a-spin :loading="loadingArchive" class="archive-spin">
          <template v-if="archiveTree?.stages?.length">
            <a-tabs v-model="activeStage" type="card" class="stage-tabs">
              <a-tab-pane
                v-for="stage in archiveTree.stages"
                :key="stage.stageCode"
                :name="stage.stageCode"
              >
                <template #title>
                  <span class="stage-tab-label">
                    {{ localizeProjectStage(stage.stageCode, localeStore.currentLocale) }}
                    <a-tag v-if="getStageStats(stage.stageCode)" size="small" class="stage-count">
                      {{ getStageStats(stage.stageCode)?.completedItems || 0 }}/{{ getStageStats(stage.stageCode)?.totalItems || 0 }}
                    </a-tag>
                  </span>
                </template>
              </a-tab-pane>
            </a-tabs>

            <div class="stage-title-row">
              <h3>{{ activeStageName }}</h3>
              <span>点击“查看/上传”进入上传、预览、下载和审批状态核查。</span>
            </div>

            <a-table
              :data="currentStageItems"
              row-key="id"
              border
              stripe
              class="archive-table"
              empty-text="当前阶段暂无档案项"
            >
              <a-table-column label="档案项" :min-width="260">
                <template #default="{ row }">
                  <div class="archive-name-cell">
                    <strong>{{ row.secondName || row.name }}</strong>
                    <span v-if="row.parentName">{{ row.parentName }}</span>
                  </div>
                </template>
              </a-table-column>
              <a-table-column label="上传指导" :min-width="360" show-overflow-tooltip>
                <template #default="{ row }">
                  <span>{{ row.guideText }}</span>
                </template>
              </a-table-column>
              <a-table-column label="文件" :width="72" align="center">
                <template #default="{ row }">
                  {{ row.files?.length || 0 }}
                </template>
              </a-table-column>
              <a-table-column label="状态" :width="100">
                <template #default="{ row }">
                  <a-tag :type="getStatusTag(row.status).type" size="small">
                    {{ getStatusTag(row.status).label }}
                  </a-tag>
                </template>
              </a-table-column>
              <a-table-column label="负责人" :width="110">
                <template #default="{ row }">
                  {{ row.responsibleUser?.realName || '-' }}
                </template>
              </a-table-column>
              <a-table-column label="审核人" :width="110">
                <template #default="{ row }">
                  {{ row.reviewUser?.realName || row.responsibleUser?.realName || '-' }}
                </template>
              </a-table-column>
              <a-table-column label="操作" :width="110" align="center" fixed="right">
                <template #default="{ row }">
                  <a-button type="text" size="mini" @click="viewItemDetail(row.id)">
                    查看/上传
                  </a-button>
                </template>
              </a-table-column>
            </a-table>
          </template>
          <a-empty v-else description="暂无档案目录，请先生成目录" class="archive-empty" />
        </a-spin>
      </template>
    </a-card>

    <a-dialog
      v-model="showGenerateDialog"
      title="生成项目档案目录"
      width="500px"
      :close-on-click-modal="false"
    >
      <a-form :model="{}" label-width="92px">
        <a-form-item label="档案模板">
          <a-select
            v-model="selectedTemplateId"
            v-loading="loadingTemplates"
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
    </a-dialog>

    <a-dialog
      v-model="showItemDetail"
      :title="currentItem?.secondName || currentItem?.name || '档案项详情'"
      width="920px"
      :close-on-click-modal="false"
    >
      <a-spin :loading="loadingItem">
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
            :allowed-types="defaultAllowedTypes"
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
              <a-table-column label="文件名" :min-width="260">
                <template #default="{ row }">
                  <button class="file-link" type="button" @click="openFilePreview(row)">
                    {{ row.originalName }}
                  </button>
                </template>
              </a-table-column>
              <a-table-column prop="fileExt" label="格式" :width="70" />
              <a-table-column label="大小" :width="90">
                <template #default="{ row }">
                  {{ formatFileSize(row.fileSize) }}
                </template>
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
                <template #default="{ row }">
                  {{ row.uploadUser?.realName || '-' }}
                </template>
              </a-table-column>
              <a-table-column label="上传时间" :width="150">
                <template #default="{ row }">
                  {{ formatDate(row.uploadTime) }}
                </template>
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
    </a-dialog>
  </div>
</template>

<style scoped lang="scss" src="./index.scss"></style>
