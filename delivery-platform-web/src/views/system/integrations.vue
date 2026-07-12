<script setup lang="ts">
import { computed, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import type { TableColumnData } from '@arco-design/web-vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'

import { integrationApi } from '@/api/integration'
import {
  BusinessDrawer,
  BusinessModal,
  BusinessTable,
  Can,
  PageContainer,
  PageToolbar,
  StatusBadge,
} from '@/components/business'
import {
  useIntegrationLogsQuery,
  useIntegrationsQuery,
} from '@/composables/queries/useOperationsQueries'
import { usePermission } from '@/composables/usePermission'
import { queryKeys } from '@/query/keys'
import type {
  IntegrationActionResult,
  IntegrationConfig,
  IntegrationProvider,
  IntegrationSyncLog,
} from '@/types/settings'
import {
  buildIntegrationUpdate,
  emptyIntegrationForm,
  hasConfiguredSecret,
  hydrateIntegrationForm,
  type IntegrationEditorForm,
} from './integration-form'

interface IntegrationRow {
  provider: IntegrationProvider
  label: string
  config?: IntegrationConfig
}

type IntegrationAction = 'test' | 'sync' | 'notification'

const { hasPermission } = usePermission()
const queryClient = useQueryClient()
const { t, locale } = useI18n()
const canManage = computed(() => hasPermission('integration:manage'))

const providerOptions = computed<Array<{ provider: IntegrationProvider; label: string }>>(() => [
  { provider: 'FEISHU', label: t('integrations.providers.FEISHU') },
  { provider: 'WECOM', label: t('integrations.providers.WECOM') },
])

const editorVisible = ref(false)
const editingProvider = ref<IntegrationProvider>('FEISHU')
const form = ref<IntegrationEditorForm>(
  emptyIntegrationForm('FEISHU', t('integrations.defaultNames.FEISHU')),
)

const logsVisible = ref(false)
const logsProvider = ref<IntegrationProvider>('FEISHU')
const logsPage = ref(1)
const integrationsQuery = useIntegrationsQuery()
const integrationLogsQuery = useIntegrationLogsQuery(
  logsProvider,
  computed(() => ({ page: logsPage.value, pageSize: 20 })),
  logsVisible,
)
const configs = computed<IntegrationConfig[]>(() => integrationsQuery.data.value ?? [])
const logs = computed<IntegrationSyncLog[]>(() => integrationLogsQuery.data.value?.items ?? [])
const logsTotal = computed(() => integrationLogsQuery.data.value?.total ?? 0)
const logsPagination = computed(() => ({
  page: logsPage.value,
  pageSize: 20,
  total: logsTotal.value,
}))
const loading = computed(() => integrationsQuery.isFetching.value)
const loadFailed = computed(() => integrationsQuery.isError.value)
const logsLoading = computed(() => integrationLogsQuery.isFetching.value)

const rows = computed<IntegrationRow[]>(() =>
  providerOptions.value.map((option) => ({
    ...option,
    config: configs.value.find((config) => config.provider === option.provider),
  })),
)

const selectedConfig = computed(() =>
  configs.value.find((config) => config.provider === editingProvider.value),
)

const columns = computed<TableColumnData[]>(() => [
  { title: t('integrations.columns.provider'), dataIndex: 'label', width: 130, fixed: 'left' },
  { title: t('integrations.columns.configName'), slotName: 'configName', minWidth: 180 },
  { title: t('integrations.columns.capabilities'), slotName: 'capabilities', minWidth: 180 },
  { title: t('integrations.columns.credentials'), slotName: 'credentials', minWidth: 180 },
  { title: t('integrations.columns.enabled'), slotName: 'enabled', width: 110 },
  { title: t('integrations.columns.updatedAt'), slotName: 'updatedAt', width: 170 },
  { title: t('common.action'), slotName: 'actions', width: 370, fixed: 'right' },
])

const logColumns = computed<TableColumnData[]>(() => [
  {
    title: t('integrations.columns.startedAt'),
    dataIndex: 'startedAt',
    slotName: 'startedAt',
    width: 170,
  },
  { title: t('integrations.columns.action'), dataIndex: 'action', slotName: 'action', width: 130 },
  { title: t('integrations.columns.result'), dataIndex: 'status', slotName: 'status', width: 90 },
  { title: t('integrations.columns.requester'), slotName: 'requester', width: 120 },
  { title: t('integrations.columns.summary'), slotName: 'summary', minWidth: 280 },
])

const saveIntegrationMutation = useMutation({
  mutationFn: ({
    provider,
    data,
  }: {
    provider: IntegrationProvider
    data: Parameters<typeof integrationApi.update>[1]
  }) => integrationApi.update(provider, data),
  retry: false,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.settings.integrations() }),
})

