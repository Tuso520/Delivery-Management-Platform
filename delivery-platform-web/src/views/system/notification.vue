<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import type { TableColumnData } from '@arco-design/web-vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'

import { notificationApi } from '@/api/notification'
import {
  BusinessModal,
  BusinessTable,
  Can,
  PageContainer,
  PageToolbar,
  SectionCard,
  StatusBadge,
} from '@/components/business'
import { useNotificationRulesQuery } from '@/composables/queries/useOperationsQueries'
import { usePermission } from '@/composables/usePermission'
import { queryKeys } from '@/query/keys'
import type {
  NotificationChannel,
  NotificationRecipientPolicyType,
  NotificationRule,
  SaveNotificationRuleDto,
} from '@/types/settings'
import { arcoConfirm } from '@/utils/arco-dialog'

const { hasPermission } = usePermission()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const { t, locale } = useI18n()
const canManage = computed(() => hasPermission('notification_rule:manage'))

const keyword = ref(typeof route.query.keyword === 'string' ? route.query.keyword : '')
const appliedKeyword = ref(keyword.value.trim())
const editorVisible = ref(false)
const editingId = ref('')

const form = reactive<SaveNotificationRuleDto>({
  name: '',
  eventType: '',
  channels: ['IN_APP'],
  recipientPolicy: { type: 'BUSINESS_OWNER', values: [] },
  templateId: '',
  enabled: true,
})
const rulesQuery = useNotificationRulesQuery()
const rules = computed<NotificationRule[]>(() => rulesQuery.data.value ?? [])
const loading = computed(() => rulesQuery.isFetching.value)
const loadFailed = computed(() => rulesQuery.isError.value)

type RuleMutationVariables =
  | { kind: 'save'; id?: string; data: SaveNotificationRuleDto }
  | { kind: 'toggle'; id: string }
  | { kind: 'delete'; id: string }

const ruleMutation = useMutation({
  mutationFn: async (variables: RuleMutationVariables) => {
    switch (variables.kind) {
      case 'save':
        if (variables.id) await notificationApi.updateRule(variables.id, variables.data)
        else await notificationApi.createRule(variables.data)
        return
      case 'toggle':
        await notificationApi.toggleRule(variables.id)
        return
      case 'delete':
        await notificationApi.deleteRule(variables.id)
    }
  },
  retry: false,
  onSuccess: () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.settings.notificationRules(),
    }),
})
const saving = computed(() => ruleMutation.isPending.value)

const channelOptions = computed<Array<{ label: string; value: NotificationChannel }>>(() => [
  { label: t('notifications.channelsMap.IN_APP'), value: 'IN_APP' },
  { label: t('notifications.channelsMap.FEISHU'), value: 'FEISHU' },
  { label: t('notifications.channelsMap.WECOM'), value: 'WECOM' },
])

const recipientOptions = computed<
  Array<{
    label: string
    value: NotificationRecipientPolicyType
  }>
>(() => [
  { label: t('notifications.recipients.BUSINESS_OWNER'), value: 'BUSINESS_OWNER' },
  { label: t('notifications.recipients.PROJECT_MEMBERS'), value: 'PROJECT_MEMBERS' },
  { label: t('notifications.recipients.ROLE'), value: 'ROLE' },
  { label: t('notifications.recipients.USER'), value: 'USER' },
])

const columns = computed<TableColumnData[]>(() => [
  { title: t('notifications.name'), dataIndex: 'name', minWidth: 180, fixed: 'left' },
  { title: t('notifications.eventType'), dataIndex: 'eventType', minWidth: 150 },
  { title: t('notifications.channels'), slotName: 'channels', minWidth: 190 },
  { title: t('notifications.recipient'), slotName: 'recipient', minWidth: 210 },
  {
    title: t('notifications.template'),
    dataIndex: 'templateId',
    slotName: 'template',
    minWidth: 170,
  },
  { title: t('notifications.enabled'), dataIndex: 'enabled', slotName: 'enabled', width: 150 },
  { title: t('common.action'), slotName: 'actions', width: 150, fixed: 'right' },
])

const filteredRules = computed(() => {
  const normalized = appliedKeyword.value.toLowerCase()
  if (!normalized) return rules.value
  return rules.value.filter(
    (rule) =>
      rule.name.toLowerCase().includes(normalized) ||
      rule.eventType.toLowerCase().includes(normalized),
  )
})

async function fetchRules(): Promise<void> {
  await rulesQuery.refetch()
}

async function applyKeyword(): Promise<void> {
  appliedKeyword.value = keyword.value.trim()
  await router.replace({
    path: route.path,
    query: { ...route.query, keyword: appliedKeyword.value || undefined },
  })
}

function resetKeyword(): void {
  keyword.value = ''
  void applyKeyword()
}

watch(
  () => route.query.keyword,
  (value) => {
    const nextKeyword = typeof value === 'string' ? value : ''
    if (nextKeyword === appliedKeyword.value) return
    keyword.value = nextKeyword
    appliedKeyword.value = nextKeyword
  },
)

