<script setup lang="ts">
import { computed, ref } from 'vue'
import { isAxiosError } from 'axios'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Message } from '@arco-design/web-vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { projectApi } from '@/api/project'
import { ApiRequestError, hasHttpStatus } from '@/api/errors'
import {
  BusinessDrawer,
  BusinessTable,
  Can,
  PageContainer,
  PageToolbar,
  SectionCard,
  StatCard,
  StatusBadge,
} from '@/components/business'
import {
  useProjectListQuery,
  useProjectSummaryQuery,
} from '@/composables/queries/useProjectQueries'
import { usePermission } from '@/composables/usePermission'
import { queryKeys } from '@/query/keys'
import { useLocaleStore } from '@/store/locale'
import type {
  Project,
  ProjectDeliveryStage,
  ProjectSummaryFilter,
  QueryProjectDto,
} from '@/types/project'
import { PROJECT_DELIVERY_STAGES, STAGE_OPTIONS } from '@/types/project'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { localizeProjectStage, localizeProjectStatus } from '@/utils/project-localization'

import ProjectForm from './create.vue'
import ProjectDetail from './detail.vue'

type DrawerMode = 'create' | 'view' | 'edit'

const router = useRouter()
const route = useRoute()
const localeStore = useLocaleStore()
const { hasPermission } = usePermission()
const queryClient = useQueryClient()
const { t } = useI18n()

const stageUpdatingIds = ref<string[]>([])
const searchForm = ref<QueryProjectDto>({
  page: Number(route.query.page) || 1,
  pageSize: Number(route.query.pageSize) || 20,
  keyword: typeof route.query.keyword === 'string' ? route.query.keyword : '',
  summaryFilter:
    typeof route.query.summaryFilter === 'string'
      ? (route.query.summaryFilter as ProjectSummaryFilter)
      : 'ALL',
  sort:
    typeof route.query.sort === 'string'
      ? (route.query.sort as QueryProjectDto['sort'])
      : 'updatedAt:desc',
})

const projectListQuery = useProjectListQuery(searchForm)
const projectSummaryQuery = useProjectSummaryQuery()
const projectList = computed(() => projectListQuery.data.value?.items ?? [])
const pagination = computed(() => ({
  page: projectListQuery.data.value?.page ?? searchForm.value.page ?? 1,
  pageSize: projectListQuery.data.value?.pageSize ?? searchForm.value.pageSize ?? 20,
  total: projectListQuery.data.value?.total ?? 0,
}))
const summary = computed(
  () =>
    projectSummaryQuery.data.value ?? {
      total: 0,
      active: 0,
      accepted: 0,
      highRisk: 0,
    },
)
const loading = computed(() => projectListQuery.isFetching.value)
const summaryLoading = computed(() => projectSummaryQuery.isFetching.value)

const summaryCards = computed<
  Array<{
    key: ProjectSummaryFilter
    label: string
    value: number
  }>
>(() => [
  { key: 'ALL', label: t('projects.stats.total'), value: summary.value.total },
  { key: 'ACTIVE', label: t('projects.stats.active'), value: summary.value.active },
  { key: 'ACCEPTED', label: t('projects.stats.accepted'), value: summary.value.accepted },
  { key: 'HIGH_RISK', label: t('projects.stats.highRisk'), value: summary.value.highRisk },
])

const drawerMode = computed<DrawerMode | null>(() => {
  const mode = String(route.query.mode || '')
  if (['create', 'view', 'edit'].includes(mode)) return mode as DrawerMode
  if (route.name === 'ProjectCreate') return 'create'
  if (route.name === 'ProjectEdit') return 'edit'
  if (route.name === 'ProjectDetail') return 'view'
  return null
})
const drawerProjectId = computed(() =>
  String(route.query.projectId || route.params.projectId || ''),
)
const drawerVisible = computed({
  get: () => drawerMode.value !== null,
  set: (visible: boolean) => {
    if (!visible) void closeDrawer()
  },
})
const drawerTitle = computed(() => {
  if (drawerMode.value === 'create') return t('projects.create')
  if (drawerMode.value === 'edit') return t('projects.edit')
  return t('projects.detail')
})

