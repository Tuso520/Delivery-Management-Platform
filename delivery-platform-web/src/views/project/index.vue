<script setup lang="ts">
import { computed, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMutation } from '@tanstack/vue-query'

import { projectApi } from '@/api/project'
import {
  BusinessDrawer,
  BusinessModal,
  BusinessTable,
  PageContainer,
  PageToolbar,
  StatCard,
} from '@/components/business'
import {
  useArchivedProjectListQuery,
  useProjectConfigurationQuery,
  useProjectListQuery,
  useProjectSummaryQuery,
} from '@/composables/queries/useProjectQueries'
import type { Project, ProjectScope, ProjectSummaryFilter, QueryProjectDto } from '@/types/project'
import { arcoConfirm } from '@/utils/arco-dialog'
import { formatAdaptiveNumber } from '@/utils/format'
import {
  PROJECT_STAGE_COLORS,
  projectDictionaryColor,
  type ProjectDictionaryKind,
} from '@/utils/project-dictionaries'
import { localizeProjectStage } from '@/utils/project-localization'

import ProjectDetail from './detail.vue'
import ProjectDrawer from './ProjectDrawer.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
type ProjectViewMode = ProjectScope | 'archived'
const scope = ref<ProjectScope>((route.query.scope as ProjectScope) || 'mine')
const archivedView = ref(route.query.view === 'archived')
const filters = ref<QueryProjectDto>({
  page: Number(route.query.page) || 1,
  pageSize: Number(route.query.pageSize) || 20,
  keyword: typeof route.query.keyword === 'string' ? route.query.keyword : '',
  scope: scope.value,
  summaryFilter: (route.query.summaryFilter as ProjectSummaryFilter) || 'ALL',
  sort: 'updatedAt:desc',
})
const listQuery = useProjectListQuery(filters)
const archivedQuery = useArchivedProjectListQuery(filters)
const summaryQuery = useProjectSummaryQuery(scope)
const configurationQuery = useProjectConfigurationQuery()
const activeQuery = computed(() => (archivedView.value ? archivedQuery : listQuery))
const projects = computed(() => activeQuery.value.data.value?.items ?? [])
const pagination = computed(() => ({
  page: activeQuery.value.data.value?.page ?? 1,
  pageSize: activeQuery.value.data.value?.pageSize ?? 20,
  total: activeQuery.value.data.value?.total ?? 0,
}))
const summary = computed(
  () => summaryQuery.data.value ?? { total: 0, active: 0, accepted: 0, highRisk: 0 },
)
const viewMode = computed<ProjectViewMode>(() => (archivedView.value ? 'archived' : scope.value))
const summaryCards = computed(() => [
  {
    key: 'ALL' as const,
    label: t('projects.stats.total'),
    value: summary.value.total,
    tone: 'blue' as const,
  },
  {
    key: 'ACTIVE' as const,
    label: t('projects.stats.active'),
    value: summary.value.active,
    tone: 'green' as const,
  },
  {
    key: 'ACCEPTED' as const,
    label: t('projects.stats.accepted'),
    value: summary.value.accepted,
    tone: 'cyan' as const,
  },
  {
    key: 'HIGH_RISK' as const,
    label: t('projects.stats.highRisk'),
    value: summary.value.highRisk,
    tone: 'red' as const,
  },
])

const drawerMode = computed<'create' | 'edit' | 'view' | null>(() => {
  if (route.path === '/projects/create') return 'create'
  if (route.path.endsWith('/edit')) return 'edit'
  if (route.params.projectId) return 'view'
  return null
})
const drawerProjectId = computed(() => String(route.params.projectId || ''))
const editorDrawerVisible = computed({
  get: () => drawerMode.value === 'create' || drawerMode.value === 'edit',
  set: (value) => {
    if (!value) void closeOverlay()
  },
})
const detailModalVisible = computed({
  get: () => drawerMode.value === 'view',
  set: (value) => {
    if (!value) void closeOverlay()
  },
})

