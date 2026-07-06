<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import type { TableColumnData } from '@arco-design/web-vue'
import dayjs from 'dayjs'
import { currencyApi } from '@/api/currency'
import type { CreateCurrencyDto, CreateExchangeRateDto, Currency, ExchangeRate } from '@/types/currency'
import { arcoConfirm } from '@/utils/arco-dialog'

const activeTab = ref('currency')

const loading = ref(false)
const currencyList = ref<Currency[]>([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const currentId = ref('')
const formData = reactive({
  currencyCode: '',
  currencyName: '',
  currencySymbol: '',
  decimalPlaces: 2,
})

const rateLoading = ref(false)
const rateList = ref<ExchangeRate[]>([])
const rateDialogVisible = ref(false)
const syncLoading = ref(false)
const lastSync = ref<{ rateDate: string; syncedCount: number }>()
const rateForm = reactive<CreateExchangeRateDto>({
  fromCurrency: '',
  toCurrency: '',
  rate: 0,
  rateDate: '',
  source: 'manual',
})

const currencyColumns: TableColumnData[] = [
  { title: '币种代码', dataIndex: 'currencyCode', width: 120 },
  { title: '币种名称', dataIndex: 'currencyName', minWidth: 160 },
  { title: '符号', dataIndex: 'currencySymbol', slotName: 'symbol', width: 100 },
  { title: '小数位数', dataIndex: 'decimalPlaces', width: 110 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 100 },
  { title: '操作', slotName: 'actions', width: 160, fixed: 'right' },
]

const rateColumns: TableColumnData[] = [
  { title: '源币种', dataIndex: 'fromCurrency', width: 110 },
  { title: '目标币种', dataIndex: 'toCurrency', width: 120 },
  { title: '汇率', dataIndex: 'rate', minWidth: 150 },
  { title: '汇率日期', dataIndex: 'rateDate', slotName: 'rateDate', width: 140 },
  { title: '来源', dataIndex: 'source', slotName: 'source', width: 130 },
  { title: '锁定状态', dataIndex: 'isLocked', slotName: 'lockStatus', width: 120 },
  { title: '操作', slotName: 'rateActions', width: 160, fixed: 'right' },
]

async function fetchCurrencies(): Promise<void> {
  loading.value = true
  try {
    currencyList.value = await currencyApi.getList()
  } finally {
    loading.value = false
  }
}

async function fetchRates(): Promise<void> {
  rateLoading.value = true
  try {
    rateList.value = await currencyApi.getExchangeRates()
  } finally {
    rateLoading.value = false
  }
}

function openCreate(): void {
  isEdit.value = false
  currentId.value = ''
  Object.assign(formData, {
    currencyCode: '',
    currencyName: '',
    currencySymbol: '',
    decimalPlaces: 2,
  })
  dialogVisible.value = true
}

function openEdit(row: Currency): void {
  isEdit.value = true
  currentId.value = row.id
  formData.currencyCode = row.currencyCode
  formData.currencyName = row.currencyName
  formData.currencySymbol = row.currencySymbol ?? ''
  formData.decimalPlaces = row.decimalPlaces
  dialogVisible.value = true
}

async function handleSubmit(): Promise<void> {
  if (!formData.currencyCode.trim()) {
    Message.warning('请输入币种代码')
    return
  }
  if (!formData.currencyName.trim()) {
    Message.warning('请输入币种名称')
    return
  }

  const payload: CreateCurrencyDto = {
    currencyCode: formData.currencyCode.trim().toUpperCase(),
    currencyName: formData.currencyName.trim(),
    currencySymbol: formData.currencySymbol.trim() || undefined,
    decimalPlaces: formData.decimalPlaces,
  }

  if (isEdit.value) {
    await currencyApi.update(currentId.value, payload)
    Message.success('更新成功')
  } else {
    await currencyApi.create(payload)
    Message.success('创建成功')
  }
  dialogVisible.value = false
  await fetchCurrencies()
}

function handleDelete(row: Currency): void {
  arcoConfirm(`确认禁用币种“${row.currencyName}”？`, '确认禁用', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    await currencyApi.delete(row.id)
    Message.success('禁用成功')
    await fetchCurrencies()
  }).catch(() => {
    // 用户取消。
  })
}

function openAddRate(): void {
  rateForm.fromCurrency = ''
  rateForm.toCurrency = ''
  rateForm.rate = 0
  rateForm.rateDate = ''
  rateForm.source = 'manual'
  rateDialogVisible.value = true
}

async function handleRateSubmit(): Promise<void> {
  if (!rateForm.fromCurrency || !rateForm.toCurrency || !rateForm.rate) {
    Message.warning('请填写完整的汇率信息')
    return
  }
  await currencyApi.addExchangeRate(rateForm)
  Message.success('汇率添加成功')
  rateDialogVisible.value = false
  await fetchRates()
}

async function handleLockRate(row: ExchangeRate): Promise<void> {
  await currencyApi.lockExchangeRate(row.id)
  Message.success('锁定成功')
  await fetchRates()
}

async function handleUnlockRate(row: ExchangeRate): Promise<void> {
  await currencyApi.unlockExchangeRate(row.id)
  Message.success('解锁成功')
  await fetchRates()
}

async function handleSyncRates(): Promise<void> {
  syncLoading.value = true
  try {
    lastSync.value = await currencyApi.syncExchangeRates('CNY')
    Message.success(`已同步 ${lastSync.value.syncedCount} 条在线汇率`)
    await fetchRates()
  } finally {
    syncLoading.value = false
  }
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    manual: '人工维护',
    boc: '中国银行',
    project_locked: '项目锁定',
  }
  return labels[source] ?? source
}

