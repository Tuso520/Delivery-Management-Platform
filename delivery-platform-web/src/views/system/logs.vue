<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TableColumnData } from '@arco-design/web-vue'

import type { QueryOperationLogParams } from '@/api/system'
import {
  BusinessDrawer,
  BusinessTable,
  PageContainer,
  PageToolbar,
  SectionCard,
  StatusBadge,
} from '@/components/business'
import { useAuditLogQuery, useAuditLogsQuery } from '@/composables/queries/useOperationsQueries'
import type { OperationLog } from '@/types/system'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const dateRange = ref<string[]>(
  [
    typeof route.query.startDate === 'string' ? route.query.startDate : '',
    typeof route.query.endDate === 'string' ? route.query.endDate : '',
  ].filter(Boolean),
)
const query = reactive<QueryOperationLogParams>({
  page: Number(route.query.page) || 1,
  pageSize: Number(route.query.pageSize) || 20,
  keyword: typeof route.query.keyword === 'string' ? route.query.keyword : '',
  action: typeof route.query.action === 'string' ? route.query.action : '',
})
const appliedQuery = ref(buildQueryParams())

const drawerVisible = ref(false)
const selectedLogId = ref('')
const logsQuery = useAuditLogsQuery(appliedQuery)
const logDetailQuery = useAuditLogQuery(selectedLogId)
const logs = computed<OperationLog[]>(() => logsQuery.data.value?.items ?? [])
const total = computed(() => logsQuery.data.value?.total ?? 0)
const pagination = computed(() => ({
  page: query.page ?? 1,
  pageSize: query.pageSize ?? 20,
  total: total.value,
}))
const loading = computed(() => logsQuery.isFetching.value)
const loadFailed = computed(() => logsQuery.isError.value)
const detailLoading = computed(() => logDetailQuery.isFetching.value)
const detail = computed(() => logDetailQuery.data.value)

const actionOptions = computed(() =>
  [
    'create',
    'update',
    'delete',
    'view',
    'preview',
    'download',
    'upload',
    'approve',
    'reject',
    'login',
    'sync',
  ].map((value) => ({ value, label: t(`logs.actions.${value}`) })),
)

const columns = computed<TableColumnData[]>(() => [
  {
    title: t('logs.columns.time'),
    dataIndex: 'createdAt',
    slotName: 'createdAt',
    width: 176,
    fixed: 'left',
  },
  { title: t('logs.columns.user'), slotName: 'user', width: 130 },
  { title: t('logs.columns.module'), dataIndex: 'module', width: 110 },
  { title: t('logs.columns.type'), dataIndex: 'action', slotName: 'action', width: 120 },
  { title: t('logs.columns.target'), slotName: 'target', minWidth: 220 },
  { title: t('logs.columns.result'), dataIndex: 'result', slotName: 'result', width: 100 },
  { title: t('logs.columns.source'), slotName: 'source', minWidth: 220 },
  { title: t('logs.columns.detail'), slotName: 'actions', width: 100, fixed: 'right' },
])

function buildQueryParams(): QueryOperationLogParams {
  return {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.keyword?.trim() ? { keyword: query.keyword.trim() } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(dateRange.value[0] ? { startDate: dateRange.value[0] } : {}),
    ...(dateRange.value[1] ? { endDate: dateRange.value[1] } : {}),
  }
}

async function fetchLogs(): Promise<void> {
  await logsQuery.refetch()
}

async function applyQuery(): Promise<void> {
  appliedQuery.value = buildQueryParams()
  await router.replace({
    path: route.path,
    query: {
      page: query.page === 1 ? undefined : String(query.page),
      pageSize: query.pageSize === 20 ? undefined : String(query.pageSize),
      keyword: query.keyword?.trim() || undefined,
      action: query.action || undefined,
      startDate: dateRange.value[0] || undefined,
      endDate: dateRange.value[1] || undefined,
    },
  })
}

function search(): void {
  query.page = 1
  void applyQuery()
}

function resetSearch(): void {
  query.keyword = ''
  query.action = ''
  query.page = 1
  dateRange.value = []
  void applyQuery()
}

function changePage(page: number): void {
  query.page = page
  void applyQuery()
}

async function openDetail(row: OperationLog): Promise<void> {
  drawerVisible.value = true
  const isCurrent = selectedLogId.value === row.id
  selectedLogId.value = row.id
  if (isCurrent) await logDetailQuery.refetch()
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale.value, { hour12: false })
}

function userLabel(log: OperationLog): string {
  return log.user?.realName || log.user?.username || log.userId || t('logs.systemUser')
}

function actionLabel(action: string): string {
  return actionOptions.value.find((option) => option.value === action)?.label ?? action
}

function resultLabel(result: string): string {
  const normalized = result.toLowerCase()
  return ['success', 'failure', 'failed', 'denied'].includes(normalized)
    ? t(`logs.results.${normalized}`)
    : result
}

function safeJson(value: unknown): string {
  if (value === null || value === undefined) return '—'
  try {
    return redactText(
      JSON.stringify(
        value,
        (key, item: unknown) => {
          if (/secret|password|token|credential|private.?key|authorization/iu.test(key)) {
            return '******'
          }
          return item
        },
        2,
      ),
    )
  } catch {
    return t('logs.invalidStructure')
  }
}

function redactText(value?: string | null): string {
  if (!value) return '—'
  return value
    .replace(
      /(password|secret|token|api.?key|access.?key|authorization)\s*[=:]\s*[^\s,;]+/giu,
      '$1=******',
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, 'Bearer ******')
}
</script>

