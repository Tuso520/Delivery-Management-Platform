<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="not-found-page">
    <div class="not-found-code">
      404
    </div>
    <h1>{{ t('notFound.title') }}</h1>
    <p>{{ t('notFound.description') }}</p>
    <a-button type="primary" @click="$router.push('/dashboard')">
      {{ t('notFound.back') }}
    </a-button>
  </div>
</template>

<style scoped lang="scss">
.not-found-page {
  min-height: 62vh;
  padding: 72px 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-align: center;
}

.not-found-code {
  color: #b9c3be;
  font-size: clamp(72px, 12vw, 140px);
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.not-found-page h1 {
  margin-top: 14px;
  color: #1d2129;
  font-size: 24px;
  font-weight: 650;
}

.not-found-page p {
  margin: 10px 0 24px;
  color: #86909c;
}
</style>
