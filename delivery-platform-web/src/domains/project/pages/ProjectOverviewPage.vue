<script setup lang="ts">
import { computed, ref, type CSSProperties } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  IconSort,
  IconSortAscending,
  IconSortDescending,
} from '@arco-design/web-vue/es/icon'

import { BusinessTable, PageContainer, PageToolbar } from '@/design-system'
import {
  useProjectListQuery,
  useProjectSummaryQuery,
} from '@/domains/project/queries/useProjectQueries'
import { usePermissionStore } from '@/store/permission'
import { useFieldConfig } from '@/platform/field-configuration'
import type {
  Project,
  ProjectScope,
  ProjectSort,
  ProjectSummaryFilter,
  QueryProjectDto,
} from '@/domains/project/types/project'
import { formatAdaptiveNumber } from '@/utils/format'
import {
  projectDictionaryColor,
  type ProjectDictionaryKind,
} from '@/domains/project/adapters/project-dictionaries'
import statTrendingUpIcon from '@/assets/figma/project-overview/stat-trending-up.svg'
import statCheckCircleIcon from '@/assets/figma/project-overview/stat-check-circle.svg'
import statLayersIcon from '@/assets/figma/project-overview/stat-layers.svg'
import statPlayIcon from '@/assets/figma/project-overview/stat-play.svg'
import statClipboardCheckIcon from '@/assets/figma/project-overview/stat-clipboard-check.svg'
import selectDownIcon from '@/assets/figma/project-overview/select-down.svg'
import toolbarPlusIcon from '@/assets/figma/project-overview/toolbar-plus.svg'
import toolbarQueryAsset from '@/assets/figma/project-overview/toolbar-query.png'
import toolbarRefreshAsset from '@/assets/figma/project-overview/toolbar-refresh.png'

import ProjectDetailDialog from '../components/ProjectDetailDialog.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const permissionStore = usePermissionStore()
const requestedScope = String(route.query.scope ?? '')
const scope = ref<ProjectScope>(
  ['mine', 'all', 'archived'].includes(requestedScope)
    ? (requestedScope as ProjectScope)
    : 'mine',
)
const requestedSort = String(route.query.sort ?? '')
const initialSort: ProjectSort = [
  'updatedAt:desc',
  'updatedAt:asc',
  'projectName:asc',
  'projectName:desc',
  'projectManager:asc',
  'projectManager:desc',
].includes(requestedSort)
  ? (requestedSort as ProjectSort)
  : 'updatedAt:desc'