function resetForm(): void {
  Object.assign(form, {
    name: '',
    eventType: '',
    channels: ['IN_APP'] as NotificationChannel[],
    recipientPolicy: { type: 'BUSINESS_OWNER' as const, values: [] },
    templateId: '',
    enabled: true,
  })
}

function openCreate(): void {
  if (!canManage.value) return
  editingId.value = ''
  resetForm()
  editorVisible.value = true
}

function openEdit(rule: NotificationRule): void {
  if (!canManage.value) return
  editingId.value = rule.id
  Object.assign(form, {
    name: rule.name,
    eventType: rule.eventType,
    channels: [...rule.channels],
    recipientPolicy: {
      type: rule.recipientPolicy.type,
      values: [...rule.recipientPolicy.values],
    },
    templateId: rule.templateId ?? '',
    enabled: rule.enabled,
  })
  editorVisible.value = true
}

function changeRecipientType(value: unknown): void {
  const type = recipientOptions.value.find((option) => option.value === value)?.value
  if (!type) return
  form.recipientPolicy.type = type
  if (type === 'BUSINESS_OWNER' || type === 'PROJECT_MEMBERS') {
    form.recipientPolicy.values = []
  }
}

async function saveRule(): Promise<void> {
  if (!canManage.value) return
  const name = form.name.trim()
  const eventType = form.eventType.trim()
  const values = form.recipientPolicy.values.map((value) => value.trim()).filter(Boolean)

  if (!name || !eventType) {
    Message.warning(t('notifications.validation.basic'))
    return
  }
  if (!form.channels.length) {
    Message.warning(t('notifications.validation.channel'))
    return
  }
  if (
    (form.recipientPolicy.type === 'ROLE' || form.recipientPolicy.type === 'USER') &&
    !values.length
  ) {
    Message.warning(t('notifications.validation.recipient'))
    return
  }

  const payload: SaveNotificationRuleDto = {
    name,
    eventType,
    channels: [...form.channels],
    recipientPolicy: { type: form.recipientPolicy.type, values },
    templateId: form.templateId?.trim() || '',
    enabled: form.enabled,
  }

  try {
    await ruleMutation.mutateAsync({
      kind: 'save',
      id: editingId.value || undefined,
      data: payload,
    })
    if (editingId.value) {
      Message.success(t('notifications.updated'))
    } else {
      Message.success(t('notifications.created'))
    }
    editorVisible.value = false
  } catch {
    // The shared request layer has already surfaced the failure.
  }
}

async function toggleRule(rule: NotificationRule): Promise<void> {
  if (!canManage.value) return
  try {
    await ruleMutation.mutateAsync({ kind: 'toggle', id: rule.id })
    Message.success(rule.enabled ? t('notifications.disabled') : t('notifications.enabledMessage'))
  } catch {
    // The shared request layer has already surfaced the failure.
  }
}

function removeRule(rule: NotificationRule): void {
  if (!canManage.value) return
  arcoConfirm(
    t('notifications.deleteConfirm', { name: rule.name }),
    t('notifications.deleteTitle'),
    {
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    },
  )
    .then(async () => {
      await ruleMutation.mutateAsync({ kind: 'delete', id: rule.id })
      Message.success(t('notifications.deleted'))
    })
    .catch(() => undefined)
}

function channelLabel(channel: NotificationChannel): string {
  return channelOptions.value.find((option) => option.value === channel)?.label ?? channel
}

function recipientLabel(rule: NotificationRule): string {
  const label =
    recipientOptions.value.find((option) => option.value === rule.recipientPolicy.type)?.label ??
    rule.recipientPolicy.type
  const separator = locale.value === 'en-US' ? ', ' : '、'
  return rule.recipientPolicy.values.length
    ? t('notifications.recipientValues', {
        label,
        values: rule.recipientPolicy.values.join(separator),
      })
    : label
}
</script>