const integrationActionMutation = useMutation({
  mutationFn: ({
    provider,
    action,
  }: {
    provider: IntegrationProvider
    action: IntegrationAction
  }) => {
    if (action === 'test') return integrationApi.test(provider)
    if (action === 'sync') return integrationApi.syncContacts(provider)
    return integrationApi.testNotification(provider)
  },
  retry: false,
  onSuccess: async (_, variables) => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.settings.integrationLogLists(variables.provider),
    })
  },
})
const saving = computed(() => saveIntegrationMutation.isPending.value)
const actionLoading = computed(() => {
  if (!integrationActionMutation.isPending.value) return ''
  const variables = integrationActionMutation.variables.value
  return variables ? actionKey(variables.provider, variables.action) : ''
})

async function fetchConfigs(): Promise<void> {
  await integrationsQuery.refetch()
}

function openEditor(row: IntegrationRow): void {
  if (!canManage.value) return
  editingProvider.value = row.provider
  form.value = hydrateIntegrationForm(
    row.provider,
    row.config,
    t(`integrations.defaultNames.${row.provider}`),
  )
  editorVisible.value = true
}

function requiredCredentialMissing(): boolean {
  const config = selectedConfig.value
  if (!form.value.isEnabled) return false
  if (editingProvider.value === 'FEISHU') {
    return (
      !form.value.appId.trim() ||
      (!hasConfiguredSecret(config, 'appSecret') && !form.value.appSecret.trim())
    )
  }
  return (
    !form.value.corpId.trim() ||
    !form.value.agentId.trim() ||
    (!hasConfiguredSecret(config, 'secret') && !form.value.secret.trim())
  )
}

async function saveIntegration(): Promise<void> {
  if (!canManage.value) return
  if (!form.value.configName.trim()) {
    Message.warning(t('integrations.validation.name'))
    return
  }
  if (requiredCredentialMissing()) {
    Message.warning(t('integrations.validation.credentials'))
    return
  }

  try {
    await saveIntegrationMutation.mutateAsync({
      provider: editingProvider.value,
      data: buildIntegrationUpdate(editingProvider.value, form.value),
    })
    Message.success(t('integrations.saved'))
    editorVisible.value = false
  } catch {
    // The shared request layer has already surfaced the failure.
  }
}

function actionKey(provider: IntegrationProvider, action: IntegrationAction): string {
  return `${provider}:${action}`
}

async function runAction(row: IntegrationRow, action: IntegrationAction): Promise<void> {
  if (!canManage.value || !row.config) return
  try {
    const result: IntegrationActionResult = await integrationActionMutation.mutateAsync({
      provider: row.provider,
      action,
    })

    if (result.success === false) {
      Message.error(redactText(result.errorReason) || t('integrations.operationFailed'))
      return
    }
    if (action === 'sync') {
      Message.success(
        t('integrations.syncSuccess', {
          added: result.added ?? result.created ?? 0,
          updated: result.updated ?? 0,
          conflicts: result.conflicts ?? 0,
        }),
      )
    } else {
      Message.success(
        action === 'test'
          ? t('integrations.connectionSuccess')
          : t('integrations.notificationSuccess'),
      )
    }
  } catch {
    // The shared request layer has already surfaced the failure.
  }
}

