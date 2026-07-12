<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import { BusinessTable } from '@/components/business'
import type { DashboardRecentProject } from '@/types/dashboard'
import {
  localizeProjectRisk,
  localizeProjectStage,
  localizeProjectStatus,
} from '@/utils/project-localization'
import { useLocaleStore } from '@/store/locale'

defineProps<{
  projects: DashboardRecentProject[]
}>()

const router = useRouter()
const localeStore = useLocaleStore()
const { t } = useI18n()

function riskColor(riskLevel: string): 'red' | 'orange' | 'blue' | 'gray' {
  if (riskLevel === 'Critical') return 'red'
  if (riskLevel === 'High') return 'orange'
  if (riskLevel === 'Medium') return 'blue'
  return 'gray'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(localeStore.currentLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <div class="table-wrap">
    <BusinessTable v-if="projects.length" :data="projects" size="small">
      <a-table-column
        data-index="projectName"
        :title="t('dashboard.recent.projectName')"
        :min-width="230"
        tooltip
      >
        <template #cell="{ record: row }">
          <div class="project-name">
            {{ row.projectName }}
          </div>
          <div class="project-code">
            {{ row.projectCode }}
          </div>
        </template>
      </a-table-column>
      <a-table-column data-index="countryCode" :title="t('common.country')" :width="76" />
      <a-table-column data-index="status" :title="t('common.status')" :width="96">
        <template #cell="{ record: row }">
          {{ localizeProjectStatus(row.status, localeStore.currentLocale) }}
        </template>
      </a-table-column>
      <a-table-column
        data-index="currentStage"
        :title="t('dashboard.recent.currentStage')"
        :width="120"
      >
        <template #cell="{ record: row }">
          {{
            row.currentStage
              ? localizeProjectStage(row.currentStage, localeStore.currentLocale)
              : '--'
          }}
        </template>
      </a-table-column>
      <a-table-column data-index="progressPercent" :title="t('common.progress')" :width="120">
        <template #cell="{ record: row }">
          <a-progress
            :percent="Math.max(0, Math.min(1, Number(row.progressPercent || 0) / 100))"
            size="small"
            :show-text="true"
          />
        </template>
      </a-table-column>
      <a-table-column data-index="riskLevel" :title="t('dashboard.recent.risk')" :width="90">
        <template #cell="{ record: row }">
          <a-tag :color="riskColor(row.riskLevel)" size="small">
            {{ localizeProjectRisk(row.riskLevel, localeStore.currentLocale) }}
          </a-tag>
        </template>
      </a-table-column>
      <a-table-column data-index="updatedAt" :title="t('dashboard.recent.updatedAt')" :width="120">
        <template #cell="{ record: row }">
          <span class="date-text">{{ formatDate(row.updatedAt) }}</span>
        </template>
      </a-table-column>
      <a-table-column :title="t('common.action')" :width="76">
        <template #cell="{ record: row }">
          <a-button type="text" size="small" @click="router.push(`/projects/${row.id}`)">
            {{ t('common.view') }}
          </a-button>
        </template>
      </a-table-column>
    </BusinessTable>
    <a-empty v-else :description="t('dashboard.recent.empty')" />
  </div>
</template>

<style scoped lang="scss">
.table-wrap {
  min-height: 228px;
  padding: 4px 14px 14px;
  overflow-x: auto;
}

.project-name {
  color: #1d2129;
  font-weight: 560;
}

.project-code,
.date-text {
  margin-top: 3px;
  color: #86909c;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
</style>
