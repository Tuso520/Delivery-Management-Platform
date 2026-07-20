<script setup lang="ts">
import { computed, ref, type CSSProperties } from 'vue'
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
} from '@/components/business'
import {
  useArchivedProjectListQuery,
  useProjectConfigurationQuery,
  useProjectListQuery,
  useProjectSummaryQuery,
} from '@/composables/queries/useProjectQueries'
import { usePermissionStore } from '@/store/permission'
import type {
  Project,
  ProjectDeliveryStage,
  ProjectScope,
  ProjectSummaryFilter,
  QueryProjectDto,
} from '@/types/project'
import { arcoConfirm } from '@/utils/arco-dialog'
import { formatAdaptiveNumber } from '@/utils/format'
import { projectDictionaryColor, type ProjectDictionaryKind } from '@/utils/project-dictionaries'
import { localizeProjectStage } from '@/utils/project-localization'
import summaryMoneyIcon from '@/assets/figma/project-overview/summary-money.svg'
import summaryFolderIcon from '@/assets/figma/project-overview/summary-folder.svg'
import summaryProgressIcon from '@/assets/figma/project-overview/summary-progress.svg'
import summaryAcceptanceIcon from '@/assets/figma/project-overview/summary-acceptance.svg'
import summaryRevenueIcon from '@/assets/figma/project-overview/summary-revenue.svg'
import selectDownIcon from '@/assets/figma/project-overview/select-down.svg'
import toolbarPlusIcon from '@/assets/figma/project-overview/toolbar-plus.svg'
import toolbarQueryAsset from '@/assets/figma/project-overview/toolbar-query.png'
import toolbarRefreshAsset from '@/assets/figma/project-overview/toolbar-refresh.png'

import ProjectDetail from './detail.vue'
import ProjectDrawer from './ProjectDrawer.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const permissionStore = usePermissionStore()
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
    icon: summaryMoneyIcon,
    label: t('projects.stats.totalAmount'),
    value: amountInTenThousands(summary.value.totalConvertedAmount),
    unit: summary.value.totalConvertedAmount === null ? '' : t('projects.stats.tenThousands'),
    tone: 'purple',
    filter: null,
  },
  {
    id: 'total',
    icon: summaryFolderIcon,
    key: 'ALL' as const,
    label: t('projects.stats.total'),
    value: String(summary.value.total),
    unit: t('projects.stats.items'),
    tone: 'green',
    filter: 'ALL' as const,
  },
  {
    id: 'active',
    icon: summaryProgressIcon,
    key: 'ACTIVE' as const,
    label: t('projects.stats.activeProjects'),
    value: String(summary.value.active),
    unit: t('projects.stats.items'),
    tone: 'orange',
    filter: 'ACTIVE' as const,
  },
  {
    id: 'accepted',
    icon: summaryAcceptanceIcon,
    label: t('projects.stats.acceptedThisYear'),
    value: String(summary.value.acceptedThisYear),
    unit: t('projects.stats.items'),
    tone: 'blue',
    filter: 'ACCEPTED_THIS_YEAR' as const,
  },
  {
    id: 'acceptedAmount',
    icon: summaryRevenueIcon,
    label: t('projects.stats.acceptedAmount'),
    value: amountInTenThousands(summary.value.acceptedConvertedAmount),
    unit: summary.value.acceptedConvertedAmount === null ? '' : t('projects.stats.tenThousands'),
    tone: 'red',
    filter: null,
  },
])
const canCreateProject = computed(() => permissionStore.hasPermission('project:create'))

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
function progressValue(project: Project): number {
  const value = Number(project.progressPercent ?? 0)
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
}
function memberName(project: Project, role: string): string {
  return project.members?.find((item) => item.projectRole === role)?.user?.realName || '—'
}

