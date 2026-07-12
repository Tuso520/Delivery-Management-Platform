<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  headline: string
  description: string
  activeProjectLabel: string
  taskLabel: string
  riskLabel: string
}>()

const { t } = useI18n()
</script>

<template>
  <section class="overview-band">
    <div class="overview-copy">
      <span class="overview-kicker">{{ t('dashboard.workspaceKicker') }}</span>
      <h2 class="overview-title">
        {{ headline }}
      </h2>
      <p class="overview-description">
        {{ description }}
      </p>
    </div>
    <div class="overview-highlights" :aria-label="t('dashboard.summaryAria')">
      <div class="highlight-item">
        <span class="highlight-label">{{ t('dashboard.activeProjects') }}</span>
        <strong class="highlight-value">{{ activeProjectLabel }}</strong>
      </div>
      <div class="highlight-item">
        <span class="highlight-label">{{ t('dashboard.myTasks') }}</span>
        <strong class="highlight-value">{{ taskLabel }}</strong>
      </div>
      <div class="highlight-item">
        <span class="highlight-label">{{ t('dashboard.highRiskProjects') }}</span>
        <strong class="highlight-value">{{ riskLabel }}</strong>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.overview-band {
  min-height: 132px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 28px;
  margin-bottom: 18px;
  padding: 24px 28px 28px;
  border: 1px solid #e5e6eb;
  background: #fff;
  overflow: hidden;
}

.overview-copy {
  min-width: 0;
}

.overview-kicker {
  display: block;
  margin-bottom: 8px;
  color: #3f7869;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.overview-title {
  margin: 0;
  color: #1d2129;
  font-size: 24px;
  font-weight: 680;
  line-height: 1.25;
}

.overview-description {
  max-width: 680px;
  margin: 8px 0 0;
  color: #68736e;
  font-size: 14px;
  line-height: 1.65;
}

.overview-highlights {
  display: grid;
  grid-template-columns: repeat(3, minmax(104px, 1fr));
  border: 1px solid #e5e6eb;
  background: #f8faf8;
}

.highlight-item {
  min-width: 104px;
  padding: 16px 18px;
  border-right: 1px solid #e4e9e6;

  &:last-child {
    border-right: none;
  }
}

.highlight-label {
  display: block;
  margin-bottom: 5px;
  color: #75807a;
  font-size: 12px;
  white-space: nowrap;
}

.highlight-value {
  display: block;
  color: #1d2129;
  font-size: 22px;
  font-weight: 720;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1200px) {
  .overview-band {
    grid-template-columns: 1fr;
  }
  .overview-highlights {
    width: 100%;
  }
}

@media (max-width: 760px) {
  .overview-band {
    padding: 20px;
  }
  .overview-title {
    font-size: 21px;
  }
  .overview-highlights {
    grid-template-columns: 1fr;
  }
  .highlight-item {
    border-right: none;
    border-bottom: 1px solid #e4e9e6;
    &:last-child {
      border-bottom: none;
    }
  }
}
</style>
