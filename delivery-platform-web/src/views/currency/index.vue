<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'

import { currencyApi } from '@/api/currency'
import {
  BusinessModal,
  BusinessTable,
  Can,
  PageContainer,
  PageToolbar,
  StatusBadge,
} from '@/components/business'
import { useCurrenciesQuery } from '@/composables/queries/useAdministrationQueries'
import { usePermission } from '@/composables/usePermission'
import { queryKeys } from '@/query/keys'
import type {
  CreateCurrencyDto,
  Currency,
  CurrencyRateSyncResult,
  UpdateCurrencyDto,
} from '@/types/currency'
import { arcoConfirm } from '@/utils/arco-dialog'

type CurrencySaveVariables =
  | { kind: 'create'; data: CreateCurrencyDto }
  | { kind: 'update'; code: string; data: UpdateCurrencyDto }

interface CurrencyLockVariables {
  code: string
  currentlyLocked: boolean
}

const queryClient = useQueryClient()
const { hasPermission } = usePermission()
const { t, locale } = useI18n()
const canManage = computed(() => hasPermission('currency:manage'))
const currenciesQuery = useCurrenciesQuery()
const currencies = computed<Currency[]>(() => currenciesQuery.data.value ?? [])
const syncResult = ref<CurrencyRateSyncResult>()

const editorVisible = ref(false)
const editingCode = ref('')
const form = reactive({
  currencyCode: '',
  currencyName: '',
  currencySymbol: '',
  decimalPlaces: 2,
  cnyRate: undefined as number | undefined,
})

async function invalidateCurrencies(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.currencies.all })
}

const saveCurrencyMutation = useMutation({
  mutationFn: (variables: CurrencySaveVariables) =>
    variables.kind === 'create'
      ? currencyApi.create(variables.data)
      : currencyApi.updateByCode(variables.code, variables.data),
  retry: false,
  onSuccess: invalidateCurrencies,
})

const syncRatesMutation = useMutation({
  mutationFn: currencyApi.syncRates,
  retry: false,
  onSuccess: invalidateCurrencies,
})

const rateLockMutation = useMutation({
  mutationFn: (variables: CurrencyLockVariables) =>
    variables.currentlyLocked
      ? currencyApi.unlockRate(variables.code)
      : currencyApi.lockRate(variables.code),
  retry: false,
  onSuccess: invalidateCurrencies,
})

const disableCurrencyMutation = useMutation({
  mutationFn: currencyApi.disable,
  retry: false,
  onSuccess: invalidateCurrencies,
})

function resetForm(): void {
  Object.assign(form, {
    currencyCode: '',
    currencyName: '',
    currencySymbol: '',
    decimalPlaces: 2,
    cnyRate: undefined,
  })
}

function openCreate(): void {
  if (!canManage.value) return
  editingCode.value = ''
  resetForm()
  editorVisible.value = true
}

function openEdit(row: Currency): void {
  if (!canManage.value) return
  editingCode.value = row.currencyCode
  Object.assign(form, {
    currencyCode: row.currencyCode,
    currencyName: row.currencyName,
    currencySymbol: row.currencySymbol ?? '',
    decimalPlaces: row.decimalPlaces,
    cnyRate: row.cnyRate === null ? undefined : Number(row.cnyRate),
  })
  editorVisible.value = true
}

async function saveCurrency(): Promise<void> {
  if (!canManage.value) return
  const code = form.currencyCode.trim().toUpperCase()
  const name = form.currencyName.trim()
  if (!/^[A-Z]{3,10}$/u.test(code)) {
    Message.warning(t('currency.validation.code'))
    return
  }
  if (!name) {
    Message.warning(t('currency.validation.name'))
    return
  }

  try {
    if (editingCode.value) {
      await saveCurrencyMutation.mutateAsync({
        kind: 'update',
        code: editingCode.value,
        data: {
          currencyName: name,
          currencySymbol: form.currencySymbol.trim(),
          decimalPlaces: form.decimalPlaces,
          ...(form.cnyRate !== undefined ? { cnyRate: form.cnyRate } : {}),
        },
      })
      Message.success(t('currency.updated'))
    } else {
      await saveCurrencyMutation.mutateAsync({
        kind: 'create',
        data: {
          currencyCode: code,
          currencyName: name,
          currencySymbol: form.currencySymbol.trim() || undefined,
          decimalPlaces: form.decimalPlaces,
        },
      })
      Message.success(t('currency.created'))
    }
    editorVisible.value = false
  } catch {
    // The shared request layer has already surfaced the failure.
  }
}

