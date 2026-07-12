<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  IconCheckCircle as CircleCheck,
  IconExclamationCircleFill as WarningFilled,
  IconFolder as FolderOpened,
  IconPlayCircle as VideoPlay,
} from '@arco-design/web-vue/es/icon'

import { useDashboardQueries } from '@/composables/queries/useDashboardQueries'
import { useLocaleStore } from '@/store/locale'
import { useUserStore } from '@/store/user'
import type { DashboardProjectSummary } from '@/types/dashboard'

import DashboardOverviewBand from './components/DashboardOverviewBand.vue'
import DashboardSection from './components/DashboardSection.vue'
import DashboardTasks from './components/DashboardTasks.vue'
import HighRiskProjects from './components/HighRiskProjects.vue'
import RecentActivities from './components/RecentActivities.vue'
import RecentProjects from './components/RecentProjects.vue'
import StatCards from './components/StatCards.vue'

const EMPTY_SUMMARY: DashboardProjectSummary = {
  total: 0,
  active: 0,
  accepted: 0,
  highRisk: 0,
}

const userStore = useUserStore()
const localeStore = useLocaleStore()
const queries = useDashboardQueries()
const { t } = useI18n()

const userInfo = computed(() => userStore.userInfo)
const summary = computed(() => queries.projectSummary.data.value ?? EMPTY_SUMMARY)
const tasks = computed(() => queries.myTasks.data.value ?? [])
const highRisks = computed(() => queries.highRisks.data.value ?? [])
const recentProjects = computed(() => queries.recentProjects.data.value ?? [])
const recentActivities = computed(() => queries.recentActivities.data.value ?? [])

const todayLabel = computed(() =>
  new Intl.DateTimeFormat(localeStore.currentLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date()),
)

const userDisplayName = computed(
  () => userInfo.value?.realName || userInfo.value?.username || t('shell.userFallback'),
)

const dashboardHeadline = computed(() => t('dashboard.welcome', { name: userDisplayName.value }))

const dashboardDescription = computed(() =>
  t('dashboard.today', {
    date: todayLabel.value,
    description: t('dashboard.defaultDescription'),
  }),
)

function queryLabel(pending: boolean, failed: boolean, value: number): string {
  return pending || failed ? '--' : String(value)
}

const statCards = computed(() => [
  {
    title: t('dashboard.stats.total'),
    value: queryLabel(
      queries.projectSummary.isPending.value,
      queries.projectSummary.isError.value,
      summary.value.total,
    ),
    icon: FolderOpened,
    color: '#165dff',
  },
  {
    title: t('dashboard.stats.active'),
    value: queryLabel(
      queries.projectSummary.isPending.value,
      queries.projectSummary.isError.value,
      summary.value.active,
    ),
    icon: VideoPlay,
    color: '#00b42a',
  },
  {
    title: t('dashboard.stats.accepted'),
    value: queryLabel(
      queries.projectSummary.isPending.value,
      queries.projectSummary.isError.value,
      summary.value.accepted,
    ),
    icon: CircleCheck,
    color: '#3f7869',
  },
  {
    title: t('dashboard.stats.highRisk'),
    value: queryLabel(
      queries.projectSummary.isPending.value,
      queries.projectSummary.isError.value,
      summary.value.highRisk,
    ),
    icon: WarningFilled,
    color: '#f53f3f',
  },
])

const activeProjectLabel = computed(() =>
  queryLabel(
    queries.projectSummary.isPending.value,
    queries.projectSummary.isError.value,
    summary.value.active,
  ),
)
const taskLabel = computed(() =>
  queryLabel(queries.myTasks.isPending.value, queries.myTasks.isError.value, tasks.value.length),
)
const riskLabel = computed(() =>
  queryLabel(
    queries.highRisks.isPending.value,
    queries.highRisks.isError.value,
    highRisks.value.length,
  ),
)

function retryProjectSummary(): void {
  void queries.projectSummary.refetch()
}
function retryMyTasks(): void {
  void queries.myTasks.refetch()
}
function retryHighRisks(): void {
  void queries.highRisks.refetch()
}
function retryRecentProjects(): void {
  void queries.recentProjects.refetch()
}
function retryRecentActivities(): void {
  void queries.recentActivities.refetch()
}
</script>

<template>
  <div class="dashboard-page">
    <DashboardOverviewBand
      :headline="dashboardHeadline"
      :description="dashboardDescription"
      :active-project-label="activeProjectLabel"
      :task-label="taskLabel"
      :risk-label="riskLabel"
    />

    <DashboardSection
      :title="t('dashboard.overview')"
      :description="t('dashboard.overviewDescription')"
      :loading="queries.projectSummary.isPending.value"
      :refreshing="queries.projectSummary.isFetching.value"
      :error="queries.projectSummary.isError.value"
      @retry="retryProjectSummary"
    >
      <StatCards :cards="statCards" />
    </DashboardSection>

    <div class="primary-grid">
      <DashboardSection
        :title="t('dashboard.myTasks')"
        :description="t('dashboard.tasksDescription')"
        :loading="queries.myTasks.isPending.value"
        :refreshing="queries.myTasks.isFetching.value"
        :error="queries.myTasks.isError.value"
        :count="tasks.length"
        @retry="retryMyTasks"
      >
        <DashboardTasks :tasks="tasks" />
      </DashboardSection>

      <DashboardSection
        :title="t('dashboard.highRiskProjects')"
        :description="t('dashboard.risksDescription')"
        :loading="queries.highRisks.isPending.value"
        :refreshing="queries.highRisks.isFetching.value"
        :error="queries.highRisks.isError.value"
        :count="highRisks.length"
        @retry="retryHighRisks"
      >
        <HighRiskProjects :projects="highRisks" />
      </DashboardSection>
    </div>

    <div class="secondary-grid">
      <DashboardSection
        :title="t('dashboard.recentProjects')"
        :description="t('dashboard.recentProjectsDescription')"
        :loading="queries.recentProjects.isPending.value"
        :refreshing="queries.recentProjects.isFetching.value"
        :error="queries.recentProjects.isError.value"
        :count="recentProjects.length"
        @retry="retryRecentProjects"
      >
        <RecentProjects :projects="recentProjects" />
      </DashboardSection>

      <DashboardSection
        :title="t('dashboard.recentActivities')"
        :description="t('dashboard.recentActivitiesDescription')"
        :loading="queries.recentActivities.isPending.value"
        :refreshing="queries.recentActivities.isFetching.value"
        :error="queries.recentActivities.isError.value"
        :count="recentActivities.length"
        @retry="retryRecentActivities"
      >
        <RecentActivities :activities="recentActivities" />
      </DashboardSection>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dashboard-page {
  width: 100%;
  min-width: 0;
}

.primary-grid,
.secondary-grid {
  display: grid;
  gap: 18px;
  margin-top: 18px;
}

.primary-grid {
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.88fr);
}

.secondary-grid {
  grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.55fr);
}

@media (max-width: 1280px) {
  .primary-grid,
  .secondary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