const stageStyles: Readonly<Record<ProjectDeliveryStage, CSSProperties>> = {
  STARTUP: { color: '#2563eb', backgroundColor: '#dbeafe', borderColor: '#93c5fd' },
  DEEPENING: { color: '#10b981', backgroundColor: '#d1fae5', borderColor: '#a7f3d0' },
  PROCUREMENT: { color: '#f97316', backgroundColor: '#ffedd5', borderColor: '#fed7aa' },
  CONSTRUCTION: { color: '#2563eb', backgroundColor: '#dbeafe', borderColor: '#93c5fd' },
  COMMISSIONING: { color: '#f97316', backgroundColor: '#ffedd5', borderColor: '#fed7aa' },
  TESTING: { color: '#2563eb', backgroundColor: '#dbeafe', borderColor: '#93c5fd' },
  INTERNAL_ACCEPTANCE: {
    color: '#10b981',
    backgroundColor: '#d1fae5',
    borderColor: '#a7f3d0',
  },
  EXTERNAL_ACCEPTANCE: {
    color: '#10b981',
    backgroundColor: '#d1fae5',
    borderColor: '#a7f3d0',
  },
  WARRANTY: { color: '#4e5969', backgroundColor: '#f2f3f5', borderColor: '#e5e6eb' },
}

function stageStyle(project: Project): CSSProperties {
  return stageStyles[project.currentStage]
}
function configuredOption(key: 'projectTypes' | 'contractTypes', value?: string | null) {
  return configurationQuery.data.value?.[key].find((item) => item.value === value)
}
function configuredColor(kind: ProjectDictionaryKind, value?: string | null): string | undefined {
  return value ? projectDictionaryColor(kind, value) : undefined
}