async function syncRates(): Promise<void> {
  if (!canManage.value) return
  try {
    syncResult.value = await syncRatesMutation.mutateAsync()
    Message.success(t('currency.syncSuccess', { count: syncResult.value.syncedCount }))
  } catch {
    // The shared request layer has already surfaced the failure.
  }
}

function toggleRateLock(row: Currency): void {
  if (!canManage.value) return
  const nextAction = row.rateLocked ? t('currency.unlock') : t('currency.lock')
  arcoConfirm(
    t('currency.lockConfirm', { action: nextAction, code: row.currencyCode }),
    t('currency.lockTitle', { action: nextAction }),
    {
      confirmButtonText: nextAction,
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    },
  )
    .then(async () => {
      try {
        await rateLockMutation.mutateAsync({
          code: row.currencyCode,
          currentlyLocked: row.rateLocked,
        })
        Message.success(t('currency.lockSuccess', { action: nextAction }))
      } catch {
        // The shared request layer has already surfaced the failure.
      }
    })
    .catch(() => undefined)
}

function disableCurrency(row: Currency): void {
  if (!canManage.value || row.status !== 'Active') return
  arcoConfirm(
    t('currency.disableConfirm', { code: row.currencyCode }),
    t('currency.disableTitle', { name: row.currencyName }),
    {
      confirmButtonText: t('currency.confirmDisable'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    },
  )
    .then(async () => {
      try {
        await disableCurrencyMutation.mutateAsync(row.currencyCode)
        Message.success(t('currency.disabled'))
      } catch {
        // The shared request layer has already surfaced the failure.
      }
    })
    .catch(() => undefined)
}

function formatRate(value: Currency['cnyRate']): string {
  if (value === null || value === undefined || value === '') return '—'
  const numeric = Number(value)
  return Number.isFinite(numeric)
    ? numeric.toLocaleString(locale.value, { maximumFractionDigits: 8 })
    : '—'
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale.value)
}

function sourceLabel(source: string | null): string {
  if (!source) return '—'
  const normalized = source.toLowerCase()
  return ['manual', 'boc', 'online'].includes(normalized)
    ? t(`currency.sources.${normalized}`)
    : source
}
</script>

