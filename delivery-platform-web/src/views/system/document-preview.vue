<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import Message from '@arco-design/web-vue/es/message'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'

import { documentPreviewSettingsApi } from '@/api/system'
import { usePermission } from '@/composables/usePermission'
import { PageContainer, PageToolbar, SectionCard, StickyActionBar } from '@/design-system'
import { Can } from '@/platform/permission'
import { queryKeys } from '@/query/keys'
import type { UpdateDocumentPreviewSettingsDto } from '@/types/settings'

const { t } = useI18n()
const { hasPermission } = usePermission()
const queryClient = useQueryClient()
const canManage = computed(() => hasPermission('system_setting:manage'))
const form = reactive({ enabled: false, docsUrl: '', jwtSecret: '' })

const settingsQuery = useQuery({
  queryKey: queryKeys.settings.documentPreview(),
  queryFn: documentPreviewSettingsApi.get,
})
const saveMutation = useMutation({
  mutationFn: documentPreviewSettingsApi.update,
  onSuccess: (value) => queryClient.setQueryData(queryKeys.settings.documentPreview(), value),
})

const settings = computed(() => settingsQuery.data.value)
const loading = computed(() => settingsQuery.isFetching.value)
const saving = computed(() => saveMutation.isPending.value)

watch(
  settings,
  (value) => {
    if (!value) return
    form.enabled = value.enabled
    form.docsUrl = value.docsUrl
    form.jwtSecret = ''
  },
  { immediate: true },
)

async function save(): Promise<void> {
  const docsUrl = form.docsUrl.trim()
  const jwtSecret = form.jwtSecret.trim()
  if (form.enabled && (!docsUrl || (!jwtSecret && !settings.value?.jwtSecretConfigured))) {
    Message.warning(t('documentPreview.validation.required'))
    return
  }
  const payload: UpdateDocumentPreviewSettingsDto = { enabled: form.enabled, docsUrl }
  if (jwtSecret) payload.jwtSecret = jwtSecret
  try {
    await saveMutation.mutateAsync(payload)
    Message.success(t('documentPreview.saved'))
  } catch {
    Message.error(t('documentPreview.saveFailed'))
  }
}
</script>

<template>
  <PageContainer class="document-preview-page">
    <PageToolbar
      :title="t('documentPreview.title')"
      :description="t('documentPreview.description')"
    >
      <template #actions>
        <a-button @click="settingsQuery.refetch()">
          {{ t('common.retry') }}
        </a-button>
      </template>
    </PageToolbar>

    <a-alert v-if="!canManage" type="info" :title="t('documentPreview.readOnly')">
      {{ t('documentPreview.readOnlyHint') }}
    </a-alert>
    <a-alert
      v-if="settingsQuery.isError.value"
      type="error"
      :title="t('documentPreview.loadFailed')"
    />
    <a-alert type="warning" :title="t('documentPreview.securityTitle')">
      {{ t('documentPreview.securityHint') }}
    </a-alert>

    <a-spin :loading="loading" class="preview-settings-spin">
      <a-form :model="form" layout="vertical" :disabled="!canManage">
        <SectionCard :title="t('documentPreview.sectionTitle')" :bordered="false">
          <a-descriptions :column="3" size="small" class="status-summary">
            <a-descriptions-item :label="t('documentPreview.status')">
              <a-tag :color="settings?.ready ? 'green' : 'orange'">
                {{ settings?.ready ? t('documentPreview.ready') : t('documentPreview.notReady') }}
              </a-tag>
            </a-descriptions-item>
            <a-descriptions-item :label="t('documentPreview.source')">
              {{ t(`documentPreview.sources.${settings?.source || 'NONE'}`) }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('documentPreview.secretStatus')">
              {{
                settings?.jwtSecretConfigured
                  ? t('documentPreview.secretConfigured')
                  : t('documentPreview.secretMissing')
              }}
            </a-descriptions-item>
          </a-descriptions>

          <div class="settings-grid">
            <a-form-item :label="t('documentPreview.enabled')">
              <a-switch v-model="form.enabled" />
            </a-form-item>
            <a-form-item :label="t('documentPreview.docsUrl')" required>
              <a-input
                v-model="form.docsUrl"
                allow-clear
                :placeholder="t('documentPreview.docsUrlPlaceholder')"
              />
              <template #extra>
                {{ t('documentPreview.docsUrlHint') }}
              </template>
            </a-form-item>
            <a-form-item :label="t('documentPreview.jwtSecret')" required>
              <a-input
                v-model="form.jwtSecret"
                type="password"
                allow-clear
                :placeholder="
                  settings?.jwtSecretConfigured
                    ? t('documentPreview.secretReplacePlaceholder')
                    : t('documentPreview.secretPlaceholder')
                "
              />
              <template #extra>
                {{ t('documentPreview.secretHint') }}
              </template>
            </a-form-item>
          </div>
        </SectionCard>
      </a-form>

      <StickyActionBar :message="t('documentPreview.auditHint')">
        <template #actions>
          <Can permission="system_setting:manage">
            <a-button type="primary" :loading="saving" @click="save">
              {{ t('documentPreview.save') }}
            </a-button>
          </Can>
        </template>
      </StickyActionBar>
    </a-spin>
  </PageContainer>
</template>

<style scoped lang="scss">
.document-preview-page {
  min-height: 100%;
}

.preview-settings-spin {
  min-height: 320px;
}

.status-summary {
  margin-bottom: 20px;
}

.settings-grid {
  display: grid;
  grid-template-columns: 180px minmax(320px, 1fr) minmax(320px, 1fr);
  gap: 20px;
}

@media (max-width: 1280px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}
</style>