async function refreshAll(): Promise<void> {
  await Promise.allSettled([projectListQuery.refetch(), projectSummaryQuery.refetch()])
}

async function syncListUrl(): Promise<void> {
  await router.replace({
    path: route.path,
    query: {
      ...route.query,
      page: String(searchForm.value.page ?? 1),
      pageSize: String(searchForm.value.pageSize ?? 20),
      keyword: searchForm.value.keyword || undefined,
      summaryFilter:
        searchForm.value.summaryFilter === 'ALL' ? undefined : searchForm.value.summaryFilter,
      sort: searchForm.value.sort === 'updatedAt:desc' ? undefined : searchForm.value.sort,
    },
  })
}

function handleSearch(): void {
  searchForm.value.page = 1
  void syncListUrl()
}

function selectSummaryFilter(filter: ProjectSummaryFilter): void {
  searchForm.value.summaryFilter = filter
  searchForm.value.page = 1
  void syncListUrl()
}

function handlePageChange(page: number): void {
  searchForm.value.page = page
  void syncListUrl()
}

function handleSizeChange(pageSize: number): void {
  searchForm.value.pageSize = pageSize
  searchForm.value.page = 1
  void syncListUrl()
}

async function invalidateProjectCollection(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.summary() }),
  ])
}

const projectStatusMutation = useMutation({
  mutationFn: ({
    id,
    command,
    revision,
  }: {
    id: string
    command: 'archive' | 'restore'
    revision: number
  }) => projectApi.changeStatus(id, command, { revision }),
  retry: false,
  onSuccess: async (updatedProject, variables) => {
    queryClient.setQueryData(queryKeys.projects.detail(variables.id), updatedProject)
    await Promise.all([
      invalidateProjectCollection(),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.id) }),
    ])
  },
})

const projectStageMutation = useMutation({
  mutationFn: ({
    id,
    targetStage,
    reason,
    revision,
  }: {
    id: string
    targetStage: ProjectDeliveryStage
    reason?: string
    revision: number
  }) => projectApi.updateStage(id, { revision, targetStage, reason }),
  retry: false,
  onSuccess: async (updatedProject, variables) => {
    queryClient.setQueryData(queryKeys.projects.detail(variables.id), updatedProject)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.id) }),
    ])
  },
})

const projectDeleteMutation = useMutation({
  mutationFn: (projectId: string) => projectApi.delete(projectId),
  retry: false,
  onSuccess: async (_, projectId) => {
    queryClient.removeQueries({ queryKey: queryKeys.projects.detail(projectId), exact: true })
    await invalidateProjectCollection()
  },
})
const deletingProjectId = computed(() =>
  projectDeleteMutation.isPending.value ? projectDeleteMutation.variables.value : '',
)

function handleCreate(): void {
  void router.push('/projects/create')
}

function handleView(row: Project): void {
  void router.push(`/projects/${row.id}`)
}

function handleEdit(row: Project): void {
  void router.push(`/projects/${row.id}/edit`)
}

async function closeDrawer(): Promise<void> {
  await router.push('/projects')
}

async function handleDrawerSaved(): Promise<void> {
  await closeDrawer()
  await invalidateProjectCollection()
}

async function handleProjectConflict(error: unknown): Promise<void> {
  if (!hasHttpStatus(error, 409)) return
  Message.warning(t('projects.conflict'))
  await refreshAll()
}

async function handleArchive(row: Project): Promise<void> {
  try {
    await arcoConfirm(
      t('projects.archiveConfirm', { name: row.projectName }),
      t('projects.archiveTitle'),
      {
        type: 'warning',
        confirmButtonText: t('projects.archive'),
      },
    )
    await projectStatusMutation.mutateAsync({
      id: row.id,
      command: 'archive',
      revision: row.revision,
    })
    Message.success(t('projects.archivedSuccess'))
  } catch (error) {
    await handleProjectConflict(error)
  }
}