async function syncUrl(): Promise<void> {
  filters.value.scope = scope.value
  await router.replace({
    path: '/projects',
    query: {
      scope: scope.value === 'mine' ? undefined : scope.value,
      view: archivedView.value ? 'archived' : undefined,
      keyword: filters.value.keyword || undefined,
      summaryFilter:
        filters.value.summaryFilter === 'ALL' ? undefined : filters.value.summaryFilter,
      page: filters.value.page === 1 ? undefined : String(filters.value.page),
      pageSize: filters.value.pageSize === 20 ? undefined : String(filters.value.pageSize),
    },
  })
}
function search(): void {
  filters.value.page = 1
  void syncUrl()
}
function changeView(value: ProjectViewMode): void {
  archivedView.value = value === 'archived'
  if (value !== 'archived') scope.value = value
  filters.value.scope = scope.value
  filters.value.page = 1
  void syncUrl()
}
function selectSummary(key: ProjectSummaryFilter): void {
  archivedView.value = false
  filters.value.summaryFilter = key
  filters.value.page = 1
  void syncUrl()
}
function changePage(page: number): void {
  filters.value.page = page
  void syncUrl()
}
async function refresh(): Promise<void> {
  await Promise.allSettled([listQuery.refetch(), archivedQuery.refetch(), summaryQuery.refetch()])
}
function openProject(project: Project): void {
  void router.push({ path: `/projects/${project.id}`, query: route.query })
}
async function closeOverlay(): Promise<void> {
  await router.push({ path: '/projects', query: route.query })
}
async function openEditor(): Promise<void> {
  await router.push({ path: `/projects/${drawerProjectId.value}/edit`, query: route.query })
}
async function saved(): Promise<void> {
  await closeOverlay()
  await refresh()
}

const archiveMutation = useMutation({
  mutationFn: ({ project, command }: { project: Project; command: 'archive' | 'restore' }) =>
    projectApi.changeStatus(project.id, command, { revision: project.revision }),
  retry: false,
  onSuccess: refresh,
})
const deleteMutation = useMutation({
  mutationFn: (id: string) => projectApi.permanentDelete(id),
  retry: false,
  onSuccess: refresh,
})
async function restore(project: Project): Promise<void> {
  await arcoConfirm(
    t('projects.restoreConfirm', { name: displayName(project) }),
    t('projects.restoreTitle'),
  )
  await archiveMutation.mutateAsync({ project, command: 'restore' })
  Message.success(t('projects.restoredSuccess'))
}
async function permanentDelete(project: Project): Promise<void> {
  await arcoConfirm(
    t('projects.deleteConfirm', { name: displayName(project) }),
    t('projects.deleteTitle'),
    { type: 'error', confirmButtonText: t('projects.deleteContinue') },
  )
  await arcoConfirm(t('projects.finalDeleteConfirm'), t('projects.finalDeleteTitle'), {
    type: 'error',
    confirmButtonText: t('projects.deleteAction'),
  })
  await deleteMutation.mutateAsync(project.id)
  Message.success(t('projects.deletedSuccess'))
}
function displayName(project: Project): string {
  return project.shortName?.trim() || project.projectName
}
function region(project: Project): string {
  const country = (project.countryName || project.countryCode || '').trim()
  const city = (project.cityName || project.city || '').trim()
  return [country, city].filter(Boolean).join(' · ') || '—'
}
function date(value?: string | null): string {
  return value ? value.slice(0, 10) : '—'
}
function acceptance(project: Project): string {
  return project.actualAcceptanceAt
    ? date(project.actualAcceptanceAt)
    : date(project.expectedAcceptanceAt)
}
function amount(value?: number | string | null): string {
  return formatAdaptiveNumber(value, { placeholder: '—' })
}
function memberName(project: Project, role: string): string {
  return project.members?.find((item) => item.projectRole === role)?.user?.realName || '—'
}
function stageColor(project: Project): string {
  return PROJECT_STAGE_COLORS[project.currentStage]
}
function configuredOption(key: 'projectTypes' | 'contractTypes', value?: string | null) {
  return configurationQuery.data.value?.[key].find((item) => item.value === value)
}
function configuredColor(kind: ProjectDictionaryKind, value?: string | null): string | undefined {
  return value ? projectDictionaryColor(kind, value) : undefined
}
</script>

