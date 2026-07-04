<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { currencyApi } from '@/api/currency'
import type { Currency, ExchangeRate, CreateCurrencyDto, CreateExchangeRateDto } from '@/types/currency'
import dayjs from 'dayjs'

// ====== Currency tab ======
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
const formRules = {
  currencyCode: [{ required: true, message: '请输入币种代码', trigger: 'blur' }],
  currencyName: [{ required: true, message: '请输入币种名称', trigger: 'blur' }],
}

const fetchCurrencies = async () => {
  loading.value = true
  try {
    const res = await currencyApi.getList()
    currencyList.value = res
  } catch {
    // handled by interceptor
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
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

const openEdit = (row: Currency) => {
  isEdit.value = true
  currentId.value = row.id
  formData.currencyCode = row.currencyCode
  formData.currencyName = row.currencyName
  formData.currencySymbol = row.currencySymbol ?? ''
  formData.decimalPlaces = row.decimalPlaces
  dialogVisible.value = true
}

const handleSubmit = async () => {
  try {
    const payload: CreateCurrencyDto = {
      currencyCode: formData.currencyCode,
      currencyName: formData.currencyName,
      currencySymbol: formData.currencySymbol === '' ? undefined : formData.currencySymbol,
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
    fetchCurrencies()
  } catch {
    // handled by interceptor
  }
}

const handleDelete = (row: Currency) => {
  arcoConfirm(`确定禁用币种 "${row.currencyName}" 吗？`, '确认', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    try {
      await currencyApi.delete(row.id)
      Message.success('禁用成功')
      fetchCurrencies()
    } catch {
      // handled by interceptor
    }
  }).catch(() => {
    // cancelled
  })
}

const statusTagType = (status: string) => {
  return status === 'Active' ? 'success' : 'info'
}

// ====== Exchange Rate tab ======
const activeTab = ref('currency')
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
const rateFormRules = {
  fromCurrency: [{ required: true, message: '请输入源币种', trigger: 'blur' }],
  toCurrency: [{ required: true, message: '请输入目标币种', trigger: 'blur' }],
  rate: [{ required: true, message: '请输入汇率', trigger: 'blur' }],
}

const fetchRates = async () => {
  rateLoading.value = true
  try {
    const res = await currencyApi.getExchangeRates()
    rateList.value = res
  } catch {
    // handled by interceptor
  } finally {
    rateLoading.value = false
  }
}

const openAddRate = () => {
  rateForm.fromCurrency = ''
  rateForm.toCurrency = ''
  rateForm.rate = 0
  rateForm.rateDate = ''
  rateForm.source = 'manual'
  rateDialogVisible.value = true
}

const handleRateSubmit = async () => {
  try {
    await currencyApi.addExchangeRate(rateForm)
    Message.success('汇率添加成功')
    rateDialogVisible.value = false
    fetchRates()
  } catch {
    // handled by interceptor
  }
}

const handleLockRate = async (row: ExchangeRate) => {
  try {
    await currencyApi.lockExchangeRate(row.id)
    Message.success('锁定成功')
    fetchRates()
  } catch {
    // handled by interceptor
  }
}

const handleUnlockRate = async (row: ExchangeRate) => {
  try {
    await currencyApi.unlockExchangeRate(row.id)
    Message.success('解锁成功')
    fetchRates()
  } catch {
    // handled by interceptor
  }
}

const handleSyncRates = async () => {
  syncLoading.value = true
  try {
    lastSync.value = await currencyApi.syncExchangeRates('CNY')
    Message.success(`已同步 ${lastSync.value.syncedCount} 条在线汇率`)
    await fetchRates()
  } finally {
    syncLoading.value = false
  }
}

onMounted(() => {
  fetchCurrencies()
  fetchRates()
})
</script>

<template>
  <div class="currency-page">
    <a-tabs v-model="activeTab">
      <!-- Currency Management Tab -->
      <a-tab-pane label="币种管理" name="currency">
        <a-card class="table-card">
          <div class="table-header">
            <span class="table-title">币种列表</span>
            <a-button type="primary" @click="openCreate">
              <a-icon><Plus /></a-icon> 新增币种
            </a-button>
          </div>

          <a-table
            v-loading="loading"
            :data="currencyList"
            border
            stripe
          >
            <a-table-column prop="currencyCode" label="币种代码" :width="120" />
            <a-table-column prop="currencyName" label="币种名称" :min-width="150" />
            <a-table-column prop="currencySymbol" label="绗﹀彿" :width="100" />
            <a-table-column prop="decimalPlaces" label="小数位数" :width="100" />
            <a-table-column prop="status" label="状态" :width="90">
              <template #default="{ row }">
                <a-tag :type="statusTagType(row.status)" size="small">
                  {{ row.status === 'Active' ? '活跃' : '禁用' }}
                </a-tag>
              </template>
            </a-table-column>
            <a-table-column label="操作" :width="160" fixed="right">
              <template #default="{ row }">
                <a-button
                  type="primary"
                  text
                  size="small"
                  @click="openEdit(row)"
                >
                  编辑
                </a-button>
                <a-button
                  status="danger" type="secondary"
                  text
                  size="small"
                  @click="handleDelete(row)"
                >
                  禁用
                </a-button>
              </template>
            </a-table-column>
          </a-table>
        </a-card>
      </a-tab-pane>

      <!-- Exchange Rate Tab -->
      <a-tab-pane label="汇率管理" name="rate">
        <a-card class="table-card">
          <div class="table-header">
            <div>
              <span class="table-title">汇率列表</span>
              <span class="rate-source">
                每日汇率来源：                <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">
                  ExchangeRate-API
                </a>
              </span>
            </div>
            <div>
              <a-button :loading="syncLoading" type="primary" @click="handleSyncRates">
                <a-icon><Refresh /></a-icon> 在线同步
              </a-button>
              <a-button @click="openAddRate">
                <a-icon><Plus /></a-icon> 手工添加
              </a-button>
            </div>
          </div>
          <a-alert
            v-if="lastSync"
            type="success"
            :closable="false"
            :title="`最近同步：${new Date(lastSync.rateDate).toLocaleDateString()}，${lastSync.syncedCount} 条`"
            class="sync-alert"
          />

          <a-table
            v-loading="rateLoading"
            :data="rateList"
            border
            stripe
          >
            <a-table-column prop="fromCurrency" label="源币种" :width="110" />
            <a-table-column prop="toCurrency" label="目标币种" :width="110" />
            <a-table-column prop="rate" label="汇率" :min-width="180" />
            <a-table-column prop="rateDate" label="汇率日期" :width="140">
              <template #default="{ row }">
                {{ dayjs(row.rateDate).format('YYYY-MM-DD') }}
              </template>
            </a-table-column>
            <a-table-column
              prop="source"
              label="来源"
              :min-width="220"
              show-overflow-tooltip
            />
            <a-table-column prop="isLocked" label="锁定状态" :width="110">
              <template #default="{ row }">
                <a-tag :type="row.isLocked ? 'danger' : 'success'" size="small">
                  {{ row.isLocked ? '已锁定' : '未锁定' }}
                </a-tag>
              </template>
            </a-table-column>
            <a-table-column label="操作" :width="160" fixed="right">
              <template #default="{ row }">
                <a-button
                  v-if="!row.isLocked"
                  status="warning" type="secondary"
                  text
                  size="small"
                  @click="handleLockRate(row)"
                >
                  锁定
                </a-button>
                <a-button
                  v-if="row.isLocked"
                  status="success" type="secondary"
                  text
                  size="small"
                  @click="handleUnlockRate(row)"
                >
                  解锁
                </a-button>
              </template>
            </a-table-column>
          </a-table>
        </a-card>
      </a-tab-pane>
    </a-tabs>

    <!-- Currency Create/Edit Dialog -->
    <a-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑币种' : '新增币种'"
      width="480px"
      :close-on-click-modal="false"
    >
      <a-form :model="formData" :rules="formRules" label-width="100px">
        <a-form-item label="币种代码" prop="currencyCode">
          <a-input v-model="formData.currencyCode" :disabled="isEdit" :maxlength="10" />
        </a-form-item>
        <a-form-item label="币种名称" prop="currencyName">
          <a-input v-model="formData.currencyName" :maxlength="50" />
        </a-form-item>
        <a-form-item label="币种符号">
          <a-input v-model="formData.currencySymbol" :maxlength="10" />
        </a-form-item>
        <a-form-item label="小数位数">
          <a-input-number v-model="formData.decimalPlaces" :min="0" :max="8" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="dialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" @click="handleSubmit">
          保存
        </a-button>
      </template>
    </a-dialog>

    <!-- Exchange Rate Dialog -->
    <a-dialog
      v-model="rateDialogVisible"
      title="添加汇率"
      width="480px"
      :close-on-click-modal="false"
    >
      <a-form :model="rateForm" :rules="rateFormRules" label-width="100px">
        <a-form-item label="源币种" prop="fromCurrency">
          <a-select v-model="rateForm.fromCurrency" filterable style="width:100%">
            <a-option
              v-for="item in currencyList"
              :key="item.id"
              :label="`${item.currencyCode} / ${item.currencyName}`"
              :value="item.currencyCode"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="目标币种" prop="toCurrency">
          <a-select v-model="rateForm.toCurrency" filterable style="width:100%">
            <a-option
              v-for="item in currencyList"
              :key="item.id"
              :label="`${item.currencyCode} / ${item.currencyName}`"
              :value="item.currencyCode"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="汇率" prop="rate">
          <a-input-number
            v-model="rateForm.rate"
            :min="0"
            :precision="8"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="汇率日期">
          <a-date-picker
            v-model="rateForm.rateDate"
            type="date"
            placeholder="选择日期"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="来源">
          <a-select v-model="rateForm.source" style="width:100%">
            <a-option label="人工维护" value="manual" />
            <a-option label="中国银行" value="boc" />
            <a-option label="项目锁定汇率" value="project_locked" />
          </a-select>
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="rateDialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" @click="handleRateSubmit">
          保存
        </a-button>
      </template>
    </a-dialog>
  </div>
</template>
