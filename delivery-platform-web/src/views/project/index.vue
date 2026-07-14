<script setup lang="ts">
import { computed, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMutation } from '@tanstack/vue-query'

import { projectApi } from '@/api/project'
import { BusinessDrawer, BusinessTable, PageContainer, PageToolbar, SectionCard, StatCard } from '@/components/business'
import { useArchivedProjectListQuery, useProjectListQuery, useProjectSummaryQuery } from '@/composables/queries/useProjectQueries'
import type { Project, ProjectScope, ProjectSummaryFilter, QueryProjectDto } from '@/types/project'
import { arcoConfirm } from '@/utils/arco-dialog'
import {
  CONTRACT_TYPE_OPTIONS, PROJECT_STAGE_COLORS, PROJECT_TYPE_OPTIONS, findProjectDictionaryOption,
} from '@/utils/project-dictionaries'
import { localizeProjectStage } from '@/utils/project-localization'

import ProjectDetail from './detail.vue'
import ProjectDrawer from './ProjectDrawer.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const scope = ref<ProjectScope>((route.query.scope as ProjectScope) || 'mine')
const archivedView = ref(route.query.view === 'archived')
const filters = ref<QueryProjectDto>({
  page: Number(route.query.page) || 1, pageSize: Number(route.query.pageSize) || 20,
  keyword: typeof route.query.keyword === 'string' ? route.query.keyword : '',
  scope: scope.value,
  summaryFilter: (route.query.summaryFilter as ProjectSummaryFilter) || 'ALL',
  sort: 'updatedAt:desc',
})
const listQuery = useProjectListQuery(filters)
const archivedQuery = useArchivedProjectListQuery(filters)
const summaryQuery = useProjectSummaryQuery(scope)
const activeQuery = computed(() => archivedView.value ? archivedQuery : listQuery)
const projects = computed(() => activeQuery.value.data.value?.items ?? [])
const pagination = computed(() => ({
  page: activeQuery.value.data.value?.page ?? 1,
  pageSize: activeQuery.value.data.value?.pageSize ?? 20,
  total: activeQuery.value.data.value?.total ?? 0,
}))
const summary = computed(() => summaryQuery.data.value ?? { total: 0, active: 0, accepted: 0, highRisk: 0 })
const summaryCards = computed(() => [
  { key: 'ALL' as const, label: t('projects.stats.total'), value: summary.value.total, tone: 'blue' as const },
  { key: 'ACTIVE' as const, label: t('projects.stats.active'), value: summary.value.active, tone: 'green' as const },
  { key: 'ACCEPTED' as const, label: t('projects.stats.accepted'), value: summary.value.accepted, tone: 'cyan' as const },
  { key: 'HIGH_RISK' as const, label: t('projects.stats.highRisk'), value: summary.value.highRisk, tone: 'red' as const },
])

const drawerMode = computed<'create' | 'edit' | 'view' | null>(() => {
  if (route.path === '/projects/create') return 'create'
  if (route.path.endsWith('/edit')) return 'edit'
  if (route.params.projectId) return 'view'
  return null
})
const drawerProjectId = computed(() => String(route.params.projectId || ''))
const drawerVisible = computed({ get: () => drawerMode.value !== null, set: (value) => { if (!value) void closeDrawer() } })

async function syncUrl(): Promise<void> {
  filters.value.scope = scope.value
  await router.replace({ path: '/projects', query: {
    scope: scope.value === 'mine' ? undefined : scope.value,
    view: archivedView.value ? 'archived' : undefined,
    keyword: filters.value.keyword || undefined,
    summaryFilter: filters.value.summaryFilter === 'ALL' ? undefined : filters.value.summaryFilter,
    page: filters.value.page === 1 ? undefined : String(filters.value.page),
    pageSize: filters.value.pageSize === 20 ? undefined : String(filters.value.pageSize),
  } })
}
function search(): void { filters.value.page = 1; void syncUrl() }
function changeScope(value: ProjectScope): void { scope.value = value; filters.value.scope = value; filters.value.page = 1; void syncUrl() }
function selectSummary(key: ProjectSummaryFilter): void { archivedView.value = false; filters.value.summaryFilter = key; filters.value.page = 1; void syncUrl() }
function toggleArchive(): void { archivedView.value = !archivedView.value; filters.value.page = 1; void syncUrl() }
function changePage(page: number): void { filters.value.page = page; void syncUrl() }
function changePageSize(pageSize: number): void { filters.value.pageSize = pageSize; filters.value.page = 1; void syncUrl() }
async function refresh(): Promise<void> { await Promise.allSettled([listQuery.refetch(), archivedQuery.refetch(), summaryQuery.refetch()]) }
function openProject(project: Project): void { void router.push(`/projects/${project.id}`) }
async function closeDrawer(): Promise<void> { await router.push({ path: '/projects', query: route.query.view ? { view: route.query.view } : {} }) }
async function saved(): Promise<void> { await closeDrawer(); await refresh() }

