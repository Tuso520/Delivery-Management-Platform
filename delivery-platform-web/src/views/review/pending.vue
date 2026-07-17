<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import { BusinessTable } from '@/components/business'
import {
  useReviewDetailQuery,
  useReviewHistoryQuery,
  useReviewListQuery,
  useReviewSummaryQuery,
} from '@/composables/queries/useContentQueries'
import { useFilePreview } from '@/composables/useFilePreview'
import { firstRouteParam } from '@/router/query-state'
import { useUserStore } from '@/store/user'
import { useLocaleStore } from '@/store/locale'
import type { QueryReviewTaskParams, ReviewTask, ReviewTaskStatus } from '@/types/review'
import { REVIEW_TASK_STATUSES } from '@/types/review'

import ReviewDialog from './components/ReviewDialog.vue'
import {
  REVIEW_ASSIGNEE_STATUS_META,
  REVIEW_MODE_LABELS,
  REVIEW_SOURCE_LABELS,
  REVIEW_STATUS_META,
  REVIEW_STEP_STATUS_META,
  canActOnReviewTask,
  reviewActionLabel,
  reviewFileName,
  reviewProgressLabel,
  reviewSourceLabel,
  reviewTaskStatusMeta,
  reviewVersionLabel,
} from './review-presenter'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const filePreview = useFilePreview()
const localeStore = useLocaleStore()
const { t } = useI18n()
const translate = (key: string): string => t(key)

const queryParams = computed<QueryReviewTaskParams>(() => currentQuery())
const reviewSummaryQuery = useReviewSummaryQuery()
const reviewListQuery = useReviewListQuery(queryParams)
const selectedDetailTaskId = ref('')
const detailFallback = ref<ReviewTask | null>(null)
const reviewDetailQuery = useReviewDetailQuery(selectedDetailTaskId)
const reviewHistoryQuery = useReviewHistoryQuery(selectedDetailTaskId)
const summary = computed(
  () =>
    reviewSummaryQuery.data.value ?? {
      myPending: 0,
      allPending: 0,
      todayAdded: 0,
      overdue: 0,
    },
)
const summaryLoading = computed(() => reviewSummaryQuery.isFetching.value)
const summaryError = computed(() => reviewSummaryQuery.isError.value)
const summaryCards = computed(() => [
  { key: 'myPending', label: t('review.summary.myPending'), value: summary.value.myPending },
  { key: 'allPending', label: t('review.summary.allPending'), value: summary.value.allPending },
  { key: 'todayAdded', label: t('review.summary.todayAdded'), value: summary.value.todayAdded },
  { key: 'overdue', label: t('review.summary.overdue'), value: summary.value.overdue },
])

const listLoading = computed(() => reviewListQuery.isFetching.value)
const listError = computed(() => reviewListQuery.isError.value)
const reviewList = computed(() => reviewListQuery.data.value?.items ?? [])
const pagination = computed(() => ({
  page: reviewListQuery.data.value?.page ?? queryParams.value.page,
  pageSize: reviewListQuery.data.value?.pageSize ?? queryParams.value.pageSize,
  total: reviewListQuery.data.value?.total ?? 0,
}))
const filterForm = reactive<{ keyword: string; status: ReviewTaskStatus | '' }>({
  keyword: '',
  status: '',
})
const detailVisible = ref(false)
const detailLoading = computed(
  () => reviewDetailQuery.isFetching.value || reviewHistoryQuery.isFetching.value,
)
const detailError = computed(
  () => reviewDetailQuery.isError.value || reviewHistoryQuery.isError.value,
)
const detailTask = computed(() => reviewDetailQuery.data.value ?? detailFallback.value)
const detailHistory = computed(() => reviewHistoryQuery.data.value ?? [])

const reviewDialogVisible = ref(false)
const selectedReviewTask = ref<ReviewTask | null>(null)

const currentUserId = computed(() => userStore.userInfo?.id)
const currentPermissions = computed(() => userStore.userInfo?.permissions ?? [])
const currentRoles = computed(() => userStore.userInfo?.roles ?? [])
const detailCanAct = computed(() =>
  detailTask.value
    ? canActOnReviewTask(
        detailTask.value,
        currentUserId.value,
        currentPermissions.value,
        currentRoles.value,
      )
    : false,
)

function queryString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(queryString(value))
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function reviewStatus(value: unknown): ReviewTaskStatus | undefined {
  const candidate = queryString(value)
  return (REVIEW_TASK_STATUSES as readonly string[]).includes(candidate)
    ? (candidate as ReviewTaskStatus)
    : undefined
}