<template>
  <PageContainer class="project-page" gap="compact" :scrollable="false">
    <section class="summary-grid">
      <StatCard
        v-for="card in summaryCards"
        :key="card.key"
        :label="card.label"
        :value="card.value"
        :tone="card.tone"
        interactive
        :active="!archivedView && filters.summaryFilter === card.key"
        @select="selectSummary(card.key)"
      />
    </section>

    <section class="project-list-panel">
      <PageToolbar class="project-toolbar">
        <template #filters>
          <div class="scope-field">
            <a-select :model-value="viewMode" @change="changeView($event as ProjectViewMode)">
              <a-option value="mine" :label="t('projects.scope.mine')" />
              <a-option value="all" :label="t('projects.scope.all')" />
              <a-option value="archived" :label="t('projects.archiveView.archived')" />
            </a-select>
          </div>
          <div class="search-group">
            <a-input
              v-model="filters.keyword"
              class="keyword-input"
              allow-clear
              :placeholder="t('projects.searchPlaceholder')"
              @press-enter="search"
            />
            <a-button type="primary" class="search-button" @click="search">
              {{ t('common.search') }}
            </a-button>
          </div>
        </template>
        <template #actions>
          <a-button :loading="activeQuery.isFetching.value" @click="refresh">
            {{ t('projects.refresh') }}
          </a-button>
          <a-button v-if="!archivedView" type="primary" @click="router.push('/projects/create')">
            {{ t('projects.create') }}
          </a-button>
        </template>
      </PageToolbar>

      <BusinessTable
        :data="projects"
        :loading="activeQuery.isFetching.value"
        :pagination="pagination"
        :scroll="{ x: 'max-content' }"
        size="large"
        row-key="id"
        @page-change="changePage"
      >
        <a-table-column :title="t('projects.columns.name')" :width="224" fixed="left">
          <template #cell="{ record: row }">
            <a-tooltip :content="displayName(row)">
              <button class="project-link" @click="openProject(row)">
                {{ displayName(row) }}
              </button>
            </a-tooltip>
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.region')" :min-width="140">
          <template #cell="{ record: row }">
            <span class="nowrap">{{ region(row) }}</span>
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.classification')"
          :min-width="150"
        >
          <template #cell="{ record: row }">
            <a-space :wrap="false">
              <a-tag
                v-if="row.projectType"
                :color="configuredColor('projectType', row.projectType)"
              >
                {{
                  configuredOption('projectTypes', row.projectType)?.label || row.projectType
                }}
              </a-tag><a-tag
                v-if="row.contractType"
                :color="configuredColor('contractType', row.contractType)"
              >
                {{
                  configuredOption('contractTypes', row.contractType)?.label || row.contractType
                }}
              </a-tag><span v-if="!row.projectType && !row.contractType">—</span>
            </a-space>
          </template>
        </a-table-column>
        <a-table-column v-else :title="t('projects.createForm.projectType')" :min-width="104">
          <template #cell="{ record: row }">
            {{ configuredOption('projectTypes', row.projectType)?.label || row.projectType || '—' }}
          </template>
        </a-table-column>
        <a-table-column
          v-if="archivedView"
          :title="t('projects.createForm.contractType')"
          :min-width="96"
          data-index="contractType"
        />
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.currentStage')"
          :min-width="104"
        >
          <template #cell="{ record: row }">
            <a-tag :color="stageColor(row)">
              {{ localizeProjectStage(row.currentStage, 'zh-CN') }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.progress')"
          :min-width="160"
        >
          <template #cell="{ record: row }">
            <div class="progress">
              <a-progress
                :percent="(row.progressPercent || 0) / 100"
                :show-text="false"
                size="small"
              /><span>{{ row.progressPercent ?? 0 }}%</span>
            </div>
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.signedAt')"
          :min-width="104"
        >
          <template #cell="{ record: row }">
            {{ date(row.contractSignedAt) }}
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.acceptanceAt')"
          :min-width="104"
        >
          <template #cell="{ record: row }">
            {{ acceptance(row) }}
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.contractAmount')"
          :min-width="192"
          align="right"
        >
          <template #cell="{ record: row }">
            <span class="money-cell">
              {{
                row.contractCurrency ? `${row.contractCurrency} ${amount(row.contractAmount)}` : '—'
              }}
            </span>
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.convertedCny')"
          :min-width="160"
          align="right"
        >
          <template #cell="{ record: row }">
            <span class="money-cell">
              {{ amount(row.convertedAmount) === '—' ? '—' : `CNY ${amount(row.convertedAmount)}` }}
            </span>
          </template>
        </a-table-column>
        <a-table-column
          v-if="archivedView"
          :title="t('projects.columns.archivedBy')"
          :min-width="104"
        >
          <template #cell="{ record: row }">
            {{ row.archivedByUser?.realName || '—' }}
          </template>
        </a-table-column>
        <a-table-column
          v-if="archivedView"
          :title="t('projects.columns.archivedAt')"
          :min-width="152"
        >
          <template #cell="{ record: row }">
            {{ row.archivedAt ? row.archivedAt.slice(0, 16).replace('T', ' ') : '—' }}
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.sales')" :min-width="96">
          <template #cell="{ record: row }">
            {{ memberName(row, 'SALES_OWNER') }}
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.manager')" :min-width="96">
          <template #cell="{ record: row }">
            {{ memberName(row, 'PROJECT_MANAGER') }}
          </template>
        </a-table-column>
        <a-table-column v-if="archivedView" :title="t('common.action')" :min-width="168">
          <template #cell="{ record: row }">
            <a-space :wrap="false">
              <a-button type="text" @click="openProject(row)">
                {{ t('common.view') }}
              </a-button><a-button v-if="row.canRestore" type="text" @click="restore(row)">
                {{ t('projects.restore') }}
              </a-button><a-button
                v-if="row.canPermanentDelete"
                type="text"
                status="danger"
                @click="permanentDelete(row)"
              >
                {{ t('projects.deleteAction') }}
              </a-button>
            </a-space>
          </template>
        </a-table-column>
      </BusinessTable>
    </section>

    <BusinessDrawer
      v-model:visible="editorDrawerVisible"
      :title="drawerMode === 'create' ? t('projects.create') : t('projects.edit')"
      size="xl"
      :footer="false"
    >
      <ProjectDrawer
        v-if="drawerMode === 'create' || drawerMode === 'edit'"
        :mode="drawerMode"
        :project-id="drawerProjectId"
        @saved="saved"
        @cancel="closeOverlay"
      />
    </BusinessDrawer>

    <BusinessModal
      v-model:visible="detailModalVisible"
      class="project-detail-modal"
      :width="800"
      :footer="false"
      :closable="false"
    >
      <ProjectDetail
        v-if="drawerMode === 'view'"
        embedded
        :project-id="drawerProjectId"
        @edit="openEditor"
        @close="closeOverlay"
        @changed="refresh"
      />
    </BusinessModal>
  </PageContainer>
</template>

<style scoped>
.project-page {
  --project-border: #e5e6eb;
  height: 100%;
  overflow: hidden;
  color: #1d2129;
  font-family: Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

:deep(.summary-grid .stat-card) {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-color: var(--project-border);
  border-radius: 2px;
  background: #fff;
}

:deep(.summary-grid .stat-card--interactive:hover) {
  border-color: rgb(var(--primary-3));
  background: rgb(var(--primary-1));
}

:deep(.summary-grid .stat-card--active) {
  border-color: var(--project-border);
  border-top: 2px solid rgb(var(--stat-color));
  background: rgb(var(--primary-1));
  box-shadow: none;
}

:deep(.summary-grid .stat-card__label) {
  color: #4e5969;
  font-size: 14px;
  font-weight: 500;
}

:deep(.summary-grid .stat-card__value) {
  margin: 0 0 0 12px;
  font-size: 30px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.project-list-panel {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--project-border);
  border-radius: 2px;
  background: #fff;
}

.project-toolbar {
  flex: 0 0 auto;
  padding: 12px 16px;
  border-bottom: 1px solid var(--project-border);
}

.project-toolbar :deep(.page-toolbar__filters) {
  min-width: 0;
  flex: 1 1 auto;
  flex-wrap: nowrap;
}

.project-toolbar :deep(.page-toolbar__actions) {
  flex: 0 0 auto;
  flex-wrap: nowrap;
  margin-left: auto;
}

.scope-field {
  width: 128px;
  flex: 0 0 128px;
}

.scope-field :deep(.arco-select) {
  width: 100%;
}

.keyword-input {
  width: min(320px, 34vw);
}

.search-group {
  display: flex;
  align-items: stretch;
}

.search-group :deep(.keyword-input .arco-input-wrapper) {
  border-radius: 2px 0 0 2px;
}

.search-button {
  margin-left: -1px;
  border-radius: 0 2px 2px 0 !important;
}

.project-link {
  display: block;
  max-width: 240px;
  overflow: hidden;
  border: 0;
  background: none;
  color: rgb(var(--primary-6));
  font-weight: 500;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.nowrap {
  white-space: nowrap;
}

.money-cell {
  display: inline-block;
  min-width: max-content;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.progress {
  display: grid;
  grid-template-columns: minmax(80px, 1fr) 42px;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

:deep(.project-list-panel > .business-table) {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

:deep(.project-list-panel .business-table__viewport > .arco-table) {
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
}

:deep(.project-list-panel .arco-table-container) {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  overflow-x: auto;
  overflow-y: auto;
  border: 0;
  border-radius: 0;
}

:deep(.project-list-panel .arco-table-element) {
  width: max-content;
  min-width: 100%;
  table-layout: auto !important;
}

:deep(.project-list-panel .arco-table-th) {
  height: 42px;
  background: #f7f8fa;
  color: #4e5969;
  font-weight: 500;
}

:deep(.project-list-panel .arco-table-th),
:deep(.project-list-panel .arco-table-td) {
  padding-right: 16px;
  padding-left: 16px;
  border-color: var(--project-border);
  white-space: nowrap;
}

:deep(.project-list-panel .arco-table-tr:hover .arco-table-td) {
  background: #e8f3ff;
}

:deep(.project-page .arco-btn),
:deep(.project-page .arco-input-wrapper),
:deep(.project-page .arco-select-view-single),
:deep(.project-page .arco-tag) {
  border-radius: 2px;
}

:global(.project-detail-modal .arco-modal) {
  max-width: calc(100vw - 32px);
  overflow: hidden;
  border-radius: 2px;
}

:global(.project-detail-modal .arco-modal-header) {
  display: none;
}

:global(.project-detail-modal .arco-modal-body) {
  padding: 0;
}

@media (max-width: 900px) {
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .keyword-input {
    width: 100%;
  }

  .project-toolbar :deep(.page-toolbar__filters) {
    flex-wrap: wrap;
  }
}
</style>