async function handleRestore(row: Project): Promise<void> {
  try {
    await arcoConfirm(
      t('projects.restoreConfirm', { name: row.projectName }),
      t('projects.restoreTitle'),
    )
    await projectStatusMutation.mutateAsync({
      id: row.id,
      command: 'restore',
      revision: row.revision,
    })
    Message.success(t('projects.restoredSuccess'))
  } catch (error) {
    await handleProjectConflict(error)
  }
}

function deleteErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message
  if (isAxiosError(error)) {
    const data: unknown = error.response?.data
    if (data && typeof data === 'object' && 'message' in data) {
      const message = (data as { message?: unknown }).message
      if (typeof message === 'string' && message.trim()) return message
    }
  }
  return error instanceof Error && error.message ? error.message : t('projects.deleteFailed')
}

async function confirmPermanentDelete(row: Project): Promise<boolean> {
  try {
    await arcoConfirm(
      t('projects.deleteConfirm', { name: row.projectName }),
      t('projects.deleteTitle'),
      {
        type: 'error',
        confirmButtonText: t('projects.deleteContinue'),
        cancelButtonText: t('common.cancel'),
      },
    )
    await arcoPrompt(
      t('projects.deleteVerifyHint', { code: row.projectCode }),
      t('projects.deleteVerifyTitle'),
      {
        inputPlaceholder: row.projectCode,
        confirmButtonText: t('projects.deleteAction'),
        cancelButtonText: t('common.cancel'),
        inputValidator: (value) =>
          value.trim() === row.projectCode ? true : t('projects.deleteCodeMismatch'),
      },
    )
    return true
  } catch {
    return false
  }
}

async function handlePermanentDelete(row: Project): Promise<void> {
  if (!(await confirmPermanentDelete(row))) return
  try {
    await projectDeleteMutation.mutateAsync(row.id)
    Message.success(t('projects.deletedSuccess'))
  } catch (error) {
    Message.error(deleteErrorMessage(error))
  }
}

function resolveDeliveryStage(project: Project): ProjectDeliveryStage | null {
  return project.currentStage
}

function displayStage(project: Project): string {
  return localizeProjectStage(project.currentStage, localeStore.currentLocale)
}

async function handleStageChange(
  project: Project,
  targetStage: ProjectDeliveryStage,
): Promise<void> {
  const currentStage = resolveDeliveryStage(project)
  if (currentStage === targetStage) return

  let reason: string | undefined
  const currentIndex = currentStage ? PROJECT_DELIVERY_STAGES.indexOf(currentStage) : -1
  const targetIndex = PROJECT_DELIVERY_STAGES.indexOf(targetStage)

  try {
    if (currentIndex >= 0 && targetIndex < currentIndex) {
      const result = await arcoPrompt(t('projects.rollbackHint'), t('projects.rollbackTitle'), {
        inputType: 'textarea',
        inputPlaceholder: t('projects.reasonPlaceholder'),
        inputValidator: (value) => (value.trim() ? true : t('projects.rollbackRequired')),
      })
      reason = result.value.trim()
    }

    stageUpdatingIds.value = [...stageUpdatingIds.value, project.id]
    await projectStageMutation.mutateAsync({
      id: project.id,
      targetStage,
      reason,
      revision: project.revision,
    })
    Message.success(t('projects.stageUpdated'))
  } catch (error) {
    await handleProjectConflict(error)
  } finally {
    stageUpdatingIds.value = stageUpdatingIds.value.filter((id) => id !== project.id)
  }
}

function handleStageSelection(project: Project, value: unknown): void {
  if (typeof value === 'string' && (PROJECT_DELIVERY_STAGES as readonly string[]).includes(value)) {
    void handleStageChange(project, value as ProjectDeliveryStage)
  }
}

function displayStatus(project: Project): string {
  if (project.archivedAt) return t('projects.archived')
  return localizeProjectStatus(project.status, localeStore.currentLocale)
}

function getCountryLabel(project: Project): string {
  return project.countryName || project.countryCode
}

function getMemberName(project: Project, role: string): string {
  const matchingMembers = project.members?.filter((member) => member.projectRole === role) || []
  return (
    matchingMembers.find((member) => member.user?.username !== 'admin')?.user?.realName ||
    matchingMembers[0]?.user?.realName ||
    '—'
  )
}