function dictionaryStyle(
  kind: ProjectDictionaryKind,
  value?: string | null,
): CSSProperties | undefined {
  if (!value) return undefined
  const palette = configuredColor(kind, value)
  if (palette === 'purple' || palette === 'magenta') {
    return { color: '#722ed1', backgroundColor: '#f5e8ff' }
  }
  if (palette === 'green' || palette === 'lime') {
    return { color: '#00b42a', backgroundColor: '#e8ffea' }
  }
  if (palette === 'orange' || palette === 'gold' || palette === 'red') {
    return { color: '#f97316', backgroundColor: '#ffedd5' }
  }
  return { color: '#165dff', backgroundColor: '#e8f3ff' }
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
        <span class="metric-icon"><img :src="metric.icon" alt="" /></span>
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
              <template #arrow-icon>
                <span class="select-arrow-box">
                  <img class="select-down-icon" :src="selectDownIcon" alt="" />
                </span>
              </template>
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
                <span class="figma-button-icon figma-button-icon--sprite">
                  <img :src="toolbarQueryAsset" alt="" />
                </span>
              </template>{{ t('projects.query') }}
            </a-button>
          </div>
        </template>
        <template #actions>
          <a-button :loading="activeQuery.isFetching.value" @click="refresh">
            <template #icon>
              <span class="figma-button-icon figma-button-icon--sprite">
                <img :src="toolbarRefreshAsset" alt="" />
              </span>
            </template>{{ t('projects.refresh') }}
          </a-button>
          <a-button
            v-if="!archivedView && canCreateProject"
            type="primary"
            @click="router.push('/projects/create')"
          >
            <template #icon>
              <img class="figma-button-icon" :src="toolbarPlusIcon" alt="" />
            </template>
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
        <a-table-column
          :title="t('projects.columns.name')"
          :width="120"
          fixed="left"
          align="center"
        >
          <template #cell="{ record: row }">
            <a-tooltip :content="displayName(row)">
              <button class="project-link" @click="openProject(row)">
                {{ displayName(row) }}
              </button>
            </a-tooltip>
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.manager')" :width="110" align="center">
          <template #title>
            <span class="manager-heading">{{ t('projects.columns.manager') }} <i>↕</i></span>
          </template>
          <template #cell="{ record: row }">
            {{ row.projectManager?.realName || memberName(row, 'PROJECT_MANAGER') }}
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.region')" :width="160" align="center">
          <template #cell="{ record: row }">
            <span class="cell-left nowrap">{{ region(row) }}</span>
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.currentStage')"
          :width="200"
          align="center"
        >
          <template #cell="{ record: row }">
            <span class="stage-cell">
              <span class="stage-tag" :style="stageStyle(row)">
                {{ localizeProjectStage(row.currentStage, 'zh-CN') }}
              </span>
            </span>
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.progress')"
          :width="180"
          align="center"
        >
          <template #cell="{ record: row }">
            <div class="progress">
              <span class="progress-track">
                <span
                  class="progress-fill"
                  :class="{ 'is-complete': progressValue(row) === 100 }"
                  :style="{ width: `${progressValue(row)}%` }"
                />
              </span>
              <span>{{ progressValue(row) }}%</span>
            </div>
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.signedAt')"
          :width="120"
          align="center"
        >
          <template #cell="{ record: row }">
            {{ date(row.contractSignedAt) }}
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.acceptanceAt')"
          :width="120"
          align="center"
        >
          <template #cell="{ record: row }">
            {{ acceptance(row) }}
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.contractAmount')"
          :width="160"
          align="center"
        >
          <template #cell="{ record: row }">
            <span class="cell-left money-cell">
              {{
                row.contractCurrency ? `${row.contractCurrency} ${amount(row.contractAmount)}` : '—'
              }}
            </span>
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.convertedCny')"
          :width="160"
          align="center"
        >
          <template #cell="{ record: row }">
            <span class="cell-left money-cell">
              {{ amount(row.convertedAmount) === '—' ? '—' : `CNY ${amount(row.convertedAmount)}` }}
            </span>
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.customerType')"
          :width="120"
          align="center"
        >
          <template #cell="{ record: row }">
            <span
              v-if="row.projectType"
              class="dictionary-tag"
              :style="dictionaryStyle('projectType', row.projectType)"
            >
              {{
                configuredOption('projectTypes', row.projectType)?.label || row.projectType
              }} </span><span v-else>—</span>
          </template>
        </a-table-column>
        <a-table-column v-else :title="t('projects.createForm.projectType')" :width="120">
          <template #cell="{ record: row }">
            {{ configuredOption('projectTypes', row.projectType)?.label || row.projectType || '—' }}
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.createForm.contractType')" :width="110" align="center">
          <template #cell="{ record: row }">
            <span
              v-if="row.contractType"
              class="dictionary-tag"
              :style="dictionaryStyle('contractType', row.contractType)"
            >
              {{
                configuredOption('contractTypes', row.contractType)?.label || row.contractType
              }} </span><span v-else>—</span>
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
            {{ row.salesOwner?.realName || memberName(row, 'SALES_OWNER') }}
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
      :width="944"
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
      :width="944"
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
.summary-metric:not(:disabled):hover {
  background: #f7f8fa;
}
.metric-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #eceefb;
  overflow: hidden;
}
.metric-icon img {
  width: 46px;
  height: 46px;
  display: block;
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
  min-height: 32px;
  height: 32px;
  margin-bottom: 12px;
  padding: 0;
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
.scope-field :deep(.arco-select-view-single) {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  line-height: 22px;
}
.scope-field :deep(.arco-select-view-value) {
  min-height: 0;
  height: 22px;
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0;
  line-height: 22px;
}
.scope-field :deep(.arco-select-view-suffix) {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 0;
  line-height: 0;
}
.scope-field :deep(.arco-select-view-single),
.search-group :deep(.arco-input-wrapper) {
  background: #f2f3f5;
  border-color: #f2f3f5;
}
.select-arrow-box {
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}
.select-down-icon {
  width: 12px;
  height: 12px;
  display: block;
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
.figma-button-icon {
  width: 14px;
  height: 14px;
  display: block;
}
.figma-button-icon--sprite {
  position: relative;
  overflow: hidden;
}
.figma-button-icon--sprite img {
  position: absolute;
  top: -9px;
  left: -16px;
  width: 82px;
  height: 32px;
  max-width: none;
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
.cell-left {
  width: 100%;
  display: block;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
}
.money-cell {
  min-width: max-content;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.progress {
  display: grid;
  grid-template-columns: 80px 34px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #4e5969;
  font-size: 12px;
  white-space: nowrap;
}
.progress-track {
  width: 80px;
  height: 6px;
  display: block;
  overflow: hidden;
  border-radius: 10px;
  background: #e5e6eb;
}
.progress-fill {
  height: 100%;
  display: block;
  background: #2563eb;
}
.progress-fill.is-complete {
  background: #10b981;
}
.stage-cell {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
}
.stage-tag {
  height: 18px;
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  border: 1px solid;
  border-radius: 2px;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  white-space: nowrap;
}
.dictionary-tag {
  min-width: 40px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  border-radius: 2px;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
}
.manager-heading {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.manager-heading i {
  color: #999;
  font-size: 13px;
  font-style: normal;
  font-weight: 400;
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
  padding: 0 12px;
  border-color: var(--project-border);
  white-space: nowrap;
}
:deep(.project-list-panel .arco-table-tr:nth-child(even) .arco-table-td) {
  background: #f7f8fa;
}
:deep(.project-list-panel .arco-table-tr:hover .arco-table-td) {
  background: #e8f3ff;
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