<template>
  <PageContainer class="resource-page currency-page">
    <PageToolbar :title="t('currency.title')" :description="t('currency.description')">
      <template #actions>
        <Can permission="currency:manage">
          <a-space>
            <a-button :loading="syncRatesMutation.isPending.value" @click="syncRates">
              {{ t('currency.sync') }}
            </a-button>
            <a-button type="primary" @click="openCreate">
              {{ t('currency.create') }}
            </a-button>
          </a-space>
        </Can>
      </template>
    </PageToolbar>

    <a-alert
      v-if="!canManage"
      class="page-alert"
      type="info"
      :title="t('currency.readOnly')"
    >
      {{ t('currency.readOnlyHint') }}
    </a-alert>
    <a-alert
      v-else-if="syncResult"
      class="page-alert"
      type="success"
      :title="t('currency.syncSummary', { count: syncResult.syncedCount })"
      closable
      @close="syncResult = undefined"
    >
      {{ formatDate(syncResult.rateDate) }} · {{ sourceLabel(syncResult.source) }}
    </a-alert>

    <BusinessTable
      :data="currencies"
      :loading="currenciesQuery.isFetching.value"
      :error="currenciesQuery.isError.value ? t('currency.loadFailed') : null"
      :empty-title="t('currency.empty')"
      :empty-description="t('currency.unavailable')"
      :retry-label="t('common.retry')"
      row-key="id"
      class="settings-table"
      @retry="currenciesQuery.refetch()"
    >
      <a-table-column
        :title="t('currency.columns.code')"
        data-index="currencyCode"
        :width="110"
        fixed="left"
      />
      <a-table-column
        :title="t('currency.columns.name')"
        data-index="currencyName"
        :min-width="140"
      />
      <a-table-column :title="t('currency.columns.symbol')" :width="86">
        <template #cell="{ record }">
          {{ record.currencySymbol || '—' }}
        </template>
      </a-table-column>
      <a-table-column
        :title="t('currency.columns.decimalPlaces')"
        data-index="decimalPlaces"
        :width="96"
      />
      <a-table-column :title="t('common.status')" :width="86">
        <template #cell="{ record }">
          <StatusBadge
            domain="currency"
            :status="record.status"
            :label="record.status === 'Active' ? t('currency.active') : t('currency.inactive')"
          />
        </template>
      </a-table-column>
      <a-table-column :title="t('currency.columns.rate')" :width="150">
        <template #cell="{ record }">
          {{ formatRate(record.cnyRate) }}
        </template>
      </a-table-column>
      <a-table-column :title="t('currency.columns.rateDate')" :width="120">
        <template #cell="{ record }">
          {{ formatDate(record.rateDate) }}
        </template>
      </a-table-column>
      <a-table-column :title="t('currency.columns.rateSource')" :width="120">
        <template #cell="{ record }">
          {{ sourceLabel(record.rateSource) }}
        </template>
      </a-table-column>
      <a-table-column :title="t('currency.columns.lockStatus')" :width="110">
        <template #cell="{ record }">
          <a-tag :color="record.rateLocked ? 'orange' : 'green'">
            {{ record.rateLocked ? t('currency.locked') : t('currency.unlocked') }}
          </a-tag>
        </template>
      </a-table-column>
      <a-table-column :title="t('common.action')" :width="210" fixed="right">
        <template #cell="{ record }">
          <Can permission="currency:manage">
            <a-space size="mini" :wrap="false">
              <a-button type="text" size="small" @click="openEdit(record)">
                {{ t('common.edit') }}
              </a-button>
              <a-button
                type="text"
                size="small"
                :disabled="record.cnyRate == null"
                @click="toggleRateLock(record)"
              >
                {{ record.rateLocked ? t('currency.unlock') : t('currency.lock') }}
              </a-button>
              <a-button
                type="text"
                size="small"
                status="danger"
                :disabled="record.status !== 'Active'"
                @click="disableCurrency(record)"
              >
                {{ t('currency.inactive') }}
              </a-button>
            </a-space>
          </Can>
        </template>
      </a-table-column>
    </BusinessTable>

    <BusinessModal
      v-model:visible="editorVisible"
      :title="editingCode ? t('currency.editTitle') : t('currency.createTitle')"
      :width="560"
      :mask-closable="false"
    >
      <a-form :model="form" layout="vertical">
        <div class="form-grid">
          <a-form-item :label="t('currency.columns.code')" required>
            <a-input
              v-model="form.currencyCode"
              :disabled="Boolean(editingCode)"
              :placeholder="t('currency.codePlaceholder')"
              :max-length="10"
            />
          </a-form-item>
          <a-form-item :label="t('currency.columns.name')" required>
            <a-input
              v-model="form.currencyName"
              :placeholder="t('currency.namePlaceholder')"
              :max-length="50"
            />
          </a-form-item>
          <a-form-item :label="t('currency.columns.symbol')">
            <a-input
              v-model="form.currencySymbol"
              :placeholder="t('currency.symbolPlaceholder')"
              :max-length="10"
            />
          </a-form-item>
          <a-form-item :label="t('currency.columns.decimalPlaces')">
            <a-input-number v-model="form.decimalPlaces" :min="0" :max="6" />
          </a-form-item>
          <a-form-item v-if="editingCode" :label="t('currency.columns.rate')" class="full-row">
            <a-input-number
              v-model="form.cnyRate"
              :min="0.00000001"
              :precision="8"
              :disabled="currencies.find((item) => item.currencyCode === editingCode)?.rateLocked"
              :placeholder="t('currency.ratePlaceholder')"
            />
            <template #extra>
              {{ t('currency.rateLockedHint') }}
            </template>
          </a-form-item>
        </div>
      </a-form>
      <template #footer>
        <a-button @click="editorVisible = false">
          {{ t('common.cancel') }}
        </a-button>
        <a-button
          type="primary"
          :loading="saveCurrencyMutation.isPending.value"
          @click="saveCurrency"
        >
          {{ t('common.save') }}
        </a-button>
      </template>
    </BusinessModal>
  </PageContainer>
</template>

<style scoped lang="scss">
.currency-page {
  min-width: 0;
}

.settings-table {
  background: var(--color-bg-2);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.full-row {
  grid-column: 1 / -1;
}

@media (max-width: 720px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .full-row {
    grid-column: auto;
  }
}
</style>
