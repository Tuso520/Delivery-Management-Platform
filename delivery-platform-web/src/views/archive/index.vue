<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { archiveApi } from '@/api/archive'
import { archiveTemplateApi } from '@/api/archive-template'
import type {
  ArchiveTreeData,
  ArchiveItem,
  ArchiveStatistics,
  ArchiveTemplate,
} from '@/types/archive'
import { ARCHIVE_ITEM_STATUS_OPTIONS } from '@/types/archive'
import { projectApi } from '@/api/project'
import type { Project } from '@/types/project'
import type { TagType } from '@/types/ui'
import { useLocaleStore } from '@/store/locale'
import { localizeProjectStage } from '@/utils/project-localization'
import ProjectRecordsPanel from './components/ProjectRecordsPanel.vue'
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
const showItemDetail = ref(false)
const currentItem = ref<ArchiveItem | null>(null)
const loadingItem = ref(false)
const activeStage = ref('')
const activeArchiveView = ref<'directory' | 'records'>('directory')
const fetchProjects = async () => {
  loadingProjects.value = true
  try {
    const res = await projectApi.getList({ page: 1, pageSize: 100 })
    const data = res as unknown as { list: Project[] }
    projectList.value = data.list || []
  } catch {
    projectList.value = []
  } finally {
    loadingProjects.value = false
  }
}
const fetchArchive = async () => {
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
    if (archiveTree.value?.stages?.length > 0) {
      activeStage.value = archiveTree.value.stages[0].stageCode
    }
  } catch {
    archiveTree.value = null
    statistics.value = null
  } finally {
    loadingArchive.value = false
  }
}
const fetchTemplates = async () => {
  loadingTemplates.value = true
  try {
    const res = await archiveTemplateApi.getList()
    templateList.value = res as unknown as ArchiveTemplate[]
  } catch {
    templateList.value = []
  } finally {
    loadingTemplates.value = false
  }
}
const handleProjectChange = () => {
  fetchArchive()
}
const handleGenerateArchive = async () => {
  if (!selectedTemplateId.value) {
    Message.warning('请选择档案模板')
    return
  }
  generatingArchive.value = true
  try {
    await archiveApi.generate(selectedProjectId.value, selectedTemplateId.value)
    Message.success('档案目录生成成功')
    showGenerateDialog.value = false
    fetchArchive()
  } catch { return } finally {
    generatingArchive.value = false
  }
}
const openGenerateDialog = () => {
  selectedTemplateId.value = ''
  fetchTemplates()
  showGenerateDialog.value = true
}
const viewItemDetail = async (itemId: string) => {
  loadingItem.value = true
  showItemDetail.value = true
  try {
    const res = await archiveApi.getItem(itemId)
    currentItem.value = res as unknown as ArchiveItem
  } catch {
    currentItem.value = null
  } finally {
    loadingItem.value = false
  }
}
const handleMarkNotApplicable = async (itemId: string) => {
  try {
    await arcoConfirm('确定标记此项“不适用”？', '确认', { type: 'warning' })
    await archiveApi.markNotApplicable(itemId)
    Message.success('标记成功')
    fetchArchive()
  } catch { return }
}
const handleUpdateStatus = async (itemId: string, status: string) => {
  try {
    await archiveApi.updateItem(itemId, { status })
    Message.success('状态更新成功')
    fetchArchive()
  } catch { return }
}
const getStatusTag = (status: string): { type: TagType; label: string } => {
  const option = ARCHIVE_ITEM_STATUS_OPTIONS.find((o) => o.value === status)
  return {
    type: (option?.type || 'info') as TagType,
    label: option?.label || status,
  }
}
const currentStageItems = computed(() => {
  if (!archiveTree.value?.stages) return []
  const stage = archiveTree.value.stages.find((s) => s.stageCode === activeStage.value)
  return (stage?.items || []).map((item) => ({
    ...item,
    usageDescription: [
      item.usageDescription,
      ...(item.children || []).map((child) =>
        `${child.secondName || child.name}${child.usageDescription ? `：${child.usageDescription}` : ''}`,
      ),
    ].filter(Boolean).join('；'),
  }))
})
const getStageStats = (stageCode: string) => {
  return statistics.value?.stages.find((stage) => stage.stageCode === stageCode)
}
const selectedProjectName = computed(() =>
  projectList.value.find((project) => project.id === selectedProjectId.value)?.projectName || '',
)
const navigateToProject = () => {
  if (selectedProjectId.value) {
    router.push(`/project/detail/${selectedProjectId.value}`)
  }
}
onMounted(() => {
  fetchProjects()
})
</script>
<template>
  <div class="archive-page">
    <a-card class="selector-card">
      <a-form :model="{}" inline label-width="auto">
        <a-form-item label="选择项目">
          <a-select
            v-model="selectedProjectId"
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
        </a-form-item>
        <a-form-item>
          <a-button type="primary" :disabled="!selectedProjectId" @click="openGenerateDialog">
            生成档案目录
          </a-button>
          <a-button
            :disabled="!selectedProjectId"
            @click="activeArchiveView = 'records'"
          >
            上传记录
          </a-button>
        </a-form-item>
      </a-form>
    </a-card>
    <a-card v-if="statistics && selectedProjectId" class="stats-card">
      <div class="stats-row">
        <div class="stat-item">
          <div class="stat-value">
            {{ statistics.totalItems }}
          </div>
          <div class="stat-label">
            总项数          </div>
        </div>
        <div class="stat-item">
          <div class="stat-value success">
            {{ statistics.completedItems }}
          </div>
          <div class="stat-label">
            已完成          </div>
        </div>
        <div class="stat-item">
          <div class="stat-value warning">
            {{ statistics.totalItems - statistics.completedItems }}
          </div>
          <div class="stat-label">
            未完成          </div>
        </div>
        <div class="stat-item">
          <div class="stat-value">
            {{ statistics.requiredItems }}
          </div>
          <div class="stat-label">
            必填项          </div>
        </div>
        <div class="stat-item">
          <div class="stat-value primary">
            {{ statistics.starItems }}
          </div>
          <div class="stat-label">
            星标项          </div>
        </div>
        <div class="stat-item">
          <div class="stat-value" :class="statistics.completionRate >= 80 ? 'success' : 'warning'">
            {{ statistics.completionRate }}%
          </div>
          <div class="stat-label">
            完成率          </div>
        </div>
      </div>
    </a-card>
    <a-card v-if="selectedProjectId" v-loading="loadingArchive">
      <template #header>
        <div class="archive-header">
          <a-segmented
            v-model="activeArchiveView"
            :options="[
              { label: '档案目录', value: 'directory' },
               { label: '项目记录', value: 'records' },
            ]"
          />
          <a-button
            v-if="selectedProjectId"
            text
            type="primary"
            @click="navigateToProject"
          >
            查看项目详情
          </a-button>
        </div>
      </template>
      <ProjectRecordsPanel
        v-if="activeArchiveView === 'records'"
        :project-id="selectedProjectId"
        :project-name="selectedProjectName"
      />
      <template v-else-if="archiveTree && archiveTree.stages && archiveTree.stages.length > 0">
        <a-tabs v-model="activeStage" type="card">
          <a-tab-pane
            v-for="stage in archiveTree.stages"
            :key="stage.stageCode"
            :label="stage.stageCode"
            :name="stage.stageCode"
          >
            <template #label>
              <span class="stage-tab-label">
                {{ localizeProjectStage(stage.stageCode, localeStore.currentLocale) }}
                <a-tag
                  v-if="getStageStats(stage.stageCode)"
                  size="small"
                  :type="(getStageStats(stage.stageCode)?.completionRate || 0) >= 80 ? 'success' : 'warning'"
                  class="stage-count"
                >
                  {{ getStageStats(stage.stageCode)?.completedItems || 0 }}/{{ getStageStats(stage.stageCode)?.totalItems || 0 }}
                </a-tag>
              </span>
            </template>
          </a-tab-pane>
        </a-tabs>
        <div class="stage-items">
          <a-table
            :data="currentStageItems"
            row-key="id"
            default-expand-all
            :tree-props="{ children: 'children' }"
            border
            stripe
            style="width: 100%"
          >
            <a-table-column prop="itemNo" label="序号" :width="60" />
            <a-table-column
              prop="name"
              label="档案项名称"
              :min-width="260"
              show-overflow-tooltip
            >
              <template #default="{ row }">
                <div class="archive-name" :class="{ child: row.level > 1 }">
                  <a-icon v-if="row.level === 1">
                    <Folder />
                  </a-icon>
                  <a-icon v-else>
                    <Document />
                  </a-icon>
                  <span>{{ row.secondName || row.name }}</span>
                </div>
              </template>
            </a-table-column>
            <a-table-column
              prop="usageDescription"
              label="内容要求"
              :min-width="360"
              show-overflow-tooltip
            />
            <a-table-column
              prop="isRequired"
              label="必填"
              :width="60"
              align="center"
            >
              <template #default="{ row }">
                <a-tag v-if="row.isRequired" color="red" size="small">
                  是                </a-tag>
                <span v-else>否</span>
              </template>
            </a-table-column>
            <a-table-column
              prop="isStar"
              label="星标"
              :width="60"
              align="center"
            >
              <template #default="{ row }">
                <a-tag v-if="row.isStar" color="orange" size="small">
                  是                </a-tag>
                <span v-else>-</span>
              </template>
            </a-table-column>
            <a-table-column label="状态" :width="120">
              <template #default="{ row }">
                <a-tag :type="getStatusTag(row.status).type" size="small">
                  {{ getStatusTag(row.status).label }}
                </a-tag>
              </template>
            </a-table-column>
            <a-table-column label="负责人" :width="120">
              <template #default="{ row }">
                <span>{{ row.responsibleUser?.realName || '-' }}</span>
              </template>
            </a-table-column>
            <a-table-column label="审核人" :width="120">
              <template #default="{ row }">
                <span>{{ row.reviewUser?.realName || '-' }}</span>
              </template>
            </a-table-column>
            <a-table-column label="操作" :width="220" fixed="right">
              <template #default="{ row }">
                <a-button
                  text
                  type="primary"
                  size="small"
                  @click="viewItemDetail(row.id)"
                >
                  查看
                </a-button>
                <a-button
                  v-if="row.status !== 'NotApplicable' && row.status !== 'Approved'"
                  text
                  status="warning" type="secondary"
                  size="small"
                  @click="handleMarkNotApplicable(row.id)"
                >
                  标记不适用
                </a-button>
                <a-button
                  v-if="row.status === 'Uploaded' || row.status === 'Reviewing'"
                  text
                  status="success" type="secondary"
                  size="small"
                  @click="handleUpdateStatus(row.id, 'Approved')"
                >
                  通过
                </a-button>
              </template>
            </a-table-column>
          </a-table>
        </div>
      </template>
      <a-empty v-else description="暂无档案目录，请先生成" />
    </a-card>
    <a-dialog
      v-model="showGenerateDialog"
      title="生成档案目录"
      width="500px"
      :close-on-click-modal="false"
    >
      <a-form :model="{}" label-width="100px">
        <a-form-item label="选择模板">
          <a-select
            v-model="selectedTemplateId"
            v-loading="loadingTemplates"
            placeholder="请选择档案模板"
            style="width: 100%"
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
        <a-button @click="showGenerateDialog = false">
          取消
        </a-button>
        <a-button type="primary" :loading="generatingArchive" @click="handleGenerateArchive">
          生成
        </a-button>
      </template>
    </a-dialog>
    <a-dialog
      v-model="showItemDetail"
      :title="currentItem?.name || '档案项详情'"
      width="700px"
      :close-on-click-modal="false"
    >
      <div v-if="currentItem" v-loading="loadingItem">
        <a-descriptions :column="2" border>
          <a-descriptions-item label="名称" :span="2">
            {{ currentItem.name }}
          </a-descriptions-item>
          <a-descriptions-item label="第二名称" :span="2">
            {{ currentItem.secondName || '-' }}
          </a-descriptions-item>
          <a-descriptions-item label="阶段">
            {{ currentItem.stageCode }}
          </a-descriptions-item>
          <a-descriptions-item label="层级">
            L{{ currentItem.level }}
          </a-descriptions-item>
          <a-descriptions-item label="必填">
            <a-tag v-if="currentItem.isRequired" color="red" size="small">
              是            </a-tag>
            <span v-else>否</span>
          </a-descriptions-item>
          <a-descriptions-item label="星标">
            <a-tag v-if="currentItem.isStar" color="orange" size="small">
              是            </a-tag>
            <span v-else>否</span>
          </a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :type="getStatusTag(currentItem.status).type" size="small">
              {{ getStatusTag(currentItem.status).label }}
            </a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="需审核">
            {{ currentItem.needReview ? '是' : '否' }}
          </a-descriptions-item>
          <a-descriptions-item label="负责人">
            {{ currentItem.responsibleUser?.realName || '-' }}
          </a-descriptions-item>
          <a-descriptions-item label="审核人">
            {{ currentItem.reviewUser?.realName || '-' }}
          </a-descriptions-item>
        </a-descriptions>
        <a-divider v-if="currentItem.usageDescription" />
        <p v-if="currentItem.usageDescription" class="usage-desc">
          <strong>用途说明：</strong>{{ currentItem.usageDescription }}
        </p>
        <a-divider />
        <h4 class="files-title">
          已上传文件        </h4>
        <a-table
          v-if="currentItem.files && currentItem.files.length > 0"
          :data="currentItem.files"
          border
          stripe
        >
          <a-table-column
            prop="originalName"
            label="文件名"
            :min-width="200"
            show-overflow-tooltip
          />
          <a-table-column prop="versionNo" label="版本" :width="80" />
          <a-table-column prop="fileStatus" label="文件状态" :width="100" />
          <a-table-column prop="uploadTime" label="上传时间" :width="170">
            <template #default="{ row }">
              {{ new Date(row.uploadTime).toLocaleString() }}
            </template>
          </a-table-column>
        </a-table>
        <a-empty v-else description="暂无上传文件" />
      </div>
    </a-dialog>
  </div>
</template>
<style scoped lang="scss" src="./index.scss"></style>
