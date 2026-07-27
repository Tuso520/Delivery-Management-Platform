<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { TableColumnData } from '@arco-design/web-vue'
import Message from '@arco-design/web-vue/es/message'
import Modal from '@arco-design/web-vue/es/modal'
import { IconDelete, IconEdit, IconPlus } from '@arco-design/web-vue/es/icon'

import { usePermission } from '@/composables/usePermission'
import type { ProjectPaymentPlanItem } from '@/domains/project/types/project-payment'
import {
  formatMoneyString,
  isMoney,
  minorToMoney,
  moneyToMinor,
  normalizeMoneyInput,
  proportionalMoney,
  ratioPercent,
} from '@/utils/decimal-money'

const props = defineProps<{
  modelValue: ProjectPaymentPlanItem[]
  contractAmount?: string | null
  contractCurrency?: string | null
  baseCurrency?: string | null
  baseCurrencyLabel?: string | null
  convertedAmount?: string | null
  readonly?: boolean
  operateAllowed?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: ProjectPaymentPlanItem[]] }>()
const { hasPermission } = usePermission()
const canOperate = computed(
  () => !props.readonly && props.operateAllowed !== false && hasPermission('payment:operate'),
)
const selectedKeys = ref<string[]>([])
const visible = ref(false)
const editingIndex = ref<number | null>(null)
const form = reactive<ProjectPaymentPlanItem>({
  paymentName: '',
  dueDate: '',
  completed: false,
  receivedDate: null,
  originalAmount: '',
  remark: '',
})
const columns = computed<TableColumnData[]>(() => [
  { title: '付款项', dataIndex: 'paymentName', minWidth: 82 },
  { title: '付款日期', dataIndex: 'dueDate', slotName: 'dueDate', width: 170 },
  { title: '是否完成', dataIndex: 'completed', slotName: 'completed', width: 88 },
  { title: '付款比例', slotName: 'ratio', width: 96 },
  { title: '付款金额', slotName: 'originalAmount', width: 110 },
  {
    title: `折算${props.baseCurrencyLabel || '币种'}`,
    slotName: 'convertedAmount',
    width: 120,
  },
  { title: '付款条件', dataIndex: 'remark', slotName: 'remark', minWidth: 195 },
])
const keyedRows = computed(() =>
  props.modelValue.map((item, index) => ({ ...item, rowKey: item.id || `new-${index}` })),
)
const paymentTotalMinor = computed(() =>
  props.modelValue.reduce((total, item) => total + moneyToMinor(item.originalAmount), 0n),
)
const ratioTotal = computed(() =>
  props.contractAmount
    ? ratioPercent(minorToMoney(paymentTotalMinor.value), props.contractAmount)
    : '0.00%',
)
const ratioMatchesContract = computed(
  () => !props.contractAmount || paymentTotalMinor.value === moneyToMinor(props.contractAmount),
)

function ratio(item: ProjectPaymentPlanItem): string {
  if (!props.contractAmount) return '—'
  return ratioPercent(item.originalAmount, props.contractAmount)
}
function converted(item: ProjectPaymentPlanItem): string {
  if (!props.contractAmount || props.convertedAmount == null) {
    return props.baseCurrency && props.contractCurrency === props.baseCurrency
      ? formatMoneyString(item.originalAmount)
      : '—'
  }
  return formatMoneyString(
    proportionalMoney(item.originalAmount, props.contractAmount, props.convertedAmount),
  )
}
function selectedIndex(): number {
  const key = selectedKeys.value[0]
  return keyedRows.value.findIndex((item) => item.rowKey === key)
}
function openCreate(): void {
  editingIndex.value = null
  Object.assign(form, {
    id: undefined,
    paymentName: '',
    dueDate: '',
    completed: false,
    receivedDate: null,
    originalAmount: '',
    remark: '',
  })
  visible.value = true
}
function openEdit(): void {
  const index = selectedIndex()
  if (index < 0) {
    Message.warning('请选择一条款项计划')
    return
  }
  editingIndex.value = index
  Object.assign(form, props.modelValue[index])
  visible.value = true
}
function save(): boolean {
  if (!form.paymentName.trim()) {
    Message.warning('请输入付款项名称')
    return false
  }
  if (!isMoney(form.originalAmount)) {
    Message.warning('请输入有效付款金额，整数最多16位，小数最多2位')
    return false
  }
  if (moneyToMinor(form.originalAmount) <= 0n) {
    Message.warning('付款金额必须大于 0')
    return false
  }
  const next = props.modelValue.map((item) => ({ ...item }))
  const value = { ...form, paymentName: form.paymentName.trim(), remark: form.remark.trim() }
  if (editingIndex.value == null) next.push(value)
  else next.splice(editingIndex.value, 1, value)
  emit('update:modelValue', next)
  selectedKeys.value = []
  visible.value = false
  return true
}
function updateAmount(value: string): void {
  form.originalAmount = normalizeMoneyInput(value)
}
function updateCompleted(rowKey: string, completed: boolean): void {
  const index = keyedRows.value.findIndex((item) => item.rowKey === rowKey)
  if (index < 0 || !canOperate.value) return
  const next = props.modelValue.map((item) => ({ ...item }))
  next[index].completed = completed
  next[index].receivedDate = completed
    ? next[index].receivedDate || new Date().toISOString()
    : null
  emit('update:modelValue', next)
}
function remove(): void {
  const index = selectedIndex()
  if (index < 0) {
    Message.warning('请选择一条款项计划')
    return
  }
  const item = props.modelValue[index]
  Modal.confirm({
    title: '删除款项计划',
    content: `确定删除“${item.paymentName}”吗？`,
    okText: '删除',
    cancelText: '取消',
    okButtonProps: { status: 'danger' },
    onBeforeOk: (done) => {
      emit('update:modelValue', props.modelValue.filter((_, itemIndex) => itemIndex !== index))
      selectedKeys.value = []
      done(true)
    },
  })
}
</script>