async function openLogs(row: IntegrationRow): Promise<void> {
  logsProvider.value = row.provider
  logsPage.value = 1
  logsVisible.value = true
  await integrationLogsQuery.refetch()
}

function changeLogPage(page: number): void {
  logsPage.value = page
}

function providerLabel(provider: IntegrationProvider): string {
  return providerOptions.value.find((option) => option.provider === provider)?.label ?? provider
}

function capabilityLabel(capability: string): string {
  return ['CONTACT_SYNC', 'NOTIFICATION'].includes(capability)
    ? t(`integrations.capabilities.${capability}`)
    : capability
}

function hasPrimarySecret(row: IntegrationRow): boolean {
  return row.provider === 'FEISHU'
    ? hasConfiguredSecret(row.config, 'appSecret')
    : hasConfiguredSecret(row.config, 'secret')
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale.value, { hour12: false })
}

function logActionLabel(action: IntegrationSyncLog['action']): string {
  return t(`integrations.actions.${action}`)
}

function safeSummary(log: IntegrationSyncLog): string {
  if (log.errorReason) return redactText(log.errorReason)
  if (!log.summary) return '—'
  try {
    return redactText(
      JSON.stringify(log.summary, (key, value: unknown) =>
        /secret|password|token|credential|authorization/iu.test(key) ? '******' : value,
      ),
    )
  } catch {
    return t('integrations.summaryUnavailable')
  }
}

function redactText(value?: string | null): string {
  if (!value) return ''
  return value
    .replace(
      /(password|secret|token|api.?key|access.?key|authorization)\s*[=:]\s*[^\s,;]+/giu,
      '$1=******',
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, 'Bearer ******')
}
</script>

