<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Message, Modal, type TableColumnData } from '@arco-design/web-vue'
import { useQueryClient } from '@tanstack/vue-query'

import { projectPaymentApi } from '@/api/project-payment'
import { useProjectPaymentsQuery } from '@/composables/queries/useProjectQueries'
import { usePermission } from '@/composables/usePermission'
import { queryKeys } from '@/query/keys'
import type { ProjectPayment, ProjectPaymentPayload } from '@/types/project-payment'

const props = defineProps<{
  projectId: string
  contractAmount?: number | null
  contractCurrency?: string | null
  convertedCurrency?: string | null
  readonly?: boolean
}>()

const queryClient = useQueryClient()
const { hasPermission } = usePermission()
const canView = computed(() => hasPermission('payment:view'))
const canOperate = computed(() => !props.readonly && hasPermission('payment:operate'))
const query = useProjectPaymentsQuery(() => props.projectId, canView)
const rows = computed(() => query.data.value?.items ?? [])
const selectedKeys = ref<string[]>([])
const visible = ref(false)
const saving = ref(false)
const editing = ref<ProjectPayment | null>(null)
const form = reactive({
  paymentName: '',
  dueDate: '',
  completed: false,
  originalAmount: 0,
  remark: '',
})
const columns: TableColumnData[] = [
  { title: '付款项', dataIndex: 'paymentName', minWidth: 130 },
  { title: '付款日期', dataIndex: 'dueDate', slotName: 'dueDate', width: 112 },
  { title: '是否完成', dataIndex: 'status', slotName: 'completed', width: 92 },
  { title: '付款比例', slotName: 'ratio', width: 92 },
  { title: '付款金额', slotName: 'originalAmount', width: 132 },
  { title: '折算人民币', slotName: 'convertedAmount', width: 132 },
  { title: '付款条件', dataIndex: 'remark', slotName: 'remark', minWidth: 180 },
]

function money(value: number, currency?: string | null): string {
  return `${currency || ''} ${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)}`.trim()
}
function ratio(item: ProjectPayment): string {
  if (!props.contractAmount) return '—'
  return `${Math.round((item.originalAmount / props.contractAmount) * 10000) / 100}%`
}
function openCreate(): void {
  editing.value = null
  Object.assign(form, { paymentName: '', dueDate: '', completed: false, originalAmount: 0, remark: '' })
  visible.value = true
}
function openEdit(): void {
  const item = rows.value.find((row) => row.id === selectedKeys.value[0])
  if (!item) {
    Message.warning('请选择一条款项计划')
    return
  }
  editing.value = item
  Object.assign(form, {
    paymentName: item.paymentName,
    dueDate: item.dueDate?.slice(0, 10) ?? '',
    completed: item.status === 'Received',
    originalAmount: item.originalAmount,
    remark: item.remark ?? '',
  })
  visible.value = true
}
async function save(): Promise<boolean> {
  if (!form.paymentName.trim()) {
    Message.warning('请输入付款项名称')
    return false
  }
  if (form.originalAmount <= 0) {
    Message.warning('付款金额必须大于 0')
    return false
  }
  saving.value = true
  try {
    const payload: ProjectPaymentPayload = {
      projectId: props.projectId,
      paymentName: form.paymentName.trim(),
      paymentType: 'Milestone',
      dueDate: form.dueDate || null,
      originalAmount: form.originalAmount,
      originalCurrency: props.contractCurrency || 'CNY',
      convertedCurrency: props.convertedCurrency || 'CNY',
      receivedOriginalAmount: form.completed ? form.originalAmount : 0,
      receivedDate: form.completed ? new Date().toISOString() : null,
      remark: form.remark.trim() || undefined,
    }
    if (editing.value) await projectPaymentApi.update(editing.value.id, payload)
    else await projectPaymentApi.create(payload)
    await queryClient.invalidateQueries({ queryKey: queryKeys.projects.payments(props.projectId) })
    selectedKeys.value = []
    visible.value = false
    Message.success(editing.value ? '款项计划已更新' : '款项计划已添加')
    return true
  } finally {
    saving.value = false
  }
}
function remove(): void {
  const item = rows.value.find((row) => row.id === selectedKeys.value[0])
  if (!item) {
    Message.warning('请选择一条款项计划')
    return
  }
  Modal.confirm({
    title: '删除款项计划',
    content: `确定删除“${item.paymentName}”吗？`,
    okText: '删除',
    cancelText: '取消',
    okButtonProps: { status: 'danger' },
    onBeforeOk: async (done) => {
      try {
        await projectPaymentApi.delete(item.id)
        await queryClient.invalidateQueries({ queryKey: queryKeys.projects.payments(props.projectId) })
        selectedKeys.value = []
        Message.success('款项计划已删除')
        done(true)
      } catch {
        done(false)
      }
    },
  })
}
</script>

