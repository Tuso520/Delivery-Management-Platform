<script setup lang="ts">
import type { Component } from 'vue'

interface StatCard {
  title: string
  value: string
  icon: Component
  color: string
}

defineProps<{
  cards: StatCard[]
}>()

function getCardStyle(color: string): Record<string, string> {
  return { '--stat-color': color }
}
</script>

<template>
  <section class="stat-grid" aria-label="项目关键指标">
    <article
      v-for="card in cards"
      :key="card.title"
      class="stat-card"
      :style="getCardStyle(card.color)"
    >
      <div class="stat-card-top">
        <span class="stat-title">{{ card.title }}</span>
        <span class="stat-icon-wrap">
          <a-icon class="stat-icon" :size="21">
            <component :is="card.icon" />
          </a-icon>
        </span>
      </div>
      <div class="stat-value">
        {{ card.value }}
      </div>
      <div class="stat-rule" />
    </article>
  </section>
</template>

<style scoped lang="scss">
.stat-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.stat-card {
  --stat-color: #165dff;
  position: relative;
  min-width: 0;
  min-height: 116px;
  padding: 17px 18px 15px;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;

  &:hover {
    border-color: color-mix(in srgb, var(--stat-color) 32%, #dbe3df);
    transform: translateY(-1px);
  }
}

.stat-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.stat-value {
  margin-top: 13px;
  color: #1d2129;
  font-size: 27px;
  font-weight: 720;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.stat-title {
  min-width: 0;
  color: #727e78;
  font-size: 12px;
  font-weight: 560;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-icon-wrap {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: 6px;
  background: color-mix(in srgb, var(--stat-color) 12%, white);
  color: var(--stat-color);
}

.stat-rule {
  position: absolute;
  right: 18px;
  bottom: 12px;
  left: 18px;
  width: 30px;
  height: 2px;
  border-radius: 2px;
  background: var(--stat-color);
}

@media (max-width: 1400px) {
  .stat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 440px) {
  .stat-grid {
    grid-template-columns: 1fr;
  }
}
</style>
