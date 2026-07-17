<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'

import { systemSettingsApi } from '@/api/system'
import {
  Can,
  PageContainer,
  PageToolbar,
  SectionCard,
  StickyActionBar,
} from '@/components/business'
import {
  useSystemSettingsQuery,
  useSystemTimeQuery,
} from '@/composables/queries/useOperationsQueries'
import { usePermission } from '@/composables/usePermission'
import { queryKeys } from '@/query/keys'
import type { SystemSettings } from '@/types/settings'
import FieldSettings from './FieldSettings.vue'

function createDefaults(): SystemSettings {
  return {
    project: {
      defaultPageSize: 20,
      defaultRiskLevel: 'Low',
    },
    attachment: { maxSizeMb: 100 },
    file: {
      allowedExtensions: [
        'pdf',
        'doc',
        'docx',
        'xls',
        'xlsx',
        'ppt',
        'pptx',
        'jpg',
        'jpeg',
        'png',
        'md',
        'mp4',
      ],
    },
    approval: { timeoutDays: 3 },
    knowledge: { defaultPageSize: 20 },
    security: { sessionHours: 12, loginMaxAttempts: 5 },
  }
}

const { hasPermission } = usePermission()
const queryClient = useQueryClient()
const { t, locale } = useI18n()
const canManage = computed(() => hasPermission('system_setting:manage'))

const settings = ref<SystemSettings>(createDefaults())
const settingsQuery = useSystemSettingsQuery()
const systemTimeQuery = useSystemTimeQuery()
const systemTime = computed(() => systemTimeQuery.data.value)
const loading = computed(() => settingsQuery.isFetching.value || systemTimeQuery.isFetching.value)
const loadFailed = computed(() => settingsQuery.isError.value)

const saveSettingsMutation = useMutation({
  mutationFn: (data: SystemSettings) => systemSettingsApi.update(data),
  retry: false,
  onSuccess: (saved) => {
    queryClient.setQueryData(queryKeys.settings.system(), saved)
  },
})
const saving = computed(() => saveSettingsMutation.isPending.value)

async function fetchSettings(): Promise<void> {
  await Promise.allSettled([settingsQuery.refetch(), systemTimeQuery.refetch()])
}

async function refreshSystemTime(): Promise<void> {
  await systemTimeQuery.refetch()
}

function normalizeExtensions(): string[] {
  return Array.from(
    new Set(
      settings.value.file.allowedExtensions
        .map((extension) => extension.trim().toLowerCase().replace(/^\./u, ''))
        .filter((extension) => /^[a-z0-9]+$/u.test(extension)),
    ),
  )
}

function validateSettings(): boolean {
  const extensions = normalizeExtensions()
  if (!extensions.length) {
    Message.warning(t('systemConfig.extensionRequired'))
    return false
  }
  settings.value.file.allowedExtensions = extensions
  return true
}

async function saveSettings(): Promise<void> {
  if (!canManage.value || !validateSettings()) return
  try {
    settings.value = await saveSettingsMutation.mutateAsync(settings.value)
    Message.success(t('systemConfig.saved'))
  } catch {
    // The shared request layer has already surfaced the failure.
  }
}

function formatServerTime(value?: string): string {
  if (!value) return t('systemConfig.unavailable')
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale.value, { hour12: false })
}

function formatOffset(value?: number): string {
  if (value === undefined) return '—'
  const sign = value >= 0 ? '+' : '-'
  const absolute = Math.abs(value)
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0')
  const minutes = String(absolute % 60).padStart(2, '0')
  return `UTC${sign}${hours}:${minutes}`
}

watch(
  () => settingsQuery.data.value,
  (value) => {
    if (value) settings.value = structuredClone(toRaw(value))
  },
  { immediate: true },
)
</script>