<template>
  <section class="payment-plan" aria-labelledby="payment-plan-title">
    <div class="payment-heading">
      <h3 id="payment-plan-title">
        款项计划
      </h3>
      <a-space v-if="canOperate" :size="8">
        <a-button size="mini" status="danger" @click="remove">
          删除
        </a-button>
        <a-button size="mini" @click="openEdit">
          编辑
        </a-button>
        <a-button size="mini" type="primary" @click="openCreate">
          添加
        </a-button>
      </a-space>
    </div>

    <a-result v-if="!canView" status="403" title="暂无款项查看权限" />
    <a-result
      v-else-if="query.isError.value"
      status="error"
      title="款项计划加载失败"
    >
      <template #extra>
        <a-button @click="query.refetch()">
          重新加载
        </a-button>
      </template>
    </a-result>
    <a-table
      v-else
      v-model:selected-keys="selectedKeys"
      :data="rows"
      :columns="columns"
      :loading="query.isFetching.value"
      :row-selection="canOperate ? { type: 'radio', showCheckedAll: false } : undefined"
      row-key="id"
      size="small"
      :pagination="false"
      :scroll="{ x: 940 }"
    >
      <template #dueDate="{ record }">
        {{ record.dueDate?.slice(0, 10) || '—' }}
      </template>
      <template #completed="{ record }">
        <a-tag :color="record.status === 'Received' ? 'green' : record.status === 'Overdue' ? 'red' : 'gray'">
          {{ record.status === 'Received' ? '是' : '否' }}
        </a-tag>
      </template>
      <template #ratio="{ record }">
        {{ ratio(record) }}
      </template>
      <template #originalAmount="{ record }">
        {{ money(record.originalAmount, record.originalCurrency) }}
      </template>
      <template #convertedAmount="{ record }">
        {{ money(record.convertedAmount, record.convertedCurrency) }}
      </template>
      <template #remark="{ record }">
        {{ record.remark || '—' }}
      </template>
      <template #empty>
        <a-empty description="暂无款项计划" />
      </template>
    </a-table>
  </section>

  <a-modal
    v-model:visible="visible"
    :title="editing ? '编辑款项计划' : '添加款项计划'"
    :width="576"
    :ok-loading="saving"
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
          <a-input-number v-model="form.originalAmount" :min="0" :precision="2" />
        </a-form-item>
        <a-form-item label="是否完成">
          <a-switch v-model="form.completed" />
        </a-form-item>
        <a-form-item class="span-full" label="付款条件">
          <a-textarea v-model="form.remark" :max-length="500" />
        </a-form-item>
      </div>
    </a-form>
  </a-modal>
</template>

<style scoped>
.payment-plan { padding: 18px 0 4px; border-top: 1px solid #e5e6eb; }
.payment-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.payment-heading h3 { margin: 0; color: #1d2129; font-size: 15px; font-weight: 500; }
.payment-plan :deep(.arco-table-th), .payment-plan :deep(.arco-table-td) { height: 40px; padding: 0 12px; font-size: 12px; }
.payment-plan :deep(.arco-table-th) { background: #f7f8fa; }
.payment-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 20px; }
.span-full { grid-column: 1 / -1; }
@media (max-width: 640px) { .payment-form-grid { grid-template-columns: 1fr; } .span-full { grid-column: auto; } }
</style>
