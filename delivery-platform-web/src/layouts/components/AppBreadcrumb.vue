<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import breadcrumbListIcon from '@/assets/figma/project-overview/breadcrumb-list.svg'
import breadcrumbSeparatorIcon from '@/assets/figma/project-overview/breadcrumb-separator.svg'
defineProps<{ groupTitle?: string; pageTitle: string }>()
const { t } = useI18n()
</script>

<template>
  <nav class="app-breadcrumb" :aria-label="t('shell.breadcrumb')">
    <img class="breadcrumb-leading" :src="breadcrumbListIcon" alt="" />
    <img class="separator" :src="breadcrumbSeparatorIcon" alt="" />
    <span v-if="groupTitle" class="muted">{{ groupTitle }}</span>
    <img
      v-if="groupTitle"
      class="separator"
      :src="breadcrumbSeparatorIcon"
      alt=""
    />
    <h1 class="page-title">
      {{ pageTitle }}
    </h1>
  </nav>
</template>

<style scoped>
.app-breadcrumb {
  height: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #1d2129;
  font-size: 14px;
  line-height: 22px;
}
.breadcrumb-leading {
  width: 16px;
  height: 16px;
  display: block;
}
.separator {
  width: 12px;
  height: 12px;
  display: block;
}
.muted {
  color: #86909c;
}
.page-title {
  margin: 0;
  font: inherit;
}
@media (max-width: 600px) {
  .muted,
  .muted + .separator {
    display: none;
  }
}
</style>