const filters = ref<QueryProjectDto>({
  page: Number(route.query.page) || 1,
  pageSize: Number(route.query.pageSize) || 20,
  keyword: typeof route.query.keyword === 'string' ? route.query.keyword : '',
  scope: scope.value,
  summaryFilter: (route.query.summaryFilter as ProjectSummaryFilter) || 'ALL',
  sort: initialSort,
})
const listQuery = useProjectListQuery(filters)
const summaryFilters = computed<QueryProjectDto>(() => ({
  ...filters.value,
  page: 1,
  pageSize: 1,
  sort: undefined,
}))
const summaryQuery = useProjectSummaryQuery(summaryFilters)
const fieldConfig = useFieldConfig('project')
const configuredBaseCurrency = computed(() =>
  String(fieldConfig.getField('CURRENCY')?.defaultValue ?? ''),
)
const configuredBaseCurrencyLabel = computed(
  () =>
    fieldConfig.getFieldLabel('CURRENCY', configuredBaseCurrency.value) ||
    configuredBaseCurrency.value,
)
const convertedCurrencyTitle = computed(() =>
  configuredBaseCurrencyLabel.value
    ? t('projects.columns.convertedAmount', {
        currency: configuredBaseCurrencyLabel.value,
      })
    : t('projects.columns.convertedCny'),
)
const projects = computed(() => listQuery.data.value?.items ?? [])
const pagination = computed(() => ({
  page: listQuery.data.value?.page ?? 1,
  pageSize: listQuery.data.value?.pageSize ?? 20,
  total: listQuery.data.value?.total ?? 0,
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
const summaryMetrics = computed(() => [
  {
    id: 'amount',
    icon: statTrendingUpIcon,
    label: t('projects.stats.totalAmount'),
    value: amountInTenThousands(summary.value.totalConvertedAmount),
    unit: summary.value.totalConvertedAmount === null ? '' : t('projects.stats.tenThousands'),
    filter: null,
  },
  {
    id: 'acceptedAmount',
    icon: statCheckCircleIcon,
    label: t('projects.stats.acceptedAmount'),
    value: amountInTenThousands(summary.value.acceptedConvertedAmount),
    unit: summary.value.acceptedConvertedAmount === null ? '' : t('projects.stats.tenThousands'),
    filter: null,
  },
  {
    id: 'total',
    icon: statLayersIcon,
    key: 'ALL' as const,
    label: t('projects.stats.total'),
    value: String(summary.value.total),
    unit: t('projects.stats.items'),
    filter: 'ALL' as const,
  },
  {
    id: 'active',
    icon: statPlayIcon,
    key: 'ACTIVE' as const,
    label: t('projects.stats.activeProjects'),
    value: String(summary.value.active),
    unit: t('projects.stats.items'),
    filter: 'ACTIVE' as const,
  },
  {
    id: 'accepted',
    icon: statClipboardCheckIcon,
    label: t('projects.stats.acceptedThisYear'),
    value: String(summary.value.acceptedThisYear),
    unit: t('projects.stats.items'),
    filter: 'ACCEPTED_THIS_YEAR' as const,
  },
])
const canCreateProject = computed(() => permissionStore.hasPermission('project:create'))
const managerSort = computed(() =>
  filters.value.sort === 'projectManager:asc' || filters.value.sort === 'projectManager:desc'
    ? filters.value.sort
    : null,
)

const drawerMode = computed<'create' | 'edit' | 'view' | null>(() => {
  if (route.path === '/projects/create') return 'create'
  if (route.path.endsWith('/edit')) return 'edit'
  if (route.params.projectId) return 'view'
  return null
})
const drawerProjectId = computed(() => String(route.params.projectId || ''))
const projectDialogVisible = computed({
  get: () => drawerMode.value !== null,
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
      keyword: filters.value.keyword || undefined,
      summaryFilter:
        filters.value.summaryFilter === 'ALL' ? undefined : filters.value.summaryFilter,
      page: filters.value.page === 1 ? undefined : String(filters.value.page),
      pageSize: filters.value.pageSize === 20 ? undefined : String(filters.value.pageSize),
      sort: filters.value.sort === 'updatedAt:desc' ? undefined : filters.value.sort,
    },
  })
}
function search(): void {
  filters.value.page = 1
  void syncUrl()
}
function changeView(value: ProjectScope): void {
  scope.value = value
  filters.value.scope = scope.value
  filters.value.page = 1
  void syncUrl()
}
function selectSummary(key: ProjectSummaryFilter): void {
  filters.value.summaryFilter = key
  filters.value.page = 1
  void syncUrl()
}
function changePage(page: number): void {
  filters.value.page = page
  void syncUrl()
}
function toggleManagerSort(): void {
  filters.value.sort =
    filters.value.sort === 'projectManager:asc' ? 'projectManager:desc' : 'projectManager:asc'
  filters.value.page = 1
  void syncUrl()
}
async function refresh(): Promise<void> {
  await Promise.allSettled([listQuery.refetch(), summaryQuery.refetch(), fieldConfig.refresh()])
}
function openProject(project: Project): void {
  void router.push({ path: `/projects/${project.id}`, query: route.query })
}
async function closeOverlay(): Promise<void> {
  await router.push({ path: '/projects', query: route.query })
}
async function saved(): Promise<void> {
  await closeOverlay()
  await refresh()
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
function currencyLabel(currencyCode?: string | null): string {
  if (!currencyCode) return '—'
  return configuredOption('CURRENCY', currencyCode)?.label || currencyCode
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

function projectStages(project: Project): string[] {
  return project.currentStages?.length ? project.currentStages : [project.currentStage]
}

function stageStyle(stage: string): CSSProperties {
  const palette = projectDictionaryColor('projectStage', stage)
  if (palette === 'green' || palette === 'lime') {
    return { color: '#10b981', backgroundColor: '#d1fae5', borderColor: '#a7f3d0' }
  }
  if (palette === 'orange' || palette === 'gold') {
    return { color: '#f97316', backgroundColor: '#ffedd5', borderColor: '#fed7aa' }
  }
  if (palette === 'purple') {
    return { color: '#722ed1', backgroundColor: '#f5e8ff', borderColor: '#d3adf7' }
  }
  return { color: '#2563eb', backgroundColor: '#dbeafe', borderColor: '#93c5fd' }
}
function configuredOption(fieldCode: string, value?: string | null) {
  return fieldConfig.getFieldOptions(fieldCode, true).find((item) => item.value === value)
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
  <PageContainer class="project-page" gap="normal" :scrollable="false">
    <section class="summary-band" :aria-label="t('projects.summaryAria')">
      <button
        v-for="metric in summaryMetrics"
        :key="metric.id"
        type="button"
        class="summary-metric"
        :class="{
          'is-active': metric.filter && filters.summaryFilter === metric.filter,
        }"
        :aria-pressed="metric.filter ? filters.summaryFilter === metric.filter : undefined"
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
            <a-select :model-value="scope" @change="changeView($event as ProjectScope)">
              <a-option value="mine" :label="t('projects.scope.mine')" />
              <a-option value="all" :label="t('projects.scope.all')" />
              <a-option value="archived" :label="t('projects.scope.archived')" />
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
          <a-button :loading="listQuery.isFetching.value" @click="refresh">
            <template #icon>
              <span class="figma-button-icon figma-button-icon--sprite">
                <img :src="toolbarRefreshAsset" alt="" />
              </span>
            </template>{{ t('projects.refresh') }}
          </a-button>
          <a-button v-if="canCreateProject" type="primary" @click="router.push('/projects/create')">
            <template #icon>
              <img class="figma-button-icon" :src="toolbarPlusIcon" alt="" />
            </template>
            {{ t('projects.create') }}
          </a-button>
        </template>
      </PageToolbar>

      <div class="project-table-frame">
        <BusinessTable
          :data="projects"
          :loading="listQuery.isFetching.value"
          :error="listQuery.error.value"
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
              <button
                type="button"
                class="manager-sort-button"
                :aria-label="t('projects.managerSort')"
                @click="toggleManagerSort"
              >
                {{ t('projects.columns.manager') }}
                <IconSortAscending v-if="managerSort === 'projectManager:asc'" />
                <IconSortDescending v-else-if="managerSort === 'projectManager:desc'" />
                <IconSort v-else />
              </button>
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
          <a-table-column :title="t('projects.columns.currentStage')" :width="200" align="center">
            <template #cell="{ record: row }">
              <span class="stage-cell">
                <span
                  v-for="stage in projectStages(row)"
                  :key="stage"
                  class="stage-tag"
                  :style="stageStyle(stage)"
                >
                  {{ fieldConfig.getFieldLabel('PROJECT_STAGE', stage) }}
                </span>
              </span>
            </template>
          </a-table-column>
          <a-table-column :title="t('projects.columns.progress')" :width="180" align="center">
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
          <a-table-column :title="t('projects.columns.signedAt')" :width="120" align="center">
            <template #cell="{ record: row }">
              {{ date(row.contractSignedAt) }}
            </template>
          </a-table-column>
          <a-table-column :title="t('projects.columns.acceptanceAt')" :width="120" align="center">
            <template #cell="{ record: row }">
              {{ acceptance(row) }}
            </template>
          </a-table-column>
          <a-table-column :title="t('projects.columns.contractCurrency')" :width="110" align="center">
            <template #cell="{ record: row }">
              {{ currencyLabel(row.contractCurrency) }}
            </template>
          </a-table-column>
          <a-table-column :title="t('projects.columns.contractAmount')" :width="160" align="center">
            <template #cell="{ record: row }">
              <span class="cell-left money-cell">
                {{ amount(row.contractAmount) }}
              </span>
            </template>
          </a-table-column>
          <a-table-column :title="convertedCurrencyTitle" :width="160" align="center">
            <template #cell="{ record: row }">
              <span class="cell-left money-cell">
                {{ amount(row.convertedAmount) }}
              </span>
            </template>
          </a-table-column>
          <a-table-column :title="t('projects.columns.customerType')" :width="120" align="center">
            <template #cell="{ record: row }">
              <span
                v-if="row.customerType"
                class="dictionary-tag"
                :style="dictionaryStyle('customerType', row.customerType)"
              >
                {{
                  configuredOption('CUSTOMER_TYPE', row.customerType)?.label || row.customerType
                }} </span><span v-else>—</span>
            </template>
          </a-table-column>
          <a-table-column
            :title="t('projects.createForm.contractType')"
            :width="110"
            align="center"
          >
            <template #cell="{ record: row }">
              <span
                v-if="row.contractType"
                class="dictionary-tag"
                :style="dictionaryStyle('contractType', row.contractType)"
              >
                {{
                  configuredOption('CONTRACT_TYPE', row.contractType)?.label || row.contractType
                }} </span><span v-else>—</span>
            </template>
          </a-table-column>
          <a-table-column :title="t('projects.columns.sales')" :width="100" align="center">
            <template #cell="{ record: row }">
              {{ row.salesOwner?.realName || memberName(row, 'SALES_OWNER') }}
            </template>
          </a-table-column>
        </BusinessTable>
      </div>
    </section>

    <ProjectDetailDialog
      v-if="drawerMode"
      v-model:visible="projectDialogVisible"
      :mode="drawerMode"
      :project-id="drawerProjectId"
      @saved="saved"
    />
  </PageContainer>
</template>

<style scoped>
.project-page {
  --project-action: #2563eb;
  --project-action-hover: #1d4ed8;
  --project-complete: #10b981;
  --project-border: var(--app-border);
  --project-header-bg: var(--app-fill-strong);
  --project-row-alt: var(--app-fill-soft);
  --project-text: var(--color-text-1);
  --project-text-secondary: var(--color-text-2);
  --project-text-muted: #999ea8;
  height: 100%;
  padding: 13px;
  overflow: hidden;
  border-radius: 0;
  background: var(--color-bg-1);
  color: var(--project-text);
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
  height: 94px;
  min-width: 0;
  align-self: center;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}
.summary-metric:not(:disabled) {
  cursor: pointer;
}
.summary-metric:not(:disabled):hover {
  background: var(--project-row-alt);
}
.metric-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  overflow: hidden;
}
.metric-icon img {
  width: 28px;
  height: 28px;
  display: block;
}
.metric-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.metric-label {
  overflow: hidden;
  color: var(--project-text-muted);
  font-size: 12px;
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.metric-value {
  color: var(--project-text);
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
  background: var(--color-bg-1);
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
  height: 32px;
  padding: 0 12px;
  border-radius: 2px;
}

.project-toolbar :deep(.arco-btn) {
  height: 32px;
  min-width: 82px;
  gap: 8px;
  padding: 0 16px;
  border-color: var(--project-header-bg);
  border-radius: 2px;
  background: var(--project-header-bg);
  color: var(--project-text-secondary);
}
.project-toolbar :deep(.arco-btn:hover) {
  border-color: var(--project-row-alt);
  background: var(--project-row-alt);
}
.project-toolbar :deep(.arco-btn-primary) {
  border-color: var(--project-action);
  background: var(--project-action);
  color: #fff;
}
.project-toolbar :deep(.arco-btn-primary:hover) {
  border-color: var(--project-action-hover);
  background: var(--project-action-hover);
}
.project-toolbar :deep(.arco-btn-icon) {
  margin-right: 0;
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
  width: 100%;
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
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.progress {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  color: var(--project-text-secondary);
  font-size: 13px;
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
  background: var(--project-action);
}
.progress-fill.is-complete {
  background: var(--project-complete);
}
.stage-cell {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  overflow: hidden;
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
  flex: 0 0 auto;
  white-space: nowrap;
}
.manager-sort-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.manager-sort-button :deep(svg) {
  color: #999;
  font-size: 13px;
}
.manager-sort-button:hover,
.manager-sort-button:focus-visible {
  color: var(--project-action);
}

.project-table-frame {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--project-border);
}
.project-table-frame > :deep(.business-table) {
  min-height: 0;
  flex: 1;
}
.project-table-frame > :deep(.arco-result) {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
:deep(.project-list-panel .business-table__viewport) {
  max-height: none;
  scrollbar-color: #b5babf #f0f2f2;
  scrollbar-width: auto;
}
:deep(.project-list-panel .business-table__viewport::-webkit-scrollbar) {
  width: 6px;
  height: 10px;
}
:deep(.project-list-panel .business-table__viewport::-webkit-scrollbar-track) {
  background: #f0f2f2;
}
:deep(.project-list-panel .business-table__viewport::-webkit-scrollbar-thumb) {
  border: 0;
  border-radius: 3px;
  background: #b5babf;
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
  background: var(--project-header-bg);
  color: var(--project-text);
  font-size: 13px;
  font-weight: 500;
}
:deep(.project-list-panel .arco-table-td) {
  height: 44px;
  color: var(--project-text);
  font-size: 13px;
}
:deep(.project-list-panel .arco-table-th),
:deep(.project-list-panel .arco-table-td) {
  padding: 0;
  border-color: var(--project-border);
  white-space: nowrap;
}
:deep(.project-list-panel .arco-table-cell) {
  width: 100%;
  height: 100%;
  padding: 0 12px;
}
:deep(.project-list-panel .arco-table) {
  font-family: inherit;
}
:deep(.project-list-panel .arco-table-tr:nth-child(even) .arco-table-td) {
  background: var(--project-row-alt);
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
}

@media (max-width: 900px) {
  .project-toolbar {
    height: auto;
    min-height: 32px;
    flex-wrap: wrap;
  }
  .project-toolbar :deep(.page-toolbar__filters),
  .project-toolbar :deep(.page-toolbar__actions) {
    width: auto;
  }
  .project-toolbar :deep(.page-toolbar__actions) {
    margin-left: 0;
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
  .project-toolbar :deep(.page-toolbar__filters) {
    flex-wrap: wrap;
  }
  .keyword-input {
    width: min(273px, calc(100vw - 42px));
  }
}
</style>
