<script setup lang="ts">
import { computed } from 'vue'
import { useLocaleStore } from '@/store/locale'
import { localizeProjectStatus } from '@/utils/project-localization'

const props = defineProps<{
  items: Array<{ status: string; count: number }>
  statusColors: Record<string, string>
}>()

const localeStore = useLocaleStore()

const maxCount = computed(() => {
  if (props.items.length === 0) return 1
  return Math.max(...props.items.map((item) => item.count), 1)
})

const totalCount = computed(() =>
  props.items.reduce((total, item) => total + item.count, 0),
)

function getStatusLabel(status: string): string {
  return localizeProjectStatus(status, localeStore.currentLocale)
}

function getStatusColor(status: string): string {
  return props.statusColors[status] || '#68746f'
}

function getBarWidth(count: number): string {
  return `${(count / maxCount.value) * 100}%`
}
</script>

<template>
  <section class="data-panel">
    <header class="panel-header">
      <div>
        <h3 class="panel-title">
          项目状态分布
        </h3>
        <p class="panel-description">
          项目在各交付阶段的数量分布
        </p>
      </div>
      <span class="panel-meta">{{ totalCount }} 个项目</span>
    </header>
    <a-empty v-if="items.length === 0" class="empty-state" description="暂无数据" />
    <div v-else class="status-tag-list">
      <div v-for="item in items" :key="item.status" class="status-tag-item">
        <span class="status-label">
          <span class="status-dot" :style="{ backgroundColor: getStatusColor(item.status) }" />
          {{ getStatusLabel(item.status) }}
        </span>
        <span class="status-bar-track">
          <span
            class="status-bar-fill"
            :style="{
              width: getBarWidth(item.count),
              backgroundColor: getStatusColor(item.status),
            }"
          />
        </span>
        <span class="status-count">{{ item.count }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.data-panel {
  min-width: 0;
  border-radius: 8px;
  border: 1px solid #e5e6eb;
  background: #fff;
  overflow: hidden;
}

.panel-header {
  min-height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 20px;
  border-bottom: 1px solid #f2f3f5;
}

.panel-title {
  margin: 0;
  color: #1d2129;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.3;
}

.panel-description {
  margin: 4px 0 0;
  color: #86909c;
  font-size: 12px;
}

.panel-meta {
  color: #65716b;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.empty-state {
  min-height: 260px;
}

.status-tag-list {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 16px;
  min-height: 272px;
  padding: 20px;
}

.status-tag-item {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 14px;
}

.status-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #4e5969;
  font-size: 12px;
  font-weight: 560;
  white-space: nowrap;
}

.status-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 2px;
}

.status-bar-track {
  height: 10px;
  background: #edf1ef;
  border-radius: 3px;
  overflow: hidden;
}

.status-bar-fill {
  display: block;
  height: 100%;
  min-width: 8px;
  border-radius: 3px;
  transition: width 0.4s ease;
}

.status-count {
  color: #4e5969;
  font-size: 13px;
  font-weight: 700;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 520px) {
  .status-tag-item {
    grid-template-columns: 70px minmax(0, 1fr) 24px;
    gap: 10px;
  }
}
</style>