<template>
  <section class="payment-plan" aria-labelledby="payment-plan-title">
    <div class="section-heading">
      <h3 id="payment-plan-title">
        款项计划
      </h3>
    </div>

    <div class="payment-toolbar">
      <div v-if="canOperate" class="payment-actions">
        <a-button type="primary" @click="remove">
          <template #icon>
            <IconDelete />
          </template>删除
        </a-button>
        <a-button type="primary" @click="openEdit">
          <template #icon>
            <IconEdit />
          </template>编辑
        </a-button>
        <a-button type="primary" @click="openCreate">
          <template #icon>
            <IconPlus />
          </template>添加
        </a-button>
      </div>
      <div v-else class="payment-actions-placeholder" />
      <slot name="project-progress" />
    </div>

    <div v-if="contractAmount && modelValue.length && !ratioMatchesContract" class="ratio-warning">
      当前款项比例合计 {{ ratioTotal }}，保存前必须调整为 100.00%。
    </div>

    <div class="payment-table-scroll">
      <a-table
        v-model:selected-keys="selectedKeys"
        :data="keyedRows"
        :columns="columns"
        :loading="loading"
        :row-selection="canOperate ? { type: 'radio', showCheckedAll: false } : undefined"
        row-key="rowKey"
        size="small"
        :pagination="false"
        :scroll="{ x: 877 }"
      >
        <template #dueDate="{ record }">
          {{ record.dueDate || '—' }}
        </template>
        <template #completed="{ record }">
          <a-checkbox
            :model-value="record.completed"
            :disabled="!canOperate"
            @change="updateCompleted(record.rowKey, Boolean($event))"
          />
        </template>
        <template #ratio="{ record }">
          {{ ratio(record) }}
        </template>
        <template #originalAmount="{ record }">
          {{ formatMoneyString(record.originalAmount) }}
        </template>
        <template #convertedAmount="{ record }">
          {{ converted(record) }}
        </template>
        <template #remark="{ record }">
          <a-tooltip :content="record.remark || '—'">
            <span class="payment-condition">{{ record.remark || '—' }}</span>
          </a-tooltip>
        </template>
        <template #empty>
          <a-empty description="暂无款项计划" />
        </template>
      </a-table>
    </div>
  </section>

  <a-modal
    v-model:visible="visible"
    :title="editingIndex == null ? '添加款项计划' : '编辑款项计划'"
    :width="576"
    ok-text="保存"
    cancel-text="取消"
    :on-before-ok="save"
  >
    <a-form :model="form" layout="vertical">
      <div class="payment-form-grid">
        <a-form-item label="付款项" required>
          <a-input v-model="form.paymentName" :max-length="200" />
        </a-form-item>
        <a-form-item label="付款日期">
          <a-date-picker v-model="form.dueDate" format="YYYY-MM-DD" />
        </a-form-item>
        <a-form-item label="付款金额" required>
          <a-input
            :model-value="form.originalAmount"
            placeholder="请输入付款金额"
            @input="updateAmount"
          />
        </a-form-item>
        <a-form-item label="是否完成">
          <a-checkbox v-model="form.completed">
            已完成
          </a-checkbox>
        </a-form-item>
        <a-form-item class="span-full" label="付款条件">
          <a-textarea v-model="form.remark" :max-length="500" />
        </a-form-item>
      </div>
    </a-form>
  </a-modal>
</template>

<style scoped>
.payment-plan { padding: 32px 24px 24px; }
.section-heading { height: 32px; border-bottom: 1px solid #e5e6eb; }
.section-heading h3 { margin: 0; color: #1d2129; font-size: 14px; font-weight: 600; line-height: 22px; }
.payment-toolbar { display: grid; grid-template-columns: minmax(262px, 331px) repeat(2, minmax(180px, 249px)); gap: 24px; align-items: end; padding-top: 12px; }
.payment-actions { display: flex; gap: 8px; }
.payment-actions :deep(.arco-btn) { height: 32px; padding: 0 16px; border-radius: 2px; }
.payment-actions-placeholder { min-height: 32px; }
.ratio-warning { margin-top: 10px; color: rgb(var(--warning-6)); font-size: 12px; }
.payment-table-scroll { width: 100%; margin-top: 12px; overflow-x: auto; }
.payment-plan :deep(.arco-table) { min-width: 877px; }
.payment-plan :deep(.arco-table-th) { height: 36px; padding: 0 16px; background: #f2f3f5; color: #1d2129; font-size: 14px; font-weight: 400; text-align: center; }
.payment-plan :deep(.arco-table-td) { height: 60px; padding: 0 16px; color: #1d2129; font-size: 14px; text-align: center; }
.payment-plan :deep(.arco-table-cell) { white-space: nowrap; }
.payment-condition { display: block; max-width: 100%; overflow: hidden; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.payment-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 20px; }
.payment-form-grid :deep(.arco-picker), .payment-form-grid :deep(.arco-input-number) { width: 100%; }
.span-full { grid-column: 1 / -1; }
@media (max-width: 640px) {
  .payment-toolbar { grid-template-columns: 1fr; }
  .payment-form-grid { grid-template-columns: 1fr; }
  .span-full { grid-column: auto; }
}
</style>
