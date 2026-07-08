<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm } from '@/utils/arco-dialog'
import { projectApi } from '@/api/project'
import type { Project, QueryProjectDto } from '@/types/project'
import { COUNTRY_OPTIONS, PROJECT_TYPE_OPTIONS } from '@/types/project'
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
})

async function fetchProjects() {
  loading.value = true
  try {
    const res = await projectApi.getList(searchForm.value)
    const data = res as unknown as {
      list: Project[]
      pagination: { page: number; pageSize: number; total: number; totalPages: number }
    }
    projectList.value = data.list
    pagination.value = data.pagination
  } catch {
    projectList.value = []
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  searchForm.value.page = 1
  fetchProjects()
}

function handleReset() {
  searchForm.value.keyword = ''
  searchForm.value.page = 1
  fetchProjects()
}

function handlePageChange(page: number) {
  searchForm.value.page = page
  fetchProjects()
}

function handleSizeChange(pageSize: number) {
  searchForm.value.pageSize = pageSize
  searchForm.value.page = 1
  fetchProjects()
}

function handleCreate() {
  router.push('/project/create')
}

function handleView(row: Project) {
  router.push(`/project/detail/${row.id}`)
}

function handleEdit(row: Project) {
  router.push(`/project/edit/${row.id}`)
}

async function handleDelete(row: Project) {
  try {
    await arcoConfirm(`确定删除项目「${row.projectName}」？`, '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await projectApi.delete(row.id)
    Message.success('删除成功')
    fetchProjects()
  } catch {
    // canceled
  }
}

function getStatusType(status: string): TagType {
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

function getRiskType(level: string): TagType {
  const riskMap: Record<string, TagType> = {
    Low: 'success',
    Medium: 'warning',
    High: 'danger',
    Critical: 'danger',
  }
  return riskMap[level] || 'info'
}

function getCountryLabel(code: string): string {
  return COUNTRY_OPTIONS.find((item) => item.value === code)?.label || code
}

function getTypeLabel(type?: string): string {
  if (!type) return '-'
  return PROJECT_TYPE_OPTIONS.find((item) => item.value === type)?.label || type
}

function getMemberName(project: Project, role: string): string {
  const matchingMembers = project.members?.filter((member) => member.projectRole === role) || []
  return (
    matchingMembers.find((member) => member.user?.username !== 'admin')?.user?.realName ||
    matchingMembers[0]?.user?.realName ||
    '-'
  )
}

function formatAmount(value?: number): string {
  if (value === undefined || value === null) return '-'
  return new Intl.NumberFormat(localeStore.currentLocale, {
    maximumFractionDigits: 0,
  }).format(Number(value))
}

onMounted(fetchProjects)
</script>

<template>
  <div class="project-page">
    <a-card class="project-toolbar-card" :bordered="false">
      <div class="project-toolbar">
        <a-input
          v-model="searchForm.keyword"
          placeholder="输入项目名称、编号或客户名称"
          allow-clear
          class="project-keyword"
          @keyup.enter="handleSearch"
        >
          <template #prefix>
            <Search />
          </template>
        </a-input>
        <a-button type="primary" @click="handleSearch">查询</a-button>
        <a-button class="reset-button" @click="handleReset">重置</a-button>
        <a-button type="primary" class="create-button" @click="handleCreate">
          新建项目
        </a-button>
      </div>
    </a-card>

    <a-card class="project-table-card" :bordered="false">
      <a-table
        :loading="loading"
        :data="projectList"
        row-key="id"
        border
        stripe
        :scroll="{ x: 1660 }"
        class="project-table"
      >
        <a-table-column prop="projectName" label="项目名称" :width="230" show-overflow-tooltip />
        <a-table-column prop="projectCode" label="项目编号" :width="130" show-overflow-tooltip />
        <a-table-column prop="countryCode" label="国家" :width="78">
          <template #default="{ row }">
            {{ getCountryLabel(row.countryCode) }}
          </template>
        </a-table-column>
        <a-table-column prop="projectType" label="项目类型" :width="96">
          <template #default="{ row }">
            {{ getTypeLabel(row.projectType) }}
          </template>
        </a-table-column>
        <a-table-column prop="projectStatus" label="状态" :width="82" align="center">
          <template #default="{ row }">
            <a-tag :type="getStatusType(row.projectStatus)" size="small">
              {{ localizeProjectStatus(row.projectStatus, localeStore.currentLocale) }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column prop="riskLevel" label="风险" :width="64" align="center">
          <template #default="{ row }">
            <a-tag :type="getRiskType(row.riskLevel)" size="small">
              {{ localizeProjectRisk(row.riskLevel, localeStore.currentLocale) }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column prop="currentStage" label="当前阶段" :width="130">
          <template #default="{ row }">
            {{ localizeProjectStage(row.currentStage || '', localeStore.currentLocale) }}
          </template>
        </a-table-column>
        <a-table-column prop="contractAmount" label="合同金额" :width="142" align="right">
          <template #default="{ row }">
            <span v-if="row.contractAmount !== null">
              {{ row.contractCurrency }} {{ formatAmount(row.contractAmount) }}
            </span>
            <span v-else>-</span>
          </template>
        </a-table-column>
        <a-table-column label="折算人民币" :width="142" align="right">
          <template #default="{ row }">
            <span class="amount-cny">¥ {{ formatAmount(row.convertedAmount) }}</span>
          </template>
        </a-table-column>
        <a-table-column label="销售负责人" :width="112">
          <template #default="{ row }">{{ getMemberName(row, 'SALES_OWNER') }}</template>
        </a-table-column>
        <a-table-column label="项目经理" :width="110">
          <template #default="{ row }">{{ getMemberName(row, 'PROJECT_MANAGER') }}</template>
        </a-table-column>
        <a-table-column label="电气负责人" :width="112">
          <template #default="{ row }">{{ getMemberName(row, 'ELEC_LEADER') }}</template>
        </a-table-column>
        <a-table-column label="软件负责人" :width="112">
          <template #default="{ row }">{{ getMemberName(row, 'SOFTWARE_LEADER') }}</template>
        </a-table-column>
        <a-table-column label="操作" :width="156" fixed="right" align="center">
          <template #default="{ row }">
            <a-space size="mini" :wrap="false">
              <a-button type="text" size="mini" @click="handleView(row)">查看</a-button>
              <a-button type="text" size="mini" @click="handleEdit(row)">编辑</a-button>
              <a-button type="text" status="danger" size="mini" @click="handleDelete(row)">
                删除
              </a-button>
            </a-space>
          </template>
        </a-table-column>
      </a-table>

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
.project-page {
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.project-toolbar-card,
.project-table-card {
  border-radius: 0;
}

.project-toolbar-card :deep(.arco-card-body) {
  padding: 8px;
}

.project-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.project-keyword {
  width: min(440px, 40vw);
}

.reset-button {
  margin-left: 6px;
}

.create-button {
  margin-left: auto;
}

.project-table-card {
  flex: 1;
  min-height: 0;
}

.project-table-card :deep(.arco-card-body) {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px;
}

.project-table {
  flex: 1;
  min-height: 0;
  border-radius: 0;
}

.project-table :deep(.arco-table),
.project-table :deep(.arco-table-container) {
  border-radius: 0;
}

.project-table :deep(.arco-table-th),
.project-table :deep(.arco-table-cell) {
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.45;
}

.project-table :deep(.arco-table-cell) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amount-cny {
  color: var(--color-text-1);
  font-weight: 600;
  white-space: nowrap;
}

.pagination-wrapper {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
}

@media (max-width: 760px) {
  .project-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .project-keyword {
    width: 100%;
  }

  .create-button,
  .reset-button {
    margin-left: 0;
  }
}
</style>