function currentQuery(): QueryReviewTaskParams {
  const keyword = queryString(route.query.keyword).trim()
  return {
    page: positiveInteger(route.query.page, 1),
    pageSize: positiveInteger(route.query.pageSize, 20),
    ...(keyword ? { keyword } : {}),
    ...(reviewStatus(route.query.status) ? { status: reviewStatus(route.query.status) } : {}),
  }
}

function reviewListRouteQuery(params: QueryReviewTaskParams = currentQuery()) {
  return {
    ...(params.keyword?.trim() ? { keyword: params.keyword.trim() } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.page !== 1 ? { page: String(params.page) } : {}),
    ...(params.pageSize !== 20 ? { pageSize: String(params.pageSize) } : {}),
  }
}

async function fetchReviews(params: QueryReviewTaskParams): Promise<void> {
  if (JSON.stringify(params) === JSON.stringify(currentQuery())) {
    await reviewListQuery.refetch()
  }
}

async function updateQuery(update: Partial<QueryReviewTaskParams>): Promise<void> {
  const next = { ...currentQuery(), ...update }
  const query = reviewListRouteQuery(next)
  const target = router.resolve({ path: route.path, query })
  if (target.fullPath === route.fullPath) {
    await fetchReviews(next)
    return
  }
  await router.replace({ path: route.path, query })
}

function handleSearch(): void {
  void updateQuery({ keyword: filterForm.keyword, page: 1 })
}

function handleStatusChange(value: unknown): void {
  filterForm.status = reviewStatus(value) ?? ''
  void updateQuery({ status: filterForm.status || undefined, page: 1 })
}

function handlePageChange(page: number): void {
  void updateQuery({ page })
}

function canAct(task: ReviewTask): boolean {
  return canActOnReviewTask(task, currentUserId.value, currentPermissions.value, currentRoles.value)
}

function openPreview(task: ReviewTask): void {
  const fileVersionId = task.fileVersion?.id
  if (!fileVersionId) {
    Message.info(t('review.noPreview'))
    return
  }
  filePreview.openPreview({
    id: fileVersionId,
    title: reviewFileName(task),
  })
}

async function loadDetail(taskId: string): Promise<void> {
  const isCurrent = selectedDetailTaskId.value === taskId
  selectedDetailTaskId.value = taskId
  if (isCurrent) {
    await Promise.allSettled([reviewDetailQuery.refetch(), reviewHistoryQuery.refetch()])
  }
}

function openDetail(task: ReviewTask): void {
  detailFallback.value = task
  void router.push({
    name: 'ReviewDetail',
    params: { taskId: task.id },
    query: reviewListRouteQuery(),
  })
}

function closeDetail(): void {
  detailVisible.value = false
  selectedDetailTaskId.value = ''
  detailFallback.value = null
  void router.push({ name: 'Review', query: reviewListRouteQuery() })
}

function handleDetailVisibility(visible: boolean): void {
  if (!visible) closeDetail()
}

async function syncRouteIntent(): Promise<void> {
  const taskId = firstRouteParam(route.params.taskId)
  if (!taskId) {
    detailVisible.value = false
    selectedDetailTaskId.value = ''
    detailFallback.value = null
    return
  }

  detailVisible.value = true
  await loadDetail(taskId)
}

function openReviewDialog(task: ReviewTask): void {
  if (!canAct(task)) {
    Message.warning(t('review.cannotAct'))
    return
  }
  selectedReviewTask.value = task
  reviewDialogVisible.value = true
}

async function handleReviewComplete(): Promise<void> {
  reviewDialogVisible.value = false
  selectedReviewTask.value = null
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(localeStore.currentLocale, { hour12: false })
}

