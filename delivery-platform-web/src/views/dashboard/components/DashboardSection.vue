<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  title: string
  description: string
  loading: boolean
  refreshing?: boolean
  error: boolean
  count?: number
}>()

defineEmits<{
  retry: []
}>()

const { t } = useI18n()
</script>

<template>
  <section class="dashboard-section" :aria-label="title" aria-live="polite">
    <header class="section-header">
      <div>
        <h3 class="section-title">
          {{ title }}
        </h3>
        <p class="section-description">
          {{ description }}
        </p>
      </div>
      <span v-if="count !== undefined" class="section-count">
        {{ t('common.items', { count }) }}
      </span>
    </header>

    <div v-if="loading" class="section-loading">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="3" />
      </a-skeleton>
    </div>
    <div v-else-if="error" class="section-error">
      <a-alert type="error" show-icon>
        {{ t('dashboard.sectionLoadFailed') }}
      </a-alert>
      <a-button size="small" :loading="refreshing" @click="$emit('retry')">
        {{ t('common.retry') }}
      </a-button>
    </div>
    <div v-else class="section-content">
      <slot />
    </div>
  </section>
</template>

<style scoped lang="scss">
.dashboard-section {
  min-width: 0;
  border: 1px solid #e5e6eb;
  background: #fff;
  overflow: hidden;
}

.section-header {
  min-height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 20px;
  border-bottom: 1px solid #f2f3f5;
}

.section-title {
  margin: 0;
  color: #1d2129;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.3;
}

.section-description {
  margin: 4px 0 0;
  color: #86909c;
  font-size: 12px;
}

.section-count {
  color: #65716b;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.section-loading,
.section-error {
  min-height: 160px;
  padding: 24px 20px;
}

.section-error {
  display: grid;
  align-content: center;
  justify-items: start;
  gap: 14px;
}

.section-content {
  min-width: 0;
}
</style>