<template>
  <PageContainer class="audit-page">
    <PageToolbar :title="t('logs.title')" :description="t('logs.description')">
      <template #actions>
        <a-button :loading="loading" @click="fetchLogs">
          {{ t('logs.refresh') }}
        </a-button>
      </template>
    </PageToolbar>

    <SectionCard class="filter-card" :bordered="false">
      <a-form :model="query" layout="inline">
        <a-form-item :label="t('logs.keyword')">
          <a-input
            v-model="query.keyword"
            class="keyword-input"
            allow-clear
            :placeholder="t('logs.keywordPlaceholder')"
            @press-enter="search"
          />
        </a-form-item>
        <a-form-item :label="t('logs.actionType')">
          <a-select
            v-model="query.action"
            class="action-select"
            allow-clear
            :placeholder="t('logs.allActions')"
          >
            <a-option v-for="option in actionOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </a-option>
          </a-select>
        </a-form-item>
        <a-form-item :label="t('logs.dateRange')">
          <a-range-picker v-model="dateRange" value-format="YYYY-MM-DD" class="date-range" />
        </a-form-item>
        <a-form-item>
          <a-space>
            <a-button type="primary" @click="search">
              {{ t('review.query') }}
            </a-button>
            <a-button @click="resetSearch">
              {{ t('common.reset') }}
            </a-button>
          </a-space>
        </a-form-item>
      </a-form>
    </SectionCard>

    <BusinessTable
      :loading="loading"
      :columns="columns"
      :data="logs"
      :scroll="{ x: 1180 }"
      :pagination="pagination"
      :error="loadFailed ? t('logs.loadFailed') : null"
      :empty-title="t('logs.empty')"
      :empty-description="t('logs.unavailable')"
      :retry-label="t('common.retry')"
      row-key="id"
      class="settings-table"
      @retry="fetchLogs"
      @page-change="changePage"
    >
      <template #createdAt="{ record }">
        {{ formatDate(record.createdAt) }}
      </template>
      <template #user="{ record }">
        {{ userLabel(record) }}
      </template>
      <template #action="{ record }">
        {{ actionLabel(record.action) }}
      </template>
      <template #target="{ record }">
        <div class="target-cell">
          <span>{{ record.targetType || '—' }}</span>
          <code>{{ record.targetId || '—' }}</code>
        </div>
      </template>
      <template #result="{ record }">
        <StatusBadge
          domain="log"
          :status="record.result.toLowerCase()"
          :label="resultLabel(record.result)"
        />
      </template>
      <template #source="{ record }">
        <div class="source-cell">
          <span>{{ record.ipAddress || '—' }}</span>
          <span class="muted ellipsis-text" :title="record.userAgent || ''">
            {{ record.userAgent || t('logs.unknownSource') }}
          </span>
        </div>
      </template>
      <template #actions="{ record }">
        <a-button type="text" size="small" @click="openDetail(record)">
          {{ t('common.view') }}
        </a-button>
      </template>
    </BusinessTable>

    <BusinessDrawer
      v-model:visible="drawerVisible"
      :title="t('logs.detail')"
      :width="640"
      :footer="false"
    >
      <a-spin :loading="detailLoading" class="detail-spin">
        <template v-if="detail">
          <a-descriptions :column="1" bordered size="small">
            <a-descriptions-item :label="t('logs.columns.time')">
              {{
                formatDate(detail.createdAt)
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('logs.columns.user')">
              {{
                userLabel(detail)
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('logs.moduleType')">
              {{ detail.module }} / {{ actionLabel(detail.action) }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('logs.columns.target')">
              {{ detail.targetType }} / {{ detail.targetId }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('logs.columns.result')">
              <StatusBadge
                domain="log"
                :status="detail.result.toLowerCase()"
                :label="resultLabel(detail.result)"
              />
            </a-descriptions-item>
            <a-descriptions-item label="IP">
              {{ detail.ipAddress || '—' }}
            </a-descriptions-item>
            <a-descriptions-item label="User-Agent">
              {{
                detail.userAgent || '—'
              }}
            </a-descriptions-item>
            <a-descriptions-item label="Trace ID">
              {{ detail.traceId || '—' }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('logs.error')">
              {{
                redactText(detail.errorReason)
              }}
            </a-descriptions-item>
          </a-descriptions>

          <section class="change-block">
            <h3>{{ t('logs.before') }}</h3>
            <pre>{{ safeJson(detail.beforeData) }}</pre>
          </section>
          <section class="change-block">
            <h3>{{ t('logs.after') }}</h3>
            <pre>{{ safeJson(detail.afterData) }}</pre>
          </section>
        </template>
        <a-empty v-else-if="!detailLoading" :description="t('logs.detailUnavailable')" />
      </a-spin>
    </BusinessDrawer>
  </PageContainer>
</template>

<style scoped lang="scss">
.audit-page {
  min-width: 0;
}

.filter-card {
  margin-bottom: 12px;
}

.keyword-input {
  width: 240px;
}

.action-select {
  width: 150px;
}

.date-range {
  width: 260px;
}

.settings-table {
  background: var(--color-bg-2);
}

.target-cell,
.source-cell {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.target-cell code,
.muted {
  color: var(--color-text-3);
  font-size: 12px;
}

.ellipsis-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-spin {
  display: block;
  min-height: 160px;
}

.change-block {
  margin-top: 18px;
}

.change-block h3 {
  margin: 0 0 8px;
  color: var(--color-text-1);
  font-size: 14px;
}

.change-block pre {
  max-height: 280px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  border: 1px solid var(--color-border-2);
  border-radius: 6px;
  color: var(--color-text-2);
  background: var(--color-fill-1);
  font-family: Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

@media (max-width: 760px) {
  .keyword-input,
  .action-select,
  .date-range {
    width: 100%;
  }
}
</style>
