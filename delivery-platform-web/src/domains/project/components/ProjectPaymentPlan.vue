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
  isPercent,
  isMoney,
  moneyFromPercent,
  minorToMoney,
  moneyToMinor,
  normalizeMoneyInput,
  normalizePercentInput,
  percentValue,
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
type PaymentPlanForm = ProjectPaymentPlanItem & { paymentRatio: string }
type LastEditedField = 'amount' | 'ratio' | null

const lastEditedField = ref<LastEditedField>(null)
const form = reactive<PaymentPlanForm>({
  paymentName: '',
  dueDate: '',
  completed: false,
  receivedDate: null,
  originalAmount: '',
  paymentRatio: '',
  remark: '',
})
const columns = computed<TableColumnData[]>(() => [
  { title: '付款项', dataIndex: 'paymentName', align: 'center' },
  { title: '付款日期', dataIndex: 'dueDate', slotName: 'dueDate', align: 'center' },
  { title: '是否完成', dataIndex: 'completed', slotName: 'completed', align: 'center' },
  { title: '付款比例', slotName: 'ratio', align: 'center' },
  { title: '付款金额', slotName: 'originalAmount', align: 'center' },
  {
    title: `折算${props.baseCurrencyLabel || '币种'}`,
    slotName: 'convertedAmount',
    align: 'center',
  },
  { title: '付款条件', dataIndex: 'remark', slotName: 'remark', align: 'center' },
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
function convertedValue(item: ProjectPaymentPlanItem): string {
  if (!props.contractAmount || props.convertedAmount == null) {
    return props.baseCurrency && props.contractCurrency === props.baseCurrency
      ? item.originalAmount
      : ''
  }
  return proportionalMoney(item.originalAmount, props.contractAmount, props.convertedAmount) ?? ''
}
function converted(item: ProjectPaymentPlanItem): string {
  const value = convertedValue(item)
  return value ? formatMoneyString(value) : '—'
}
function selectedIndex(): number {
  const key = selectedKeys.value[0]
  return keyedRows.value.findIndex((item) => item.rowKey === key)
}
function openCreate(): void {
  editingIndex.value = null
  lastEditedField.value = null
  Object.assign(form, {
    id: undefined,
    paymentName: '',
    dueDate: '',
    completed: false,
    receivedDate: null,
    originalAmount: '',
    paymentRatio: '',
    receivedOriginalAmount: '',
    receivedConvertedAmount: '',
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
  lastEditedField.value = 'amount'
  Object.assign(form, props.modelValue[index], {
    paymentRatio: percentValue(props.modelValue[index].originalAmount, props.contractAmount || '') ?? '',
  })
  visible.value = true
}
function save(): boolean {
  if (!form.paymentName.trim()) {
    Message.warning('请输入付款项名称')
    return false
  }
  if (form.paymentRatio && !isPercent(form.paymentRatio)) {
    Message.warning('请输入 0 至 100 之间的付款比例，最多保留两位小数')
    return false
  }
  if (form.paymentRatio && Number(form.paymentRatio) <= 0) {
    Message.warning('付款比例必须大于 0')
    return false
  }
  if (
    lastEditedField.value === 'ratio' &&
    (!props.contractAmount || moneyToMinor(props.contractAmount) === 0n)
  ) {
    Message.warning('请先输入大于 0 的合同金额，再按付款比例计算付款金额')
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
  if (
    props.contractAmount &&
    moneyToMinor(props.contractAmount) > 0n &&
    moneyToMinor(form.originalAmount) > moneyToMinor(props.contractAmount)
  ) {
    Message.warning('付款金额不能超过合同金额')
    return false
  }
  const next = props.modelValue.map((item) => ({ ...item }))
  const value: ProjectPaymentPlanItem = {
    id: form.id,
    paymentName: form.paymentName.trim(),
    dueDate: form.dueDate,
    completed: form.completed,
    originalAmount: form.originalAmount,
    remark: form.remark.trim(),
    receivedDate: form.completed ? form.receivedDate || new Date().toISOString() : null,
    receivedOriginalAmount: form.completed ? form.receivedOriginalAmount || form.originalAmount : '0',
    receivedConvertedAmount: form.completed
      ? form.receivedConvertedAmount || convertedValue(form)
      : '0',
  }
  if (editingIndex.value == null) next.push(value)
  else next.splice(editingIndex.value, 1, value)
  emit('update:modelValue', next)
  selectedKeys.value = []
  visible.value = false
  return true
}
function updateAmount(value: string): void {
  lastEditedField.value = 'amount'
  form.originalAmount = normalizeMoneyInput(value)
  const calculatedRatio = percentValue(form.originalAmount, props.contractAmount || '')
  if (calculatedRatio !== undefined) form.paymentRatio = calculatedRatio
}
function updateRatio(value: string): void {
  lastEditedField.value = 'ratio'
  form.paymentRatio = normalizePercentInput(value)
  const calculatedAmount = moneyFromPercent(form.paymentRatio, props.contractAmount || '')
  if (calculatedAmount !== undefined) form.originalAmount = calculatedAmount
}
function updateCompleted(rowKey: string, completed: boolean): void {
  const index = keyedRows.value.findIndex((item) => item.rowKey === rowKey)
  if (index < 0 || !canOperate.value) return
  const next = props.modelValue.map((item) => ({ ...item }))
  next[index].completed = completed
  next[index].receivedDate = completed
    ? next[index].receivedDate || new Date().toISOString()
    : null
  next[index].receivedOriginalAmount = completed ? next[index].originalAmount : '0'
  next[index].receivedConvertedAmount = completed ? convertedValue(next[index]) : '0'
  emit('update:modelValue', next)
}
function updateDueDate(rowKey: string, dueDate: string): void {
  const index = keyedRows.value.findIndex((item) => item.rowKey === rowKey)
  if (index < 0 || !canOperate.value) return
  const next = props.modelValue.map((item) => ({ ...item }))
  next[index].dueDate = dueDate ? dueDate.slice(0, 10) : ''
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
      <span
        v-if="contractAmount && modelValue.length && !ratioMatchesContract"
        class="ratio-warning"
      >
        当前款项比例合计 {{ ratioTotal }}，保存前必须调整为 100.00%。
      </span>
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
    </div>

    <div class="payment-table-scroll">
      <a-table
        v-model:selected-keys="selectedKeys"
        :data="keyedRows"
        :columns="columns"
        :loading="loading"
        :bordered="{ wrapper: true, cell: true }"
        :row-selection="canOperate ? { type: 'radio', showCheckedAll: false } : undefined"
        row-key="rowKey"
        size="small"
        :pagination="false"
      >
        <template #dueDate="{ record }">
          <a-date-picker
            v-if="canOperate"
            class="payment-date-picker"
            :model-value="record.dueDate"
            format="YYYY-MM-DD"
            @change="updateDueDate(record.rowKey, String($event || ''))"
          />
          <template v-else>
            {{ record.dueDate || '—' }}
          </template>
        </template>
        <template #completed="{ record }">
          <a-radio
            class="payment-completion-toggle"
            :model-value="record.completed"
            :disabled="!canOperate"
            @change="updateCompleted(record.rowKey, Boolean($event))"
          />
        </template>
        <template #ratio="{ record }">
          {{ ratio(record) }}
        </template>
        <template #originalAmount="{ record }">
          <span class="payment-cell-left">{{ formatMoneyString(record.originalAmount) }}</span>
        </template>
        <template #convertedAmount="{ record }">
          <span class="payment-cell-left">{{ converted(record) }}</span>
        </template>
        <template #remark="{ record }">
          <span class="payment-condition">
            {{ record.remark || '—' }}
          </span>
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
        <a-form-item label="付款金额（按合同币种）" required>
          <a-input
            :model-value="form.originalAmount"
            placeholder="请输入付款金额"
            @input="updateAmount"
          />
        </a-form-item>
        <a-form-item label="付款比例">
          <a-input
            :model-value="form.paymentRatio"
            placeholder="请输入付款比例"
            @input="updateRatio"
          >
            <template #suffix>
              %
            </template>
          </a-input>
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
.section-heading { min-height: 32px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #e5e6eb; }
.section-heading h3 { margin: 0; color: #1d2129; font-size: 14px; font-weight: 700; line-height: 22px; }
.payment-actions { display: flex; gap: 8px; margin-left: auto; }
.payment-actions :deep(.arco-btn) { width: 82px; height: 32px; padding: 0; border-radius: 0; }
.ratio-warning { color: rgb(var(--warning-6)); font-size: 12px; line-height: 20px; }
.payment-table-scroll { width: 100%; margin-top: 12px; overflow-x: scroll; scrollbar-gutter: stable; }
.payment-table-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
.payment-table-scroll::-webkit-scrollbar-track { border-radius: 2px; background: #f0f0f0; }
.payment-table-scroll::-webkit-scrollbar-thumb { border-radius: 2px; background: #bfbfbf; }
.payment-plan :deep(.arco-table) { width: max-content; min-width: 100%; }
.payment-plan :deep(.arco-table-element) { width: max-content; min-width: 100%; table-layout: auto; }
.payment-plan :deep(.arco-table-th) { height: 36px; padding: 0 16px; background: #f2f3f5; color: #1d2129; font-size: 14px; font-weight: 400; text-align: center; }
.payment-plan :deep(.arco-table-td) { height: 60px; padding: 0 16px; color: #1d2129; font-size: 14px; text-align: center; }
.payment-plan :deep(.arco-table-cell),
.payment-plan :deep(.arco-table-td-content) { overflow: visible; text-overflow: clip; white-space: nowrap; }
.payment-date-picker { width: 130px; }
.payment-plan :deep(.payment-date-picker.arco-picker) { height: 32px; border: 0; border-radius: 0; background: #e5e6eb; }
.payment-condition { width: 100%; display: block; min-width: 240px; max-width: 420px; text-align: left; white-space: normal; overflow-wrap: anywhere; }
.payment-cell-left { width: 100%; display: block; min-width: 120px; text-align: left; }
.payment-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 20px; }
.payment-form-grid :deep(.arco-picker), .payment-form-grid :deep(.arco-input-number) { width: 100%; }
.span-full { grid-column: 1 / -1; }
@media (max-width: 640px) {
  .payment-plan { padding-inline: 16px; }
  .section-heading { height: auto; min-height: 32px; align-items: flex-start; gap: 8px; }
  .payment-actions { flex-wrap: wrap; justify-content: flex-end; }
  .payment-form-grid { grid-template-columns: 1fr; }
  .span-full { grid-column: auto; }
}
</style>