onMounted(() => {
  fetchCurrencies()
  fetchRates()
})
</script>

<template>
  <section class="currency-page">
    <a-tabs v-model="activeTab">
      <a-tab-pane label="币种管理" name="currency">
        <a-card class="table-card">
          <template #title>币种列表</template>
          <template #extra>
            <a-button type="primary" @click="openCreate">新增币种</a-button>
          </template>

          <a-table
            :loading="loading"
            :columns="currencyColumns"
            :data="currencyList"
            row-key="id"
            :pagination="false"
          >
            <template #symbol="{ record }">
              {{ record.currencySymbol || '-' }}
            </template>
            <template #status="{ record }">
              <a-tag :color="record.status === 'Active' ? 'green' : 'gray'">
                {{ record.status === 'Active' ? '启用' : '禁用' }}
              </a-tag>
            </template>
            <template #actions="{ record }">
              <a-space size="mini">
                <a-button type="text" size="small" @click="openEdit(record)">编辑</a-button>
                <a-button type="text" size="small" status="danger" @click="handleDelete(record)">
                  禁用
                </a-button>
              </a-space>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>

      <a-tab-pane label="汇率管理" name="rate">
        <a-card class="table-card">
          <template #title>汇率列表</template>
          <template #extra>
            <a-space>
              <a-button :loading="syncLoading" @click="handleSyncRates">在线同步</a-button>
              <a-button type="primary" @click="openAddRate">手工添加</a-button>
            </a-space>
          </template>

          <a-alert
            v-if="lastSync"
            class="sync-alert"
            type="success"
            :title="`最近同步：${new Date(lastSync.rateDate).toLocaleDateString()}，${lastSync.syncedCount} 条`"
          />

          <a-table
            :loading="rateLoading"
            :columns="rateColumns"
            :data="rateList"
            row-key="id"
            :pagination="false"
          >
            <template #rateDate="{ record }">
              {{ dayjs(record.rateDate).format('YYYY-MM-DD') }}
            </template>
            <template #source="{ record }">
              {{ sourceLabel(record.source) }}
            </template>
            <template #lockStatus="{ record }">
              <a-tag :color="record.isLocked ? 'orange' : 'green'">
                {{ record.isLocked ? '已锁定' : '未锁定' }}
              </a-tag>
            </template>
            <template #rateActions="{ record }">
              <a-button
                v-if="!record.isLocked"
                type="text"
                size="small"
                @click="handleLockRate(record)"
              >
                锁定
              </a-button>
              <a-button
                v-else
                type="text"
                size="small"
                @click="handleUnlockRate(record)"
              >
                解锁
              </a-button>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>
    </a-tabs>

    <a-modal
      v-model:visible="dialogVisible"
      :title="isEdit ? '编辑币种' : '新增币种'"
      ok-text="保存"
      cancel-text="取消"
      @ok="handleSubmit"
    >
      <a-form :model="formData" layout="vertical">
        <a-form-item label="币种代码" required>
          <a-input v-model="formData.currencyCode" :disabled="isEdit" placeholder="例如 CNY" />
        </a-form-item>
        <a-form-item label="币种名称" required>
          <a-input v-model="formData.currencyName" placeholder="例如 人民币" />
        </a-form-item>
        <a-form-item label="币种符号">
          <a-input v-model="formData.currencySymbol" placeholder="例如 ¥" />
        </a-form-item>
        <a-form-item label="小数位数">
          <a-input-number v-model="formData.decimalPlaces" :min="0" :max="6" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:visible="rateDialogVisible"
      title="添加汇率"
      ok-text="保存"
      cancel-text="取消"
      @ok="handleRateSubmit"
    >
      <a-form :model="rateForm" layout="vertical">
        <a-form-item label="源币种" required>
          <a-select v-model="rateForm.fromCurrency" placeholder="选择源币种">
            <a-option
              v-for="currency in currencyList"
              :key="currency.currencyCode"
              :value="currency.currencyCode"
            >
              {{ currency.currencyCode }} - {{ currency.currencyName }}
            </a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="目标币种" required>
          <a-select v-model="rateForm.toCurrency" placeholder="选择目标币种">
            <a-option
              v-for="currency in currencyList"
              :key="currency.currencyCode"
              :value="currency.currencyCode"
            >
              {{ currency.currencyCode }} - {{ currency.currencyName }}
            </a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="汇率" required>
          <a-input-number v-model="rateForm.rate" :min="0" :precision="6" />
        </a-form-item>
        <a-form-item label="汇率日期">
          <a-date-picker v-model="rateForm.rateDate" placeholder="选择日期" />
        </a-form-item>
        <a-form-item label="来源">
          <a-select v-model="rateForm.source">
            <a-option value="manual">人工维护</a-option>
            <a-option value="boc">中国银行</a-option>
            <a-option value="project_locked">项目锁定</a-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </section>
</template>

<style scoped lang="scss">
.currency-page {
  min-width: 0;
}

.table-card {
  border-radius: 8px;
}

.sync-alert {
  margin-bottom: 14px;
}
</style>
