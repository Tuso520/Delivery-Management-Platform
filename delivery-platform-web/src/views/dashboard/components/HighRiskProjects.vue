<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import { BusinessTable } from '@/components/business'
import type { DashboardHighRiskProject } from '@/types/dashboard'
import { localizeProjectRisk, localizeProjectStatus } from '@/utils/project-localization'
import { useLocaleStore } from '@/store/locale'

defineProps<{
  projects: DashboardHighRiskProject[]
}>()

const router = useRouter()
const localeStore = useLocaleStore()
const { t } = useI18n()

function riskColor(riskLevel: string): 'red' | 'orange' {
  return riskLevel === 'Critical' ? 'red' : 'orange'
}

function formatDate(value: string | null): string {
  if (!value) return '--'
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
        :title="t('common.project')"
        :min-width="210"
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
      <a-table-column data-index="riskLevel" :title="t('dashboard.risk.risk')" :width="92">
        <template #cell="{ record: row }">
          <a-tag :color="riskColor(row.riskLevel)" size="small">
            {{ localizeProjectRisk(row.riskLevel, localeStore.currentLocale) }}
          </a-tag>
        </template>
      </a-table-column>
      <a-table-column
        data-index="riskDescription"
        :title="t('dashboard.risk.description')"
        :min-width="220"
        tooltip
      >
        <template #cell="{ record: row }">
          {{ row.riskDescription || t('dashboard.risk.missingDescription') }}
        </template>
      </a-table-column>
      <a-table-column data-index="status" :title="t('common.status')" :width="90">
        <template #cell="{ record: row }">
          {{ localizeProjectStatus(row.status, localeStore.currentLocale) }}
        </template>
      </a-table-column>
      <a-table-column
        data-index="expectedAcceptanceAt"
        :title="t('dashboard.risk.expectedAcceptance')"
        :width="120"
      >
        <template #cell="{ record: row }">
          {{ formatDate(row.expectedAcceptanceAt) }}
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
    <a-empty v-else :description="t('dashboard.risk.empty')" />
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

.project-code {
  margin-top: 3px;
  color: #86909c;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
</style>