function formatAmount(value?: number | null): string {
  if (value === undefined || value === null) return '—'
  return new Intl.NumberFormat(localeStore.currentLocale, {
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(localeStore.currentLocale)
}

function acceptanceDate(project: Project): string {
  if (project.acceptanceTimeType === 'ACTUAL') return formatDate(project.actualAcceptanceAt)
  if (project.acceptanceTimeType === 'EXPECTED') return formatDate(project.expectedAcceptanceAt)
  return '—'
}

function isArchived(project: Project): boolean {
  return Boolean(project.archivedAt)
}
</script>

<template>
  <PageContainer class="project-page" gap="compact" :scrollable="false">
    <section
      class="summary-grid"
      :aria-label="t('projects.summaryAria')"
      :aria-busy="summaryLoading"
    >
      <StatCard
        v-for="card in summaryCards"
        :key="card.key"
        :label="card.label"
        :value="card.value"
        interactive
        :active="searchForm.summaryFilter === card.key"
        @select="selectSummaryFilter(card.key)"
      />
    </section>

    <PageToolbar :title="t('projects.title')" :description="t('projects.description')">
      <template #filters>
        <a-input
          v-model="searchForm.keyword"
          :placeholder="t('projects.searchPlaceholder')"
          allow-clear
          class="project-keyword"
          @press-enter="handleSearch"
          @clear="handleSearch"
        />
        <a-button type="primary" @click="handleSearch">
          {{ t('common.search') }}
        </a-button>
      </template>
      <template #actions>
        <a-button :loading="loading || summaryLoading" @click="refreshAll">
          {{ t('projects.refresh') }}
        </a-button>
        <Can permission="project:create">
          <a-button type="primary" @click="handleCreate">
            {{ t('projects.create') }}
          </a-button>
        </Can>
      </template>
    </PageToolbar>

    <SectionCard class="project-table-card" :bordered="false" body-class="project-table-body">
      <BusinessTable
        :loading="loading"
        :data="projectList"
        :error="projectListQuery.isError.value ? t('projects.loadFailed') : null"
        :empty-title="t('projects.empty')"
        :retry-label="t('common.retry')"
        :pagination="pagination"
        row-key="id"
        bordered
        stripe
        :scroll="{ x: 1640 }"
        class="project-table"
        @retry="projectListQuery.refetch()"
        @page-change="handlePageChange"
        @page-size-change="handleSizeChange"
      >
        <a-table-column :title="t('projects.columns.name')" :width="220" fixed="left">
          <template #cell="{ record: row }">
            <button type="button" class="project-name" @click="handleView(row)">
              <span>{{ row.projectName }}</span>
              <small>{{ row.projectCode }}</small>
            </button>
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.region')" :width="120">
          <template #cell="{ record: row }">
            {{ getCountryLabel(row) }} / {{ row.city || '—' }}
          </template>
        </a-table-column>
        <a-table-column :title="t('common.status')" :width="88" align="center">
          <template #cell="{ record: row }">
            <StatusBadge
              domain="project"
              :status="isArchived(row) ? 'ARCHIVED' : row.status"
              :label="displayStatus(row)"
            />
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.currentStage')" :width="154">
          <template #cell="{ record: row }">
            <a-select
              v-if="hasPermission('project:stage:update') && !isArchived(row)"
              :model-value="resolveDeliveryStage(row) || undefined"
              :loading="stageUpdatingIds.includes(row.id)"
              size="small"
              :placeholder="t('projects.selectStage')"
              @change="handleStageSelection(row, $event)"
            >
              <a-option
                v-for="stage in STAGE_OPTIONS"
                :key="stage.value"
                :value="stage.value"
                :label="t(stage.label)"
              />
            </a-select>
            <span v-else>{{ displayStage(row) }}</span>
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.progress')" :width="116">
          <template #cell="{ record: row }">
            <div v-if="row.progressPercent != null" class="progress-cell">
              <a-progress :percent="row.progressPercent / 100" :show-text="false" size="small" />
              <span>{{ row.progressPercent }}%</span>
            </div>
            <span v-else>—</span>
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.signedAt')" :width="112">
          <template #cell="{ record: row }">
            {{ formatDate(row.contractSignedAt) }}
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.acceptanceAt')" :width="112">
          <template #cell="{ record: row }">
            {{ acceptanceDate(row) }}
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.contractAmount')" :width="150" align="right">
          <template #cell="{ record: row }">
            <span v-if="row.contractAmount != null && row.contractCurrency">
              {{ row.contractCurrency }} {{ formatAmount(row.contractAmount) }}
            </span>
            <span v-else>—</span>
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.convertedCny')" :width="150" align="right">
          <template #cell="{ record: row }">
            <span v-if="row.convertedAmount != null" class="amount-cny">
              CNY {{ formatAmount(row.convertedAmount) }}
            </span>
            <span v-else>—</span>
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.sales')" :width="110">
          <template #cell="{ record: row }">
            {{ getMemberName(row, 'SALES_OWNER') }}
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.manager')" :width="110">
          <template #cell="{ record: row }">
            {{ getMemberName(row, 'PROJECT_MANAGER') }}
          </template>
        </a-table-column>
        <a-table-column
          :title="t('common.action')"
          :width="250"
          fixed="right"
          align="center"
        >
          <template #cell="{ record: row }">
            <a-space size="mini" :wrap="false">
              <a-button type="text" size="mini" @click="handleView(row)">
                {{ t('common.view') }}
              </a-button>
              <Can permission="project:update">
                <a-button type="text" size="mini" @click="handleEdit(row)">
                  {{ t('common.edit') }}
                </a-button>
              </Can>
              <Can v-if="!isArchived(row)" permission="project:archive">
                <a-button
                  type="text"
                  status="warning"
                  size="mini"
                  @click="handleArchive(row)"
                >
                  {{ t('projects.archive') }}
                </a-button>
              </Can>
              <Can v-else permission="project:restore">
                <a-button type="text" size="mini" @click="handleRestore(row)">
                  {{ t('projects.restore') }}
                </a-button>
              </Can>
              <Can permission="project:delete">
                <a-button
                  type="text"
                  size="mini"
                  status="danger"
                  :loading="deletingProjectId === row.id"
                  @click="handlePermanentDelete(row)"
                >
                  {{ t('projects.deleteAction') }}
                </a-button>
              </Can>
            </a-space>
          </template>
        </a-table-column>
      </BusinessTable>
    </SectionCard>

    <BusinessDrawer
      v-model:visible="drawerVisible"
      :title="drawerTitle"
      size="xl"
      :footer="false"
      :unmount-on-close="true"
      class="project-drawer"
    >
      <ProjectForm
        v-if="drawerMode === 'create' || drawerMode === 'edit'"
        :key="`${drawerMode}-${drawerProjectId}`"
        embedded
        :project-id="drawerMode === 'edit' ? drawerProjectId : ''"
        @saved="handleDrawerSaved"
        @cancel="closeDrawer"
      />
      <ProjectDetail
        v-else-if="drawerMode === 'view' && drawerProjectId"
        :key="drawerProjectId"
        embedded
        :project-id="drawerProjectId"
        @edit="router.push(`/projects/${drawerProjectId}/edit`)"
        @close="closeDrawer"
        @changed="refreshAll"
      />
    </BusinessDrawer>
  </PageContainer>
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

.summary-grid {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.project-name:focus-visible {
  outline: 2px solid rgb(var(--primary-6));
  outline-offset: 2px;
}

.project-keyword {
  width: min(460px, 45vw);
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

.project-table-card :deep(.project-table-body) {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
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
  padding: 7px 9px;
  font-size: 12px;
  line-height: 1.4;
}

.project-name {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--primary-6));
  text-align: left;
  cursor: pointer;
}

.project-name span,
.project-name small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-name small {
  margin-top: 2px;
  color: var(--color-text-3);
  font-size: 11px;
}

.progress-cell {
  display: grid;
  grid-template-columns: minmax(48px, 1fr) auto;
  align-items: center;
  gap: 6px;
}

.amount-cny {
  color: var(--color-text-1);
  font-weight: 600;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .project-keyword {
    width: 100%;
  }
}
</style>
