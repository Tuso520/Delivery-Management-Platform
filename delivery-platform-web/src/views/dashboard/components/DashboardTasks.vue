<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useLocaleStore } from '@/store/locale'

import { BusinessTable } from '@/components/business'
import type { DashboardTask, DashboardTaskType } from '@/types/dashboard'

defineProps<{
  tasks: DashboardTask[]
}>()

const router = useRouter()
const localeStore = useLocaleStore()
const { t } = useI18n()

const priorityColors: Record<DashboardTask['priority'], 'red' | 'orange' | 'gray'> = {
  URGENT: 'red',
  HIGH: 'orange',
  NORMAL: 'gray',
}

function formatDate(value: string | null): string {
  if (!value) return '--'
  return new Intl.DateTimeFormat(localeStore.currentLocale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function typeLabel(type: DashboardTaskType): string {
  return t(`dashboard.task.types.${type}`)
}

function priorityLabel(priority: DashboardTask['priority']): string {
  return t(`dashboard.task.priorities.${priority}`)
}

function canOpen(task: DashboardTask): boolean {
  return (
    task.type === 'FILE_REVIEW' ||
    Boolean(task.projectId) ||
    ['STANDARD', 'KNOWLEDGE', 'ARCHIVE_TEMPLATE'].includes(task.sourceType || '')
  )
}

async function openTask(task: DashboardTask): Promise<void> {
  if (task.type === 'FILE_REVIEW' || task.type === 'FILE_REVISION') {
    await router.push({ name: 'ReviewDetail', params: { taskId: task.id } })
    return
  }
  if (task.projectId) {
    await router.push(`/projects/${task.projectId}`)
    return
  }
  const sourceRoutes: Record<string, string> = {
    STANDARD: 'Standard',
    KNOWLEDGE: 'Knowledge',
    ARCHIVE_TEMPLATE: 'ArchiveTemplate',
  }
  const name = sourceRoutes[task.sourceType || '']
  if (name) await router.push({ name })
}
</script>

<template>
  <div class="table-wrap">
    <BusinessTable v-if="tasks.length" :data="tasks" size="small">
      <a-table-column data-index="type" :title="t('common.type')" :width="110">
        <template #cell="{ record: row }">
          <span class="task-type">{{ typeLabel(row.type as DashboardTaskType) }}</span>
        </template>
      </a-table-column>
      <a-table-column
        data-index="title"
        :title="t('dashboard.task.todo')"
        :min-width="260"
        tooltip
      >
        <template #cell="{ record: row }">
          <div class="task-title">
            {{ row.title }}
          </div>
          <div v-if="row.description" class="task-description">
            {{ row.description }}
          </div>
        </template>
      </a-table-column>
      <a-table-column
        data-index="projectName"
        :title="t('dashboard.task.relatedProject')"
        :min-width="160"
      >
        <template #cell="{ record: row }">
          {{ row.projectName || '--' }}
        </template>
      </a-table-column>
      <a-table-column data-index="priority" :title="t('common.priority')" :width="90">
        <template #cell="{ record: row }">
          <a-tag :color="priorityColors[row.priority as DashboardTask['priority']]" size="small">
            {{ priorityLabel(row.priority as DashboardTask['priority']) }}
          </a-tag>
        </template>
      </a-table-column>
      <a-table-column data-index="dueAt" :title="t('dashboard.task.dueAt')" :width="135">
        <template #cell="{ record: row }">
          <span class="date-text">{{ formatDate(row.dueAt) }}</span>
        </template>
      </a-table-column>
      <a-table-column :title="t('common.action')" :width="76">
        <template #cell="{ record: row }">
          <a-button
            v-if="canOpen(row)"
            type="text"
            size="small"
            @click="openTask(row)"
          >
            {{ t('common.process') }}
          </a-button>
          <span v-else class="muted-text">--</span>
        </template>
      </a-table-column>
    </BusinessTable>
    <a-empty v-else :description="t('dashboard.task.empty')" />
  </div>
</template>

<style scoped lang="scss">
.table-wrap {
  min-height: 228px;
  padding: 4px 14px 14px;
  overflow-x: auto;
}

.task-type {
  color: #4e5969;
  font-size: 12px;
  font-weight: 600;
}

.task-title {
  color: #1d2129;
  font-weight: 560;
}

.task-description {
  max-width: 420px;
  margin-top: 3px;
  color: #86909c;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.date-text,
.muted-text {
  color: #86909c;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
</style>
