<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import type { DashboardRecentActivity } from '@/types/dashboard'
import { useLocaleStore } from '@/store/locale'

defineProps<{
  activities: DashboardRecentActivity[]
}>()

const router = useRouter()
const localeStore = useLocaleStore()
const { t, te } = useI18n()

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(localeStore.currentLocale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function actionLabel(action: string): string {
  const key = `dashboard.activity.actions.${action}`
  return te(key) ? t(key) : t('dashboard.activity.fallback')
}
</script>

<template>
  <ul v-if="activities.length" class="activity-list">
    <li v-for="activity in activities" :key="activity.id" class="activity-item">
      <span class="activity-dot" aria-hidden="true" />
      <div class="activity-main">
        <p class="activity-copy">
          <strong>{{ activity.actorName }}</strong>
          {{ actionLabel(activity.action) }}
          <button
            class="project-link"
            type="button"
            @click="router.push(`/projects/${activity.projectId}`)"
          >
            {{ activity.projectName }}
          </button>
        </p>
        <span class="activity-time">{{ formatDate(activity.occurredAt) }}</span>
      </div>
    </li>
  </ul>
  <a-empty v-else :description="t('dashboard.activity.empty')" />
</template>

<style scoped lang="scss">
.activity-list {
  min-height: 228px;
  margin: 0;
  padding: 8px 20px 14px;
  list-style: none;
}

.activity-item {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  gap: 10px;
  padding: 13px 0;
  border-bottom: 1px solid #f2f3f5;

  &:last-child {
    border-bottom: none;
  }
}

.activity-dot {
  width: 7px;
  height: 7px;
  margin-top: 6px;
  border-radius: 50%;
  background: #3f7869;
}

.activity-main {
  min-width: 0;
}

.activity-copy {
  margin: 0;
  color: #4e5969;
  font-size: 13px;
  line-height: 1.55;
}

.project-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: #165dff;
  font: inherit;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid #165dff;
    outline-offset: 2px;
  }
}

.activity-time {
  display: block;
  margin-top: 4px;
  color: #86909c;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
</style>