function formatFileSize(value?: number | string): string {
  const size = Number(value)
  if (!Number.isFinite(size) || size < 0) return '—'
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`
  return `${(size / 1024 ** 3).toFixed(1)} GB`
}

watch(
  () => route.fullPath,
  () => {
    const query = currentQuery()
    filterForm.keyword = query.keyword ?? ''
    filterForm.status = query.status ?? ''
    void syncRouteIntent()
  },
  { immediate: true },
)
</script>

<template>
  <div class="review-page">
    <section class="summary-grid" :aria-label="t('review.summaryAria')" :aria-busy="summaryLoading">
      <div v-for="card in summaryCards" :key="card.key" class="summary-card">
        <span class="summary-label">{{ card.label }}</span>
        <a-skeleton v-if="summaryLoading" :animation="true">
          <a-skeleton-line :rows="1" :widths="['48px']" />
        </a-skeleton>
        <strong v-else class="summary-value">{{ card.value }}</strong>
      </div>
    </section>

    <a-alert v-if="summaryError" type="warning" closable>
      {{ t('review.summaryLoadFailed') }}
    </a-alert>

    <a-card class="filter-card" :bordered="false">
      <a-form
        :model="filterForm"
        layout="inline"
        class="review-filter"
        @submit.prevent="handleSearch"
      >
        <a-form-item field="keyword" :label="t('review.keyword')">
          <a-space>
            <a-input
              v-model="filterForm.keyword"
              :placeholder="t('review.keywordPlaceholder')"
              allow-clear
              class="keyword-input"
              @press-enter="handleSearch"
              @clear="handleSearch"
            />
            <a-button type="primary" @click="handleSearch">
              {{ t('review.query') }}
            </a-button>
          </a-space>
        </a-form-item>
        <a-form-item field="status" :label="t('review.reviewStatus')">
          <a-select
            :model-value="filterForm.status || undefined"
            :placeholder="t('review.allStatuses')"
            allow-clear
            class="status-select"
            @change="handleStatusChange"
            @clear="handleStatusChange(undefined)"
          >
            <a-option
              v-for="status in REVIEW_TASK_STATUSES"
              :key="status"
              :value="status"
              :label="t(REVIEW_STATUS_META[status].label)"
            />
          </a-select>
        </a-form-item>
      </a-form>
    </a-card>

    <a-card class="table-card" :bordered="false">
      <a-result v-if="listError && !listLoading" status="error" :title="t('review.listLoadFailed')">
        <template #subtitle>
          {{ t('review.retryHint') }}
        </template>
        <template #extra>
          <a-button type="primary" @click="fetchReviews(currentQuery())">
            {{ t('common.retry') }}
          </a-button>
        </template>
      </a-result>

      <template v-else>
        <BusinessTable
          :loading="listLoading"
          :data="reviewList"
          :pagination="pagination"
          row-key="id"
          bordered
          stripe
          :scroll="{ x: 1420 }"
          class="review-table"
          @page-change="handlePageChange"
        >
          <template #empty>
            <a-empty :description="t('review.empty')" />
          </template>

          <a-table-column :title="t('review.columns.fileName')" :width="230" fixed="left">
            <template #cell="{ record: row }">
              <button type="button" class="file-name-button" @click="openDetail(row)">
                <span>{{ reviewFileName(row) }}</span>
                <small>{{ row.title }}</small>
              </button>
            </template>
          </a-table-column>
          <a-table-column :title="t('review.columns.version')" :width="80" align="center">
            <template #cell="{ record: row }">
              {{ reviewVersionLabel(row) }}
            </template>
          </a-table-column>
          <a-table-column :title="t('review.columns.source')" :width="100" align="center">
            <template #cell="{ record: row }">
              <a-tag size="small">
                {{ reviewSourceLabel(row, translate) }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column
            :title="t('review.columns.location')"
            :width="230"
            ellipsis
            tooltip
          >
            <template #cell="{ record: row }">
              {{ row.locationLabel || '—' }}
            </template>
          </a-table-column>
          <a-table-column :title="t('review.columns.uploader')" :width="112">
            <template #cell="{ record: row }">
              {{ row.submitter.realName }}
            </template>
          </a-table-column>
          <a-table-column :title="t('review.columns.progress')" :width="110" align="center">
            <template #cell="{ record: row }">
              <span class="progress-label">{{ reviewProgressLabel(row, translate) }}</span>
            </template>
          </a-table-column>
          <a-table-column :title="t('review.columns.submittedAt')" :width="168">
            <template #cell="{ record: row }">
              {{ formatDateTime(row.submittedAt) }}
            </template>
          </a-table-column>
          <a-table-column :title="t('common.status')" :width="100" align="center">
            <template #cell="{ record: row }">
              <a-tag :color="reviewTaskStatusMeta(row).color" size="small">
                {{ t(reviewTaskStatusMeta(row).label) }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column
            :title="t('common.action')"
            :width="150"
            fixed="right"
            align="center"
          >
            <template #cell="{ record: row }">
              <a-space size="mini" :wrap="false">
                <a-button
                  type="text"
                  size="mini"
                  :disabled="!row.fileVersion"
                  @click="openPreview(row)"
                >
                  {{ t('review.preview') }}
                </a-button>
                <a-button
                  v-if="canAct(row)"
                  type="primary"
                  size="mini"
                  @click="openReviewDialog(row)"
                >
                  {{ t('review.act') }}
                </a-button>
              </a-space>
            </template>
          </a-table-column>
        </BusinessTable>
      </template>
    </a-card>

    <a-drawer
      :visible="detailVisible"
      :title="t('review.detailTitle')"
      :width="720"
      :footer="false"
      :unmount-on-close="true"
      class="review-detail-drawer"
      @update:visible="handleDetailVisibility"
    >
      <div v-if="detailLoading && !detailTask" class="drawer-loading">
        <a-spin :tip="t('review.detailLoading')" />
      </div>

      <a-result v-else-if="detailError" status="error" :title="t('review.detailLoadFailed')">
        <template #extra>
          <a-button v-if="detailTask" type="primary" @click="loadDetail(detailTask.id)">
            {{ t('common.retry') }}
          </a-button>
        </template>
      </a-result>

      <div v-else-if="detailTask" class="drawer-content" :aria-busy="detailLoading">
        <div class="drawer-toolbar">
          <a-space>
            <a-button :disabled="!detailTask.fileVersion" @click="openPreview(detailTask)">
              {{ t('review.previewFile') }}
            </a-button>
            <a-button v-if="detailCanAct" type="primary" @click="openReviewDialog(detailTask)">
              {{ t('review.processReview') }}
            </a-button>
          </a-space>
          <a-spin v-if="detailLoading" :size="16" />
        </div>

        <section class="drawer-section" aria-labelledby="review-basic-title">
          <h3 id="review-basic-title">
            {{ t('review.taskInfo') }}
          </h3>
          <a-descriptions :column="2" bordered size="small">
            <a-descriptions-item :label="t('review.dialog.fileName')" :span="2">
              {{ reviewFileName(detailTask) }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('review.columns.version')">
              {{ reviewVersionLabel(detailTask) }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('review.columns.source')">
              {{ t(REVIEW_SOURCE_LABELS[detailTask.sourceType]) }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('review.columns.location')" :span="2">
              {{ detailTask.locationLabel || '—' }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('review.columns.uploader')">
              {{ detailTask.submitter.realName }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('review.columns.submittedAt')">
              {{ formatDateTime(detailTask.submittedAt) }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('review.reviewMode')">
              {{ t(REVIEW_MODE_LABELS[detailTask.reviewMode]) }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('review.taskStatus')">
              <a-tag :color="REVIEW_STATUS_META[detailTask.status].color" size="small">
                {{ t(REVIEW_STATUS_META[detailTask.status].label) }}
              </a-tag>
            </a-descriptions-item>
            <a-descriptions-item :label="t('review.dueAt')">
              {{ formatDateTime(detailTask.dueAt) }}
            </a-descriptions-item>
            <a-descriptions-item :label="t('review.completedAt')">
              {{ formatDateTime(detailTask.completedAt) }}
            </a-descriptions-item>
            <a-descriptions-item
              v-if="detailTask.fileVersion"
              :label="t('review.fileSize')"
              :span="2"
            >
              {{ formatFileSize(detailTask.fileVersion.asset.size) }}
              · {{ detailTask.fileVersion.asset.mimeType }}
            </a-descriptions-item>
          </a-descriptions>
        </section>

        <section class="drawer-section" aria-labelledby="review-steps-title">
          <h3 id="review-steps-title">
            {{ t('review.steps') }}
          </h3>
          <div class="step-list">
            <article
              v-for="step in detailTask.steps"
              :key="step.id"
              class="step-item"
              :class="{ active: step.status === 'ACTIVE' }"
            >
              <div class="step-header">
                <div>
                  <strong>{{ t('review.step', { step: step.stepNo }) }}</strong>
                  <span>{{ t(REVIEW_MODE_LABELS[step.mode]) }} ·
                    {{ t('review.requiredApprovals', { count: step.requiredCount }) }}</span>
                </div>
                <a-tag :color="REVIEW_STEP_STATUS_META[step.status].color" size="small">
                  {{ t(REVIEW_STEP_STATUS_META[step.status].label) }}
                </a-tag>
              </div>
              <div class="assignee-list">
                <div v-for="assignee in step.assignees" :key="assignee.id" class="assignee-item">
                  <div class="assignee-heading">
                    <span>{{ assignee.assignee.realName }}</span>
                    <a-tag :color="REVIEW_ASSIGNEE_STATUS_META[assignee.status].color" size="small">
                      {{ t(REVIEW_ASSIGNEE_STATUS_META[assignee.status].label) }}
                    </a-tag>
                  </div>
                  <p v-if="assignee.comment">
                    {{ assignee.comment }}
                  </p>
                  <small v-if="assignee.actedAt">{{
                    t('review.actedAt', { time: formatDateTime(assignee.actedAt) })
                  }}</small>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section class="drawer-section" aria-labelledby="review-history-title">
          <h3 id="review-history-title">
            {{ t('review.history') }}
          </h3>
          <a-timeline v-if="detailHistory.length">
            <a-timeline-item v-for="event in detailHistory" :key="event.id">
              <div class="history-item">
                <div class="history-heading">
                  <strong>{{ reviewActionLabel(event, translate) }}</strong>
                  <span>{{ formatDateTime(event.createdAt) }}</span>
                </div>
                <p>
                  {{ event.actor.realName
                  }}<span v-if="event.stepNo">
                    · {{ t('review.step', { step: event.stepNo }) }}</span>
                </p>
                <blockquote v-if="event.comment">
                  {{ event.comment }}
                </blockquote>
              </div>
            </a-timeline-item>
          </a-timeline>
          <a-empty v-else :description="t('review.emptyHistory')" />
        </section>
      </div>
    </a-drawer>

    <ReviewDialog
      v-if="selectedReviewTask"
      v-model:visible="reviewDialogVisible"
      :task-id="selectedReviewTask.id"
      :file-name="reviewFileName(selectedReviewTask)"
      :current-step-no="selectedReviewTask.currentStepNo"
      :total-steps="selectedReviewTask.totalSteps"
      @review-complete="handleReviewComplete"
    />
  </div>
</template>

<style scoped lang="scss">
.review-page {
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.summary-card {
  min-width: 0;
  min-height: 66px;
  padding: 11px 14px;
  border: 1px solid var(--color-border-2);
  border-radius: 2px;
  background: var(--color-bg-2);
}

.summary-label {
  display: block;
  color: var(--color-text-2);
  font-size: 12px;
}

.summary-value {
  display: block;
  margin-top: 4px;
  color: var(--color-text-1);
  font-size: 22px;
  line-height: 1.15;
}

.filter-card,
.table-card {
  border-radius: 0;
}

.filter-card :deep(.arco-card-body) {
  padding: 8px;
}

.review-filter {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.review-filter :deep(.arco-form-item) {
  margin: 0;
}

.keyword-input {
  width: min(520px, 52vw);
}

.status-select {
  width: 180px;
}

.table-card {
  flex: 1;
  min-height: 0;
}

.table-card :deep(.arco-card-body) {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px;
}

.review-table {
  flex: 1;
  min-height: 0;
  border-radius: 0;
}

.review-table :deep(.arco-table-th),
.review-table :deep(.arco-table-cell) {
  padding: 7px 9px;
  font-size: 12px;
  line-height: 1.4;
}

.file-name-button {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--primary-6));
  text-align: left;
  cursor: pointer;
}

.file-name-button:focus-visible {
  outline: 2px solid rgb(var(--primary-6));
  outline-offset: 2px;
}

.file-name-button span,
.file-name-button small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-name-button small {
  margin-top: 2px;
  color: var(--color-text-3);
  font-size: 11px;
}

.progress-label {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.drawer-loading {
  min-height: 240px;
  display: grid;
  place-items: center;
}

.drawer-content {
  display: grid;
  gap: 20px;
}

.drawer-toolbar {
  position: sticky;
  z-index: 2;
  top: -16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border-2);
  background: var(--color-bg-2);
}

.drawer-section h3 {
  margin: 0 0 10px;
  color: var(--color-text-1);
  font-size: 14px;
}

.step-list {
  display: grid;
  gap: 8px;
}

.step-item {
  padding: 12px;
  border: 1px solid var(--color-border-2);
  border-radius: 2px;
  background: var(--color-fill-1);
}

.step-item.active {
  border-color: rgb(var(--primary-6));
  background: var(--color-primary-light-1);
}

.step-header,
.assignee-heading,
.history-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.step-header > div {
  display: grid;
  gap: 2px;
}

.step-header span,
.assignee-item small,
.history-heading span {
  color: var(--color-text-3);
  font-size: 12px;
}

.assignee-list {
  display: grid;
  gap: 6px;
  margin-top: 10px;
}

.assignee-item {
  padding: 8px;
  border-top: 1px solid var(--color-border-1);
}

.assignee-item p,
.history-item p {
  margin: 5px 0 0;
  color: var(--color-text-2);
}

.history-item blockquote {
  margin: 6px 0 0;
  padding: 7px 9px;
  border-left: 2px solid var(--color-border-3);
  background: var(--color-fill-2);
  color: var(--color-text-2);
}

@media (max-width: 900px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .review-filter {
    flex-wrap: wrap;
  }

  .review-filter :deep(.arco-form-item) {
    width: 100%;
  }

  .keyword-input,
  .status-select {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .file-name-button {
    scroll-behavior: auto;
  }
}
</style>
