<script setup lang="ts">
import {
  computed,
  Fragment,
  isVNode,
  useAttrs,
  useSlots,
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
    pageSizeOptions?: number[]
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
    pageSizeOptions: () => [10, 20, 50, 100],
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
  pageSizeChange: [pageSize: number]
}>()

const attrs = useAttrs()
const slots = useSlots()
const tableData = computed(() => props.data as Array<Record<string, unknown>>)
const forwardedSlotNames = computed(() =>
  Object.keys(slots).filter(
    (name) => name !== 'default' && name !== 'columns' && name !== 'empty',
  ),
)
const resolvedColumns = computed(() =>
  props.columns.length > 0
    ? props.columns
    : extractDeclarativeColumns(slots.default?.() ?? slots.columns?.()),
)
const errorMessage = computed(() =>
  props.error instanceof Error ? props.error.message : props.error || '',
)

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
    <div v-if="pagination" class="business-table__pagination">
      <a-pagination
        :current="pagination.page"
        :page-size="pagination.pageSize"
        :page-size-options="pageSizeOptions"
        :total="pagination.total"
        show-total
        show-page-size
        show-jumper
        @change="emit('pageChange', $event)"
        @page-size-change="emit('pageSizeChange', $event)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.business-table {
  min-width: 0;
}

.business-table__pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
  overflow-x: auto;
}
</style>
