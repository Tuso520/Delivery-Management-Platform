<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const redirectPath = computed(() => {
  const candidate = route.query.redirect
  return typeof candidate === 'string' && candidate.startsWith('/') && !candidate.startsWith('//')
    ? candidate
    : '/dashboard'
})

function retry(): void {
  void router.replace(redirectPath.value)
}
</script>

<template>
  <main class="session-recovery-page">
    <a-result
      status="warning"
      :title="t('sessionRecovery.title')"
      :subtitle="t('sessionRecovery.description')"
    >
      <template #extra>
        <a-button type="primary" @click="retry">
          {{ t('sessionRecovery.retry') }}
        </a-button>
      </template>
    </a-result>
  </main>
</template>

<style scoped lang="scss">
.session-recovery-page {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #f7f8fa;
}
</style>
