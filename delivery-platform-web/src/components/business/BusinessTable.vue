<script setup lang="ts">
import {
  computed,
  Fragment,
  isVNode,
  ref,
  useAttrs,
  useSlots,
  watch,
  type Slots,
  type VNode,
  type VNodeChild,
} from 'vue'
import type { TableColumnData } from '@arco-design/web-vue'

import ErrorState from './ErrorState.vue'
import EmptyState from './EmptyState.vue'

defineOptions({ inheritAttrs: false })

interface PaginationState {
  page: number
  pageSize: number
  total: number
}

interface TableScroll {
  x?: string | number
  y?: string | number
  minWidth?: string | number
  maxHeight?: string | number
}

const props = withDefaults(
  defineProps<{
    data: readonly unknown[]
    loading?: boolean
    error?: string | Error | null
    emptyTitle?: string
    emptyDescription?: string
    retryLabel?: string
    rowKey?: string
    pagination?: PaginationState | null
    batchSize?: number
    bordered?: boolean
    stripe?: boolean
    defaultExpandAllRows?: boolean
    columns?: TableColumnData[]
    scroll?: TableScroll
    size?: 'mini' | 'small' | 'medium' | 'large'
    showHeader?: boolean
  }>(),
  {
    loading: false,
    error: null,
    emptyTitle: '',
    emptyDescription: '',
    retryLabel: '',
    rowKey: 'id',
    pagination: null,
    batchSize: 20,
    bordered: false,
    stripe: false,
    defaultExpandAllRows: false,
    columns: () => [],
    scroll: () => ({ x: 'max-content' }),
    size: 'medium',
    showHeader: true,
  },
)

const emit = defineEmits<{
  retry: []
  pageChange: [page: number]
}>()

const attrs = useAttrs()
const slots = useSlots()
const visibleCount = ref(props.batchSize)
const accumulatedData = ref<Array<Record<string, unknown>>>([])
const requestedPage = ref(0)
const remoteExhausted = ref(false)
const sourceData = computed(() => props.data as Array<Record<string, unknown>>)
const tableData = computed(() =>
  props.pagination ? accumulatedData.value : sourceData.value.slice(0, visibleCount.value),
)
const hasMore = computed(() =>
  props.pagination
    ? !remoteExhausted.value && accumulatedData.value.length < props.pagination.total
    : visibleCount.value < sourceData.value.length,
)
const forwardedSlotNames = computed(() =>
  Object.keys(slots).filter((name) => name !== 'default' && name !== 'columns' && name !== 'empty'),
)
const resolvedColumns = computed(() =>
  props.columns.length > 0
    ? props.columns
    : extractDeclarativeColumns(slots.default?.() ?? slots.columns?.()),
)
const errorMessage = computed(() =>
  props.error instanceof Error ? props.error.message : props.error || '',
)

watch(
  [sourceData, () => props.pagination?.page, () => props.rowKey],
  ([rows, page, rowKey]) => {
    if (!props.pagination) {
      visibleCount.value = props.batchSize
      return
    }

    if (!page || page <= 1) {
      accumulatedData.value = [...rows]
      requestedPage.value = 0
      remoteExhausted.value = rows.length < props.pagination.pageSize
      return
    }

    const merged = new Map<unknown, Record<string, unknown>>()
    for (const row of accumulatedData.value) merged.set(row[rowKey], row)
    for (const row of rows) merged.set(row[rowKey], row)
    accumulatedData.value = [...merged.values()]
    requestedPage.value = 0
    remoteExhausted.value =
      rows.length < props.pagination.pageSize ||
      accumulatedData.value.length >= props.pagination.total
  },
  { immediate: true },
)

function loadNextBatch(): void {
  if (props.loading || !hasMore.value) return

  if (!props.pagination) {
    visibleCount.value = Math.min(visibleCount.value + props.batchSize, sourceData.value.length)
    return
  }

  const nextPage = props.pagination.page + 1
  if (requestedPage.value === nextPage) return
  requestedPage.value = nextPage
  emit('pageChange', nextPage)
}

function handleViewportScroll(event: Event): void {
  const viewport = event.target as HTMLElement
  const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
  if (remaining <= 120) loadNextBatch()
}

function flattenVNodes(value: VNodeChild | undefined): VNode[] {
  if (value == null || typeof value === 'boolean') return []
  if (Array.isArray(value)) return value.flatMap((child) => flattenVNodes(child))
  if (!isVNode(value)) return []
  if (value.type === Fragment) return flattenVNodes(value.children as VNodeChild)
  return [value]
}

function isTableColumnVNode(vnode: VNode): boolean {
  const componentType = vnode.type
  return (
    typeof componentType === 'object' &&
    componentType !== null &&
    'name' in componentType &&
    componentType.name === 'TableColumn'
  )
}

function extractDeclarativeColumns(value: VNodeChild | undefined): TableColumnData[] {
  return flattenVNodes(value)
    .filter(isTableColumnVNode)
    .map((vnode) => {
      const columnProps = Object.fromEntries(
        Object.entries(vnode.props ?? {}).map(([key, propValue]) => [
          key.replace(/-([a-z])/gu, (_match, character: string) => character.toUpperCase()),
          propValue,
        ]),
      )
      const columnSlots =
        vnode.children && typeof vnode.children === 'object' && !Array.isArray(vnode.children)
          ? (vnode.children as Slots)
          : undefined
      const nestedColumns = columnSlots?.default
        ? extractDeclarativeColumns(columnSlots.default())
        : []
      return {
        ...columnProps,
        ...(columnSlots ? { slots: columnSlots } : {}),
        ...(nestedColumns.length > 0 ? { children: nestedColumns } : {}),
      } as TableColumnData
    })
}
</script>

<template>
  <ErrorState
    v-if="error"
    :title="errorMessage"
    :retry-label="retryLabel"
    @retry="emit('retry')"
  />
  <div v-else class="business-table">
    <div class="business-table__viewport" @scroll.passive.capture="handleViewportScroll">
      <a-table
        v-bind="attrs"
        :data="tableData"
        :loading="loading"
        :row-key="rowKey"
        :pagination="false"
        :columns="resolvedColumns"
        :scroll="scroll"
        :size="size"
        :show-header="showHeader"
        :bordered="bordered"
        :stripe="stripe"
        :default-expand-all-rows="defaultExpandAllRows"
      >
        <template v-for="slotName in forwardedSlotNames" #[slotName]="slotProps">
          <slot :name="slotName" v-bind="slotProps" />
        </template>
        <template #empty>
          <slot name="empty">
            <EmptyState :title="emptyTitle" :description="emptyDescription" />
          </slot>
        </template>
      </a-table>
      <div v-if="loading && tableData.length > 0" class="business-table__loading-more">
        <a-spin :size="18" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.business-table {
  display: flex;
  min-height: 0;
  min-width: 0;
  flex-direction: column;
}

.business-table__viewport {
  min-height: 0;
  max-height: calc(100vh - 240px);
  flex: 1;
  overflow: auto;
}

.business-table__loading-more {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
}
</style>
