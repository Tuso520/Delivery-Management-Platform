<script setup lang="ts">
import { IconMenuUnfold } from '@arco-design/web-vue/es/icon'
import { useI18n } from 'vue-i18n'
defineProps<{ groupTitle?: string; pageTitle: string }>()
const { t } = useI18n()
</script>

<template>
  <nav class="app-breadcrumb" :aria-label="t('shell.breadcrumb')">
    <IconMenuUnfold class="breadcrumb-leading" />
    <span class="separator">/</span>
    <span v-if="groupTitle" class="muted">{{ groupTitle }}</span>
    <span v-if="groupTitle" class="separator">/</span>
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
  color: #4e5969;
}
.separator,
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
