<script setup lang="ts">
import { computed, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import {
  IconCheckCircle,
  IconFolder,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconSafe,
} from '@arco-design/web-vue/es/icon'
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
const summary = computed(() => ({
  total: 0,
  active: 0,
  accepted: 0,
  acceptedThisYear: 0,
  highRisk: 0,
  totalConvertedAmount: null,
  acceptedConvertedAmount: null,
  ...(summaryQuery.data.value ?? {}),
}))
const viewMode = computed<ProjectViewMode>(() => (archivedView.value ? 'archived' : scope.value))
const summaryMetrics = computed(() => [
  {
    id: 'amount',
    icon: IconSafe,
    label: t('projects.stats.totalAmount'),
    value: amountInTenThousands(summary.value.totalConvertedAmount),
    unit: summary.value.totalConvertedAmount === null ? '' : t('projects.stats.tenThousands'),
    tone: 'purple',
    filter: null,
  },
  {
    id: 'total',
    icon: IconFolder,
    key: 'ALL' as const,
    label: t('projects.stats.total'),
    value: String(summary.value.total),
    unit: t('projects.stats.items'),
    tone: 'green',
    filter: 'ALL' as const,
  },
  {
    id: 'active',
    icon: IconSettings,
    key: 'ACTIVE' as const,
    label: t('projects.stats.activeProjects'),
    value: String(summary.value.active),
    unit: t('projects.stats.items'),
    tone: 'orange',
    filter: 'ACTIVE' as const,
  },
  {
    id: 'accepted',
    icon: IconCheckCircle,
    label: t('projects.stats.acceptedThisYear'),
    value: String(summary.value.acceptedThisYear),
    unit: t('projects.stats.items'),
    tone: 'blue',
    filter: 'ACCEPTED_THIS_YEAR' as const,
  },
  {
    id: 'acceptedAmount',
    icon: IconSafe,
    label: t('projects.stats.acceptedAmount'),
    value: amountInTenThousands(summary.value.acceptedConvertedAmount),
    unit: summary.value.acceptedConvertedAmount === null ? '' : t('projects.stats.tenThousands'),
    tone: 'red',
    filter: null,
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
  return formatAdaptiveNumber(value, { placeholder: '—', fractionDigits: 2 })
}
function amountInTenThousands(value?: number | null): string {
  if (value === null || value === undefined) return '—'
  return formatAdaptiveNumber(value / 10_000, { placeholder: '—', fractionDigits: 1 })
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
    <section class="summary-band" :aria-label="t('projects.summaryAria')">
      <button
        v-for="metric in summaryMetrics"
        :key="metric.id"
        type="button"
        class="summary-metric"
        :class="[
          `summary-metric--${metric.tone}`,
          {
            'is-active': metric.filter && !archivedView && filters.summaryFilter === metric.filter,
          },
        ]"
        :disabled="!metric.filter"
        @click="metric.filter && selectSummary(metric.filter)"
      >
        <span class="metric-icon"><component :is="metric.icon" /></span>
        <span class="metric-copy">
          <span class="metric-label">{{ metric.label }}</span>
          <span class="metric-value">{{ metric.value }} <small>{{ metric.unit }}</small></span>
        </span>
      </button>
      <a-spin v-if="summaryQuery.isFetching.value" class="summary-loading" :size="18" />
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
              <template #icon>
                <IconSearch />
              </template>{{ t('common.search') }}
            </a-button>
          </div>
        </template>
        <template #actions>
          <a-button :loading="activeQuery.isFetching.value" @click="refresh">
            <template #icon>
              <IconRefresh />
            </template>{{ t('projects.refresh') }}
          </a-button>
          <a-button v-if="!archivedView" type="primary" @click="router.push('/projects/create')">
            {{ t('projects.create') }}
          </a-button>
        </template>
      </PageToolbar>

      <BusinessTable
        :data="projects"
        :loading="activeQuery.isFetching.value"
        :error="activeQuery.error.value"
        :empty-title="t('projects.empty')"
        :retry-label="t('common.retry')"
        :pagination="pagination"
        :scroll="{ x: 'max-content' }"
        size="large"
        row-key="id"
        preserve-column-widths
        @retry="refresh"
        @page-change="changePage"
      >
        <a-table-column :title="t('projects.columns.name')" :width="103" fixed="left">
          <template #cell="{ record: row }">
            <a-tooltip :content="displayName(row)">
              <button class="project-link" @click="openProject(row)">
                {{ displayName(row) }}
              </button>
            </a-tooltip>
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.region')" :width="157">
          <template #cell="{ record: row }">
            <span class="nowrap">{{ region(row) }}</span>
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.customerType')"
          :width="104"
        >
          <template #cell="{ record: row }">
            <a-tag v-if="row.projectType" :color="configuredColor('projectType', row.projectType)">
              {{
                configuredOption('projectTypes', row.projectType)?.label || row.projectType
              }}
            </a-tag><span v-else>—</span>
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
          :width="92"
          data-index="contractType"
        />
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.createForm.contractType')"
          :width="92"
        >
          <template #cell="{ record: row }">
            <a-tag
              v-if="row.contractType"
              :color="configuredColor('contractType', row.contractType)"
            >
              {{
                configuredOption('contractTypes', row.contractType)?.label || row.contractType
              }}
            </a-tag><span v-else>—</span>
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.currentStage')"
          :width="172"
        >
          <template #cell="{ record: row }">
            <a-tag :color="stageColor(row)">
              {{ localizeProjectStage(row.currentStage, 'zh-CN') }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column v-if="!archivedView" :title="t('projects.columns.progress')" :width="142">
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
        <a-table-column v-if="!archivedView" :title="t('projects.columns.signedAt')" :width="107">
          <template #cell="{ record: row }">
            {{ date(row.contractSignedAt) }}
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.acceptanceAt')"
          :width="107"
        >
          <template #cell="{ record: row }">
            {{ acceptance(row) }}
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.contractAmount')"
          :width="152"
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
          :width="144"
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
        <a-table-column :title="t('projects.columns.sales')" :width="100" align="center">
          <template #cell="{ record: row }">
            {{ memberName(row, 'SALES_OWNER') }}
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.manager')" :width="110" align="center">
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
  padding: 13px;
  overflow: hidden;
  border-radius: 4px;
  background: #fff;
  color: #1d2129;
  font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.summary-band {
  position: relative;
  min-height: 100px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border-top: 1px solid var(--project-border);
  border-bottom: 1px solid var(--project-border);
}

.summary-metric {
  position: relative;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}
.summary-metric:not(:last-of-type)::after {
  content: '';
  position: absolute;
  top: 20px;
  right: 0;
  width: 1px;
  height: 60px;
  background: var(--project-border);
}
.summary-metric:not(:disabled) {
  cursor: pointer;
}
.summary-metric:not(:disabled):hover,
.summary-metric.is-active {
  background: #f7f8fa;
}
.metric-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #eceefb;
  color: #6f7cff;
  font-size: 24px;
  box-shadow: inset 0 0 0 5px rgba(255, 255, 255, 0.55);
}
.summary-metric--green .metric-icon {
  background: #e6f7ed;
  color: #00b42a;
}
.summary-metric--orange .metric-icon {
  background: #fff3e0;
  color: #ff8a00;
}
.summary-metric--blue .metric-icon {
  background: #e3f2fd;
  color: #168cff;
}
.summary-metric--red .metric-icon {
  background: #ffebed;
  color: #f53f3f;
}
.metric-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.metric-label {
  overflow: hidden;
  color: #999ea8;
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.metric-value {
  color: #1d2129;
  font-size: 22px;
  font-weight: 700;
  line-height: 26px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.metric-value small {
  font-size: 12px;
  font-weight: 400;
}
.summary-loading {
  position: absolute;
  top: 8px;
  right: 8px;
}

.project-list-panel {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: #fff;
}

.project-toolbar {
  flex: 0 0 auto;
  min-height: 44px;
  padding: 6px 0;
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
  width: 125px;
  flex: 0 0 125px;
}

.scope-field :deep(.arco-select) {
  width: 100%;
}
.scope-field :deep(.arco-select-view-single),
.search-group :deep(.arco-input-wrapper) {
  background: #f2f3f5;
  border-color: #f2f3f5;
}

.keyword-input {
  width: 273px;
}

.search-group {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.search-group :deep(.keyword-input .arco-input-wrapper) {
  border-radius: 2px;
}

.search-button {
  min-width: 82px;
  margin-left: 0;
  border-radius: 2px !important;
}

.project-link {
  display: block;
  max-width: 100%;
  overflow: hidden;
  border: 0;
  background: none;
  color: #165dff;
  font-size: 13px;
  font-weight: 400;
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
  grid-template-columns: 62px 34px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #4e5969;
  font-size: 12px;
  white-space: nowrap;
}
.progress :deep(.arco-progress-line-bar) {
  height: 6px !important;
}

:deep(.project-list-panel > .business-table) {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--project-border);
}
:deep(.project-list-panel .business-table__viewport) {
  max-height: none;
}
:deep(.project-list-panel .business-table__viewport > .arco-table) {
  width: max-content;
  min-width: 100%;
  overflow: visible;
}
:deep(.project-list-panel .arco-table-container) {
  width: max-content;
  min-width: 100%;
  overflow: visible;
  border: 0;
  border-radius: 0;
}
:deep(.project-list-panel .arco-table-element) {
  width: max-content;
  min-width: 100%;
  table-layout: fixed !important;
}
:deep(.project-list-panel .arco-table-th) {
  height: 44px;
  background: #f2f3f5;
  color: #1d2129;
  font-size: 13px;
  font-weight: 500;
}
:deep(.project-list-panel .arco-table-td) {
  height: 44px;
  color: #1d2129;
  font-size: 13px;
}
:deep(.project-list-panel .arco-table-th),
:deep(.project-list-panel .arco-table-td) {
  padding: 0 23px;
  border-color: var(--project-border);
  white-space: nowrap;
}
:deep(.project-list-panel .arco-table-tr:nth-child(even) .arco-table-td) {
  background: #f7f8fa;
}
:deep(.project-list-panel .arco-table-tr:hover .arco-table-td) {
  background: #e8f3ff;
}
:deep(.project-list-panel .arco-tag) {
  height: 18px;
  padding: 0 8px;
  border: 0;
  border-radius: 9px;
  color: #fff;
  font-size: 12px;
  line-height: 18px;
}

:deep(.project-page .arco-btn),
:deep(.project-page .arco-input-wrapper),
:deep(.project-page .arco-select-view-single) {
  border-radius: 2px;
}

@media (max-width: 1100px) {
  .summary-band {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .summary-metric:nth-of-type(3)::after {
    display: none;
  }
}

@media (max-width: 700px) {
  .project-page {
    padding: 8px;
    overflow: auto;
  }
  .summary-band {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .summary-metric {
    padding: 12px;
  }
  .summary-metric:nth-of-type(3)::after {
    display: block;
  }
  .summary-metric:nth-of-type(even)::after {
    display: none;
  }
  .project-toolbar :deep(.page-toolbar__filters) {
    flex-wrap: wrap;
  }
  .keyword-input {
    width: min(273px, calc(100vw - 42px));
  }
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
</style>
