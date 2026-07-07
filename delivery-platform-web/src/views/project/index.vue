<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm } from '@/utils/arco-dialog'
import { projectApi } from '@/api/project'
import type { Project, QueryProjectDto } from '@/types/project'
import { PROJECT_TYPE_OPTIONS, COUNTRY_OPTIONS } from '@/types/project'
import type { TagType } from '@/types/ui'
import { useLocaleStore } from '@/store/locale'
import {
  localizeProjectRisk,
  localizeProjectStage,
  localizeProjectStatus,
} from '@/utils/project-localization'

const router = useRouter()
const localeStore = useLocaleStore()

const loading = ref(false)
const projectList = ref<Project[]>([])
const pagination = ref({ page: 1, pageSize: 20, total: 0, totalPages: 0 })
const searchForm = ref<QueryProjectDto>({
  page: 1,
  pageSize: 20,
  keyword: '',
  projectStatus: undefined,
  countryCode: undefined,
  projectType: undefined,
})

const fetchProjects = async () => {
  loading.value = true
  try {
    const res = await projectApi.getList(searchForm.value)
    const data = res as unknown as { list: Project[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
    projectList.value = data.list
    pagination.value = data.pagination
  } catch {
    projectList.value = []
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  searchForm.value.page = 1
  fetchProjects()
}

const handleReset = () => {
  searchForm.value.keyword = ''
  searchForm.value.projectStatus = undefined
  searchForm.value.countryCode = undefined
  searchForm.value.projectType = undefined
  searchForm.value.page = 1
  fetchProjects()
}

const handlePageChange = (page: number) => {
  searchForm.value.page = page
  fetchProjects()
}

const handleSizeChange = (pageSize: number) => {
  searchForm.value.pageSize = pageSize
  searchForm.value.page = 1
  fetchProjects()
}

const handleCreate = () => {
  router.push('/project/create')
}

const handleView = (row: Project) => {
  router.push(`/project/detail/${row.id}`)
}

const handleEdit = (row: Project) => {
  router.push(`/project/edit/${row.id}`)
}

const handleDelete = async (row: Project) => {
  try {
    await arcoConfirm(`确定删除项目"${row.projectName}"？`, '确认删除', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    })
    await projectApi.delete(row.id)
    Message.success('删除成功')
    fetchProjects()
  } catch {
    // cancelled or error
  }
}

const getStatusType = (status: string): TagType => {
  const statusMap: Record<string, TagType> = {
    Draft: 'info',
    Active: 'success',
    Suspended: 'warning',
    Delayed: 'danger',
    Accepted: 'success',
    Archived: 'info',
    Closed: 'info',
  }
  return statusMap[status] || 'info'
}

const getStatusLabel = (status: string): string => {
  return localizeProjectStatus(status, localeStore.currentLocale)
}

const getRiskType = (level: string): TagType => {
  const riskMap: Record<string, TagType> = {
    Low: 'success',
    Medium: 'warning',
    High: 'danger',
    Critical: 'danger',
  }
  return riskMap[level] || 'info'
}

const getCountryLabel = (code: string): string => {
  const option = COUNTRY_OPTIONS.find((o) => o.value === code)
  return option?.label || code
}

const getTypeLabel = (type: string): string => {
  const option = PROJECT_TYPE_OPTIONS.find((o) => o.value === type)
  return option?.label || type
}

const getStageLabel = (stage: string): string => {
  return localizeProjectStage(stage, localeStore.currentLocale)
}

const getMemberName = (project: Project, role: string): string => {
  const matchingMembers = project.members?.filter(
    (member) => member.projectRole === role,
  ) || []
  return (
    matchingMembers.find((member) => member.user?.username !== 'admin')?.user?.realName ||
    matchingMembers[0]?.user?.realName ||
    '-'
  )
}

const formatAmount = (value?: number): string => {
  if (value === undefined || value === null) return '-'
  return new Intl.NumberFormat(localeStore.currentLocale, {
    maximumFractionDigits: 0,
  }).format(Number(value))
}

onMounted(() => {
  fetchProjects()
})
</script>

<template>
  <div class="project-page">
    <a-card class="search-card">
      <div class="project-search-row">
        <div class="project-search-left">
          <a-form :model="searchForm" inline label-width="auto" class="project-search-form">
            <a-form-item label="关键词" class="keyword-item">
              <a-input
                v-model="searchForm.keyword"
                placeholder="项目名称或客户名称"
                clearable
                class="keyword-input"
                @keyup.enter="handleSearch"
              />
            </a-form-item>
          </a-form>
          <a-button type="primary" @click="handleSearch">查询</a-button>
          <a-button class="reset-button" @click="handleReset">重置</a-button>
        </div>
        <div class="project-search-actions">
          <a-button type="primary" @click="handleCreate">新建项目</a-button>
        </div>
      </div>
    </a-card>

    <!-- Table -->
    <a-card class="project-table-card">
      <div class="project-table-shell">
        <a-table
          v-loading="loading"
          :data="projectList"
          border
          stripe
          :scroll="{ x: 1700 }"
          style="width: 100%"
        >
        <a-table-column
          prop="projectName"
          label="项目名称"
          :width="250"
          show-overflow-tooltip
        />
        <a-table-column prop="countryCode" label="国家" :width="92">
          <template #default="{ row }">
            <span>{{ getCountryLabel(row.countryCode) }}</span>
          </template>
        </a-table-column>
        <a-table-column prop="projectType" label="项目类型" :width="118">
          <template #default="{ row }">
            <span>{{ getTypeLabel(row.projectType || '') }}</span>
          </template>
        </a-table-column>
        <a-table-column prop="projectStatus" label="状态" :width="100">
          <template #default="{ row }">
            <a-tag :type="getStatusType(row.projectStatus)" size="small">
              {{ getStatusLabel(row.projectStatus) }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column prop="riskLevel" label="风险等级" :width="100">
          <template #default="{ row }">
            <a-tag :type="getRiskType(row.riskLevel)" size="small">
              {{ localizeProjectRisk(row.riskLevel, localeStore.currentLocale) }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column prop="currentStage" label="当前阶段" :width="128">
          <template #default="{ row }">
            <span>{{ getStageLabel(row.currentStage || '') }}</span>
          </template>
        </a-table-column>
        <a-table-column
          prop="contractAmount"
          label="合同金额"
          :width="150"
          align="right"
        >
          <template #default="{ row }">
            <span v-if="row.contractAmount !== null">
              {{ row.contractCurrency }} {{ formatAmount(row.contractAmount) }}
            </span>
            <span v-else>-</span>
          </template>
        </a-table-column>
        <a-table-column label="折算人民币" :width="150" align="right">
          <template #default="{ row }">
            <span class="amount-cny">¥ {{ formatAmount(row.convertedAmount) }}</span>
          </template>
        </a-table-column>
        <a-table-column label="销售负责人" :width="112">
          <template #default="{ row }">
            {{ getMemberName(row, 'SALES_OWNER') }}
          </template>
        </a-table-column>
        <a-table-column label="项目经理" :width="110">
          <template #default="{ row }">
            {{ getMemberName(row, 'PROJECT_MANAGER') }}
          </template>
        </a-table-column>
        <a-table-column label="电气负责人" :width="112">
          <template #default="{ row }">
            {{ getMemberName(row, 'ELEC_LEADER') }}
          </template>
        </a-table-column>
        <a-table-column label="软件负责人" :width="112">
          <template #default="{ row }">
            {{ getMemberName(row, 'SOFTWARE_LEADER') }}
          </template>
        </a-table-column>
        <a-table-column label="操作" :width="172" fixed="right">
          <template #default="{ row }">
            <a-button
              text
              type="primary"
              size="small"
              @click="handleView(row)"
            >
              查看
            </a-button>
            <a-button
              text
              type="primary"
              size="small"
              @click="handleEdit(row)"
            >
              编辑
            </a-button>
            <a-button
              text
              status="danger" type="secondary"
              size="small"
              @click="handleDelete(row)"
            >
              删除
            </a-button>
          </template>
          </a-table-column>
        </a-table>
      </div>

      <!-- Pagination -->
      <div class="pagination-wrapper">
        <a-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </a-card>
  </div>
</template>

<style scoped lang="scss">
.amount-cny {
  color: var(--app-text);
  font-weight: 600;
  white-space: nowrap;
}

.project-page {
  min-width: 0;
}

.project-table-card :deep(.arco-card-body) {
  padding: 8px;
}

.project-table-shell {
  min-width: 0;
  border-radius: 0;
}

.project-table-shell :deep(.arco-table) {
  border-radius: 0;
}

.project-table-shell :deep(.arco-table-container),
.project-table-shell :deep(.arco-table-content),
.project-table-shell :deep(.arco-scrollbar-container) {
  min-width: 0;
}

.project-table-shell :deep(.arco-table-element) {
  min-width: 1700px;
  table-layout: fixed;
}

.project-table-shell :deep(.arco-table-th),
.project-table-shell :deep(.arco-table-td),
.project-table-shell :deep(.arco-table-cell),
.project-table-shell :deep(.arco-table-td-content),
.project-table-shell :deep(.arco-table-th-title) {
  white-space: nowrap !important;
  word-break: keep-all !important;
  overflow-wrap: normal !important;
}

.project-table-shell :deep(.arco-table-cell) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-table-shell :deep(.arco-table-th),
.project-table-shell :deep(.arco-table-cell) {
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.45;
}

.project-table-shell :deep(.arco-table-td) {
  vertical-align: middle;
}

.project-table-shell :deep(.arco-tag) {
  border-radius: 0;
}

.project-search-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.project-search-left {
  min-width: 0;
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
}

.project-search-form {
  min-width: 0;
  flex: 0 1 460px;
}

.keyword-item {
  width: min(460px, 100%);
  margin-bottom: 0 !important;
}

.keyword-input {
  width: 100% !important;
}

.project-search-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 12px;
}

.reset-button {
  margin-left: 4px;
}

.project-search-actions .arco-btn + .arco-btn {
  margin-left: 2px;
}

@media (max-width: 760px) {
  .project-search-row {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .project-search-left {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .keyword-item {
    width: 100%;
  }

  .project-search-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>