<template>
  <PageContainer class="system-settings-page">
    <PageToolbar :title="t('systemConfig.title')" :description="t('systemConfig.description')">
      <template #actions>
        <a-button @click="fetchSettings">
          {{ t('common.retry') }}
        </a-button>
      </template>
    </PageToolbar>

    <a-alert
      v-if="!canManage"
      class="page-alert"
      type="info"
      :title="t('systemConfig.readOnly')"
    >
      {{ t('systemConfig.readOnlyHint') }}
    </a-alert>
    <a-alert
      v-if="loadFailed"
      class="page-alert"
      type="error"
      :title="t('systemConfig.loadFailed')"
    >
      <template #action>
        <a-button size="small" @click="fetchSettings">
          {{ t('common.retry') }}
        </a-button>
      </template>
    </a-alert>

    <a-spin :loading="loading" class="settings-spin">
      <a-form :model="settings" layout="vertical" :disabled="!canManage">
        <SectionCard
          :title="t('systemConfig.sections.project')"
          class="settings-section"
          :bordered="false"
        >
          <div class="settings-grid">
            <a-form-item :label="t('systemConfig.projectPageSize')">
              <a-input-number v-model="settings.project.defaultPageSize" :min="10" :max="100" />
              <template #extra>
                {{ t('systemConfig.range10to100') }}
              </template>
            </a-form-item>
            <a-form-item :label="t('systemConfig.defaultRisk')">
              <a-select v-model="settings.project.defaultRiskLevel">
                <a-option value="Low">
                  {{ t('risk.Low') }}
                </a-option>
                <a-option value="Medium">
                  {{ t('risk.Medium') }}
                </a-option>
                <a-option value="High">
                  {{ t('risk.High') }}
                </a-option>
              </a-select>
            </a-form-item>
          </div>
        </SectionCard>

        <SectionCard
          :title="t('systemConfig.sections.files')"
          class="settings-section"
          :bordered="false"
        >
          <div class="settings-grid">
            <a-form-item :label="t('systemConfig.maxAttachmentSize')">
              <a-input-number v-model="settings.attachment.maxSizeMb" :min="1" :max="1024" />
              <template #extra>
                {{ t('systemConfig.range1to1024') }}
              </template>
            </a-form-item>
            <a-form-item :label="t('systemConfig.extensions')" class="wide-field">
              <a-input-tag
                v-model="settings.file.allowedExtensions"
                allow-clear
                :placeholder="t('systemConfig.extensionsPlaceholder')"
              />
              <template #extra>
                {{ t('systemConfig.extensionsHint') }}
              </template>
            </a-form-item>
          </div>
        </SectionCard>

        <SectionCard
          :title="t('systemConfig.sections.reviewKnowledge')"
          class="settings-section"
          :bordered="false"
        >
          <div class="settings-grid">
            <a-form-item :label="t('systemConfig.approvalTimeout')">
              <a-input-number v-model="settings.approval.timeoutDays" :min="1" :max="90" />
              <template #extra>
                {{ t('systemConfig.range1to90') }}
              </template>
            </a-form-item>
            <a-form-item :label="t('systemConfig.knowledgePageSize')">
              <a-input-number v-model="settings.knowledge.defaultPageSize" :min="10" :max="100" />
              <template #extra>
                {{ t('systemConfig.range10to100') }}
              </template>
            </a-form-item>
          </div>
        </SectionCard>

        <SectionCard
          :title="t('systemConfig.sections.security')"
          class="settings-section"
          :bordered="false"
        >
          <div class="settings-grid">
            <a-form-item :label="t('systemConfig.sessionHours')">
              <a-input-number v-model="settings.security.sessionHours" :min="1" :max="720" />
              <template #extra>
                {{ t('systemConfig.sessionHint') }}
              </template>
            </a-form-item>
            <a-form-item :label="t('systemConfig.loginAttempts')">
              <a-input-number v-model="settings.security.loginMaxAttempts" :min="3" :max="20" />
              <template #extra>
                {{ t('systemConfig.attemptsHint') }}
              </template>
            </a-form-item>
          </div>
        </SectionCard>
      </a-form>

      <SectionCard
        :title="t('systemConfig.sections.serverTime')"
        class="settings-section time-section"
        :bordered="false"
      >
        <template #extra>
          <a-button size="small" @click="refreshSystemTime">
            {{
              t('systemConfig.refreshTime')
            }}
          </a-button>
        </template>
        <a-descriptions :column="3" size="small">
          <a-descriptions-item :label="t('systemConfig.serverTime')">
            {{ formatServerTime(systemTime?.serverTime) }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('systemConfig.serverTimezone')">
            {{ systemTime?.timezone || t('systemConfig.unavailable') }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('systemConfig.utcOffset')">
            {{ formatOffset(systemTime?.utcOffsetMinutes) }}
          </a-descriptions-item>
        </a-descriptions>
        <p class="time-note">
          {{ t('systemConfig.timeReadOnly') }}
        </p>
      </SectionCard>

      <FieldSettings v-if="hasPermission('field_setting:manage')" />

      <StickyActionBar
        :message="canManage ? t('systemConfig.auditHint') : t('systemConfig.readOnlySaveHint')"
      >
        <template #actions>
          <Can permission="system_setting:manage">
            <a-button
              type="primary"
              :loading="saving"
              :disabled="loadFailed"
              @click="saveSettings"
            >
              {{ t('systemConfig.save') }}
            </a-button>
          </Can>
        </template>
      </StickyActionBar>
    </a-spin>
  </PageContainer>
</template>

<style scoped lang="scss">
.system-settings-page {
  min-width: 0;
  padding-bottom: 8px;
}

.page-alert {
  margin-bottom: 12px;
}

.settings-spin {
  display: block;
}

.settings-section {
  margin-bottom: 12px;
  background: var(--color-bg-2);
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
}

.wide-field {
  grid-column: 1 / -1;
}

.time-note {
  margin: 10px 0 0;
  color: var(--color-text-3);
  font-size: 12px;
}

@media (max-width: 760px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }

  .wide-field {
    grid-column: auto;
  }

  .time-section :deep(.arco-descriptions-table) {
    min-width: 620px;
  }
}
</style>