const archiveMutation = useMutation({
  mutationFn: ({ project, command }: { project: Project; command: 'archive' | 'restore' }) =>
    projectApi.changeStatus(project.id, command, { revision: project.revision }), retry: false,
  onSuccess: refresh,
})
const deleteMutation = useMutation({
  mutationFn: (id: string) => projectApi.permanentDelete(id), retry: false, onSuccess: refresh,
})
async function restore(project: Project): Promise<void> {
  await arcoConfirm(`确认恢复“${displayName(project)}”？`, '恢复项目')
  await archiveMutation.mutateAsync({ project, command: 'restore' })
  Message.success('项目已恢复')
}
async function permanentDelete(project: Project): Promise<void> {
  await arcoConfirm(`“${displayName(project)}”删除后不可恢复。`, '永久删除项目', { type: 'error', confirmButtonText: '继续' })
  await arcoConfirm('这是最终确认：永久删除该归档项目？', '确认不可恢复操作', { type: 'error', confirmButtonText: '永久删除' })
  await deleteMutation.mutateAsync(project.id)
  Message.success('项目已永久删除')
}
function displayName(project: Project): string { return project.shortName?.trim() || project.projectName }
function region(project: Project): string { return `${project.countryName || project.countryCode} / ${project.city || '—'}` }
function date(value?: string | null): string { return value ? value.slice(0, 10) : '—' }
function acceptance(project: Project): string { return project.actualAcceptanceAt ? date(project.actualAcceptanceAt) : date(project.expectedAcceptanceAt) }
function amount(value?: number | null): string { return value == null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value) }
function memberName(project: Project, role: string): string { return project.members?.find((item) => item.projectRole === role)?.user?.realName || '—' }
function stageColor(project: Project): string { return PROJECT_STAGE_COLORS[project.currentStage] }
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

    <PageToolbar>
      <template #filters>
        <a-select :model-value="scope" class="scope-select" @change="changeScope($event as ProjectScope)">
          <a-option value="mine" :label="t('projects.scope.mine')" /><a-option value="all" :label="t('projects.scope.all')" />
        </a-select>
        <a-input
          v-model="filters.keyword"
          class="keyword-input"
          allow-clear
          :placeholder="t('projects.searchPlaceholder')"
          @press-enter="search"
        />
        <a-button type="primary" @click="search">
          {{ t('common.search') }}
        </a-button>
      </template>
      <template #actions>
        <a-button @click="toggleArchive">
          {{ archivedView ? t('projects.archiveView.normal') : t('projects.archiveView.archived') }}
        </a-button>
        <a-button :loading="activeQuery.isFetching.value" @click="refresh">
          {{ t('projects.refresh') }}
        </a-button>
        <a-button v-if="!archivedView" type="primary" @click="router.push('/projects/create')">
          {{ t('projects.create') }}
        </a-button>
      </template>
    </PageToolbar>

    <SectionCard class="table-card" :bordered="false">
      <BusinessTable
        :data="projects"
        :loading="activeQuery.isFetching.value"
        :pagination="pagination"
        :scroll="{ x: archivedView ? 1280 : 1760 }"
        row-key="id"
        bordered
        stripe
        @page-change="changePage"
        @page-size-change="changePageSize"
      >
        <a-table-column :title="t('projects.columns.name')" :width="280" fixed="left">
          <template #cell="{ record: row }">
            <a-tooltip :content="displayName(row)">
              <button class="project-link" @click="openProject(row)">
                {{ displayName(row) }}
              </button>
            </a-tooltip>
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.region')" :width="190">
          <template #cell="{ record: row }">
            <span class="nowrap">{{ region(row) }}</span>
          </template>
        </a-table-column>
        <a-table-column v-if="!archivedView" :title="t('projects.columns.classification')" :width="190">
          <template #cell="{ record: row }">
            <a-space :wrap="false">
              <a-tag v-if="row.projectType" :color="findProjectDictionaryOption(PROJECT_TYPE_OPTIONS, row.projectType)?.color">
                {{ findProjectDictionaryOption(PROJECT_TYPE_OPTIONS, row.projectType)?.label || row.projectType }}
              </a-tag><a-tag v-if="row.contractType" :color="findProjectDictionaryOption(CONTRACT_TYPE_OPTIONS, row.contractType)?.color">
                {{ row.contractType }}
              </a-tag><span v-if="!row.projectType && !row.contractType">—</span>
            </a-space>
          </template>
        </a-table-column>
        <a-table-column v-else :title="t('projects.createForm.projectType')" :width="130">
          <template #cell="{ record: row }">
            {{ findProjectDictionaryOption(PROJECT_TYPE_OPTIONS, row.projectType)?.label || row.projectType || '—' }}
          </template>
        </a-table-column>
        <a-table-column
          v-if="archivedView"
          :title="t('projects.createForm.contractType')"
          :width="110"
          data-index="contractType"
        />
        <a-table-column v-if="!archivedView" :title="t('projects.columns.currentStage')" :width="130">
          <template #cell="{ record: row }">
            <a-tag :color="stageColor(row)">
              {{ localizeProjectStage(row.currentStage, 'zh-CN') }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column v-if="!archivedView" :title="t('projects.columns.progress')" :width="180">
          <template #cell="{ record: row }">
            <div class="progress">
              <a-progress :percent="(row.progressPercent || 0) / 100" :show-text="false" size="small" /><span>{{ row.progressPercent ?? 0 }}%</span>
            </div>
          </template>
        </a-table-column>
        <a-table-column v-if="!archivedView" :title="t('projects.columns.signedAt')" :width="120">
          <template #cell="{ record: row }">
            {{ date(row.contractSignedAt) }}
          </template>
        </a-table-column>
        <a-table-column v-if="!archivedView" :title="t('projects.columns.acceptanceAt')" :width="120">
          <template #cell="{ record: row }">
            {{ acceptance(row) }}
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.contractAmount')"
          :width="160"
          align="right"
        >
          <template #cell="{ record: row }">
            {{ row.contractCurrency ? `${row.contractCurrency} ${amount(row.contractAmount)}` : '—' }}
          </template>
        </a-table-column>
        <a-table-column
          v-if="!archivedView"
          :title="t('projects.columns.convertedCny')"
          :width="160"
          align="right"
        >
          <template #cell="{ record: row }">
            {{ row.convertedAmount == null ? '—' : `CNY ${amount(row.convertedAmount)}` }}
          </template>
        </a-table-column>
        <a-table-column v-if="archivedView" :title="t('projects.columns.archivedBy')" :width="130">
          <template #cell="{ record: row }">
            {{ row.archivedByUser?.realName || '—' }}
          </template>
        </a-table-column>
        <a-table-column v-if="archivedView" :title="t('projects.columns.archivedAt')" :width="170">
          <template #cell="{ record: row }">
            {{ row.archivedAt ? row.archivedAt.slice(0, 16).replace('T', ' ') : '—' }}
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.sales')" :width="120">
          <template #cell="{ record: row }">
            {{ memberName(row, 'SALES_OWNER') }}
          </template>
        </a-table-column>
        <a-table-column :title="t('projects.columns.manager')" :width="120">
          <template #cell="{ record: row }">
            {{ memberName(row, 'PROJECT_MANAGER') }}
          </template>
        </a-table-column>
        <a-table-column
          v-if="archivedView"
          :title="t('common.action')"
          :width="210"
          fixed="right"
        >
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
    </SectionCard>

    <BusinessDrawer
      v-model:visible="drawerVisible"
      :title="drawerMode === 'create' ? t('projects.create') : drawerMode === 'edit' ? t('projects.edit') : t('projects.detail')"
      size="xl"
      :footer="false"
    >
      <ProjectDrawer
        v-if="drawerMode === 'create' || drawerMode === 'edit'"
        :mode="drawerMode"
        :project-id="drawerProjectId"
        @saved="saved"
        @cancel="closeDrawer"
      />
      <ProjectDetail
        v-else-if="drawerMode === 'view'"
        embedded
        :project-id="drawerProjectId"
        @edit="router.push(`/projects/${drawerProjectId}/edit`)"
        @close="closeDrawer"
        @changed="refresh"
      />
    </BusinessDrawer>
  </PageContainer>
</template>

<style scoped>
.project-page { height: 100%; overflow: hidden; }
.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.scope-select { width: 130px; }.keyword-input { width: min(480px, 42vw); }
.table-card { flex: 1; min-height: 0; }.project-link { width: 100%; overflow: hidden; border: 0; background: none; color: rgb(var(--primary-6)); text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.nowrap { white-space: nowrap; }.progress { display: grid; grid-template-columns: minmax(80px, 1fr) 42px; align-items: center; gap: 8px; white-space: nowrap; }
:deep(.arco-table-th), :deep(.arco-table-td) { white-space: nowrap; }
@media (max-width: 900px) { .summary-grid { grid-template-columns: repeat(2, 1fr); }.keyword-input { width: 100%; } }
</style>