<template>
  <PageContainer class="integration-page">
    <PageToolbar :title="t('integrations.title')" :description="t('integrations.description')">
      <template #actions>
        <a-button :loading="loading" @click="fetchConfigs">
          {{
            t('integrations.refresh')
          }}
        </a-button>
      </template>
    </PageToolbar>

    <a-alert
      v-if="!canManage"
      class="page-alert"
      type="info"
      :title="t('integrations.readOnly')"
    >
      {{ t('integrations.readOnlyHint') }}
    </a-alert>
    <a-alert class="page-alert" type="warning" :title="t('integrations.secretWarning')">
      {{ t('integrations.secretWarningHint') }}
    </a-alert>

    <BusinessTable
      :loading="loading"
      :columns="columns"
      :data="rows"
      :scroll="{ x: 1180 }"
      :error="loadFailed ? t('integrations.loadFailed') : null"
      :empty-title="t('integrations.empty')"
      :empty-description="t('integrations.unavailable')"
      :retry-label="t('common.retry')"
      row-key="provider"
      class="settings-table"
      @retry="fetchConfigs"
    >
      <template #configName="{ record }">
        <div class="name-cell">
          <strong>
            {{
              record.config?.configName ||
                t('integrations.notConfiguredName', { provider: record.label })
            }}
          </strong>
          <span>{{ record.config?.description || '—' }}</span>
        </div>
      </template>
      <template #capabilities="{ record }">
        <a-space size="mini" wrap>
          <a-tag
            v-for="capability in record.config?.capabilities || ['CONTACT_SYNC', 'NOTIFICATION']"
            :key="capability"
          >
            {{ capabilityLabel(capability) }}
          </a-tag>
        </a-space>
      </template>
      <template #credentials="{ record }">
        <StatusBadge
          domain="integration"
          :status="hasPrimarySecret(record) ? 'CONFIGURED' : 'MISSING'"
          :label="
            hasPrimarySecret(record)
              ? t('integrations.credentialConfigured')
              : t('integrations.credentialMissing')
          "
        />
      </template>
      <template #enabled="{ record }">
        <StatusBadge
          domain="integration"
          :status="record.config?.isEnabled ? 'ENABLED' : 'DISABLED'"
          :label="
            record.config?.isEnabled
              ? t('integrations.enabledStatus')
              : t('integrations.disabledStatus')
          "
        />
      </template>
      <template #updatedAt="{ record }">
        {{ formatDate(record.config?.updatedAt) }}
      </template>
      <template #actions="{ record }">
        <a-space size="mini" :wrap="false">
          <Can permission="integration:manage">
            <a-space size="mini" :wrap="false">
              <a-button type="text" size="small" @click="openEditor(record)">
                {{ record.config ? t('common.edit') : t('integrations.configure') }}
              </a-button>
              <a-button
                type="text"
                size="small"
                :disabled="!record.config?.isEnabled"
                :loading="actionLoading === actionKey(record.provider, 'test')"
                @click="runAction(record, 'test')"
              >
                {{ t('integrations.testConnection') }}
              </a-button>
              <a-button
                type="text"
                size="small"
                :disabled="!record.config?.isEnabled"
                :loading="actionLoading === actionKey(record.provider, 'sync')"
                @click="runAction(record, 'sync')"
              >
                {{ t('integrations.syncContacts') }}
              </a-button>
              <a-button
                type="text"
                size="small"
                :disabled="!record.config?.isEnabled"
                :loading="actionLoading === actionKey(record.provider, 'notification')"
                @click="runAction(record, 'notification')"
              >
                {{ t('integrations.testNotification') }}
              </a-button>
            </a-space>
          </Can>
          <a-button type="text" size="small" @click="openLogs(record)">
            {{ t('integrations.syncLogs') }}
          </a-button>
        </a-space>
      </template>
    </BusinessTable>

    <BusinessModal
      v-model:visible="editorVisible"
      :title="t('integrations.editorTitle', { provider: providerLabel(editingProvider) })"
      :width="720"
      :ok-loading="saving"
      :ok-text="t('common.save')"
      :cancel-text="t('common.cancel')"
      @ok="saveIntegration"
    >
      <a-form :model="form" layout="vertical">
        <div class="form-grid">
          <a-form-item :label="t('integrations.columns.configName')" required>
            <a-input v-model="form.configName" :max-length="100" />
          </a-form-item>
          <a-form-item :label="t('integrations.enabled')">
            <a-switch v-model="form.isEnabled" />
          </a-form-item>
        </div>

        <template v-if="editingProvider === 'FEISHU'">
          <div class="form-grid">
            <a-form-item :label="t('integrations.appId')" required>
              <a-input v-model="form.appId" :max-length="200" />
            </a-form-item>
            <a-form-item :label="t('integrations.appSecretField')" required>
              <a-input
                v-model="form.appSecret"
                type="password"
                :placeholder="t('integrations.replaceSecretPlaceholder')"
              />
              <template #extra>
                {{
                  hasConfiguredSecret(selectedConfig, 'appSecret')
                    ? t('integrations.configuredReplaceHint')
                    : t('integrations.notConfiguredHint')
                }}
              </template>
            </a-form-item>
            <a-form-item :label="t('integrations.webhook')">
              <a-input
                v-model="form.webhookUrl"
                type="password"
                :placeholder="t('integrations.replaceSecretPlaceholder')"
              />
              <template #extra>
                {{
                  hasConfiguredSecret(selectedConfig, 'webhookUrl')
                    ? t('integrations.configuredReplaceHint')
                    : t('integrations.webhookOptionalHint')
                }}
              </template>
            </a-form-item>
            <a-form-item :label="t('integrations.verificationToken')">
              <a-input
                v-model="form.verificationToken"
                type="password"
                :placeholder="t('integrations.replaceSecretPlaceholder')"
              />
              <template #extra>
                {{
                  hasConfiguredSecret(selectedConfig, 'verificationToken')
                    ? t('integrations.configuredReplaceHint')
                    : t('integrations.notConfiguredHint')
                }}
              </template>
            </a-form-item>
            <a-form-item :label="t('integrations.encryptKey')">
              <a-input
                v-model="form.encryptKey"
                type="password"
                :placeholder="t('integrations.replaceSecretPlaceholder')"
              />
              <template #extra>
                {{
                  hasConfiguredSecret(selectedConfig, 'encryptKey')
                    ? t('integrations.configuredReplaceHint')
                    : t('integrations.notConfiguredHint')
                }}
              </template>
            </a-form-item>
          </div>
        </template>
        <template v-else>
          <div class="form-grid">
            <a-form-item :label="t('integrations.corpId')" required>
              <a-input v-model="form.corpId" :max-length="200" />
            </a-form-item>
            <a-form-item :label="t('integrations.agentId')" required>
              <a-input v-model="form.agentId" :max-length="30" />
            </a-form-item>
            <a-form-item :label="t('integrations.appSecret')" required>
              <a-input
                v-model="form.secret"
                type="password"
                :placeholder="t('integrations.replaceSecretPlaceholder')"
              />
              <template #extra>
                {{
                  hasConfiguredSecret(selectedConfig, 'secret')
                    ? t('integrations.configuredReplaceHint')
                    : t('integrations.notConfiguredHint')
                }}
              </template>
            </a-form-item>
          </div>
        </template>

        <div class="form-grid">
          <a-form-item :label="t('integrations.departmentId')">
            <a-input
              v-model="form.contactDepartmentId"
              :placeholder="t('integrations.departmentPlaceholder')"
            />
          </a-form-item>
          <a-form-item :label="t('integrations.testRecipient')">
            <a-input
              v-model="form.testRecipient"
              :placeholder="t('integrations.testRecipientPlaceholder')"
            />
          </a-form-item>
        </div>
        <a-form-item :label="t('integrations.descriptionLabel')">
          <a-textarea
            v-model="form.description"
            :auto-size="{ minRows: 2, maxRows: 4 }"
            :max-length="200"
          />
        </a-form-item>
      </a-form>
    </BusinessModal>

    <BusinessDrawer
      v-model:visible="logsVisible"
      :title="t('integrations.logsTitle', { provider: providerLabel(logsProvider) })"
      :width="760"
      :footer="false"
    >
      <BusinessTable
        :loading="logsLoading"
        :columns="logColumns"
        :data="logs"
        :pagination="logsPagination"
        :scroll="{ x: 760 }"
        row-key="id"
        :error="integrationLogsQuery.isError.value ? t('integrations.logsLoadFailed') : null"
        :empty-title="t('integrations.logsEmpty')"
        :retry-label="t('common.retry')"
        @retry="integrationLogsQuery.refetch()"
        @page-change="changeLogPage"
      >
        <template #startedAt="{ record }">
          {{ formatDate(record.startedAt) }}
        </template>
        <template #action="{ record }">
          {{ logActionLabel(record.action) }}
        </template>
        <template #status="{ record }">
          <StatusBadge
            domain="integration"
            :status="record.status"
            :label="
              record.status === 'SUCCESS' ? t('integrations.success') : t('integrations.failure')
            "
          />
        </template>
        <template #requester="{ record }">
          {{ record.requester?.realName || record.requester?.username || '—' }}
        </template>
        <template #summary="{ record }">
          <span class="log-summary" :title="safeSummary(record)">{{ safeSummary(record) }}</span>
        </template>
      </BusinessTable>
    </BusinessDrawer>
  </PageContainer>
</template>

<style scoped lang="scss">
.integration-page {
  min-width: 0;
}

.page-alert {
  margin-bottom: 12px;
}

.settings-table {
  background: var(--color-bg-2);
}

.name-cell {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.name-cell strong,
.name-cell span,
.log-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name-cell span,
.log-summary {
  color: var(--color-text-3);
  font-size: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

@media (max-width: 720px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