<template>
  <PageContainer class="notification-page">
    <PageToolbar :title="t('notifications.title')" :description="t('notifications.description')">
      <template #actions>
        <Can permission="notification_rule:manage">
          <a-button type="primary" @click="openCreate">
            {{ t('notifications.create') }}
          </a-button>
        </Can>
      </template>
    </PageToolbar>

    <a-alert
      v-if="!canManage"
      class="page-alert"
      type="info"
      :title="t('notifications.readOnly')"
    >
      {{ t('notifications.readOnlyHint') }}
    </a-alert>
    <a-alert
      v-if="loadFailed"
      class="page-alert"
      type="error"
      :title="t('notifications.loadFailed')"
    >
      <template #action>
        <a-button size="small" @click="fetchRules">
          {{ t('common.retry') }}
        </a-button>
      </template>
    </a-alert>

    <SectionCard class="filter-card" :bordered="false">
      <a-form :model="{ keyword }" layout="inline">
        <a-form-item :label="t('notifications.name')">
          <a-input
            v-model="keyword"
            allow-clear
            :placeholder="t('notifications.searchPlaceholder')"
            class="keyword-input"
            @press-enter="applyKeyword"
            @clear="resetKeyword"
          />
        </a-form-item>
        <a-form-item>
          <a-space>
            <a-button type="primary" @click="applyKeyword">
              {{ t('common.search') }}
            </a-button>
            <a-button @click="resetKeyword">
              {{ t('common.reset') }}
            </a-button>
          </a-space>
        </a-form-item>
      </a-form>
    </SectionCard>

    <BusinessTable
      :loading="loading"
      :columns="columns"
      :data="filteredRules"
      :scroll="{ x: 1120 }"
      :error="loadFailed ? t('notifications.loadFailed') : null"
      :empty-title="t('notifications.empty')"
      :empty-description="t('notifications.unavailable')"
      :retry-label="t('common.retry')"
      row-key="id"
      class="settings-table"
      @retry="fetchRules"
    >
      <template #channels="{ record }">
        <a-space size="mini" wrap>
          <a-tag v-for="channel in record.channels" :key="channel">
            {{ channelLabel(channel) }}
          </a-tag>
        </a-space>
      </template>
      <template #recipient="{ record }">
        <span class="ellipsis-text" :title="recipientLabel(record)">{{
          recipientLabel(record)
        }}</span>
      </template>
      <template #template="{ record }">
        {{ record.templateId || t('notifications.defaultTemplate') }}
      </template>
      <template #enabled="{ record }">
        <a-space size="mini">
          <StatusBadge
            domain="notification"
            :status="record.enabled ? 'ENABLED' : 'DISABLED'"
            :label="record.enabled ? t('notifications.enabled') : t('notifications.disabledStatus')"
          />
          <Can permission="notification_rule:manage">
            <a-switch :model-value="record.enabled" @change="toggleRule(record)" />
          </Can>
        </a-space>
      </template>
      <template #actions="{ record }">
        <Can permission="notification_rule:manage">
          <a-space size="mini" :wrap="false">
            <a-button type="text" size="small" @click="openEdit(record)">
              {{ t('common.edit') }}
            </a-button>
            <a-button
              type="text"
              size="small"
              status="danger"
              @click="removeRule(record)"
            >
              {{ t('common.delete') }}
            </a-button>
          </a-space>
        </Can>
      </template>
    </BusinessTable>

    <BusinessModal
      v-model:visible="editorVisible"
      :title="editingId ? t('notifications.editTitle') : t('notifications.createTitle')"
      :width="640"
      :ok-loading="saving"
      :ok-text="t('common.save')"
      :cancel-text="t('common.cancel')"
      @ok="saveRule"
    >
      <a-form :model="form" layout="vertical">
        <div class="form-grid">
          <a-form-item :label="t('notifications.name')" required>
            <a-input
              v-model="form.name"
              :max-length="100"
              :placeholder="t('notifications.namePlaceholder')"
            />
          </a-form-item>
          <a-form-item :label="t('notifications.eventType')" required>
            <a-input
              v-model="form.eventType"
              :max-length="100"
              :placeholder="t('notifications.eventPlaceholder')"
            />
          </a-form-item>
        </div>
        <a-form-item :label="t('notifications.channels')" required>
          <a-checkbox-group v-model="form.channels" :options="channelOptions" />
        </a-form-item>
        <div class="form-grid">
          <a-form-item :label="t('notifications.recipientPolicy')" required>
            <a-select :model-value="form.recipientPolicy.type" @change="changeRecipientType">
              <a-option
                v-for="option in recipientOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item
            v-if="form.recipientPolicy.type === 'ROLE' || form.recipientPolicy.type === 'USER'"
            :label="
              form.recipientPolicy.type === 'ROLE'
                ? t('notifications.roleCode')
                : t('notifications.userId')
            "
            required
          >
            <a-input-tag
              v-model="form.recipientPolicy.values"
              allow-clear
              :placeholder="
                form.recipientPolicy.type === 'ROLE'
                  ? t('notifications.rolePlaceholder')
                  : t('notifications.userPlaceholder')
              "
            />
          </a-form-item>
        </div>
        <a-form-item :label="t('notifications.templateId')">
          <a-input
            v-model="form.templateId"
            allow-clear
            :placeholder="t('notifications.templatePlaceholder')"
          />
        </a-form-item>
        <a-form-item :label="t('notifications.enableRule')">
          <a-switch v-model="form.enabled" />
        </a-form-item>
      </a-form>
    </BusinessModal>
  </PageContainer>
</template>

<style scoped lang="scss">
.notification-page {
  min-width: 0;
}

.page-alert,
.filter-card {
  margin-bottom: 12px;
}

.keyword-input {
  width: 300px;
}

.settings-table {
  background: var(--color-bg-2);
}

.ellipsis-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

  .keyword-input {
    width: 100%;
  }
}
</style>
