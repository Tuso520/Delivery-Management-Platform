<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { countryApi } from '@/api/country'
import type { Country, CreateCountryDto, UpdateCountryDto } from '@/types/country'

const loading = ref(false)
const countryList = ref<Country[]>([])
const total = ref(0)
const queryParams = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  status: '',
})
const tableRef = ref<unknown | null>(null)

// Dialog
const dialogVisible = ref(false)
const isEdit = ref(false)
const currentId = ref('')
const formData = reactive<CreateCountryDto & UpdateCountryDto>({
  countryCode: '',
  nameZh: '',
  nameEn: '',
  defaultLanguage: '',
  defaultCurrency: '',
  timezone: '',
  weekendRule: '',
  entryRequirements: '',
  safetyNotes: '',
  taxNotes: '',
  paymentNotes: '',
  supplierNotes: '',
})

const formRules = {
  countryCode: [{ required: true, message: '请输入国家代码', trigger: 'blur' }],
  nameZh: [{ required: true, message: '请输入中文名称', trigger: 'blur' }],
  nameEn: [{ required: true, message: '请输入英文名称', trigger: 'blur' }],
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await countryApi.getList(queryParams)
    countryList.value = res.list
    total.value = res.pagination.total
  } catch {
    // Error handled by interceptor
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  queryParams.page = 1
  fetchList()
}

const handleReset = () => {
  queryParams.keyword = ''
  queryParams.status = ''
  queryParams.page = 1
  fetchList()
}

const handlePageChange = (page: number) => {
  queryParams.page = page
  fetchList()
}

const handleSizeChange = (size: number) => {
  queryParams.pageSize = size
  queryParams.page = 1
  fetchList()
}

const openCreate = () => {
  isEdit.value = false
  currentId.value = ''
  Object.assign(formData, {
    countryCode: '',
    nameZh: '',
    nameEn: '',
    defaultLanguage: '',
    defaultCurrency: '',
    timezone: '',
    weekendRule: '',
    entryRequirements: '',
    safetyNotes: '',
    taxNotes: '',
    paymentNotes: '',
    supplierNotes: '',
  })
  dialogVisible.value = true
}

const openEdit = (row: Country) => {
  isEdit.value = true
  currentId.value = row.id
  Object.assign(formData, {
    countryCode: row.countryCode,
    nameZh: row.nameZh,
    nameEn: row.nameEn,
    defaultLanguage: row.defaultLanguage ?? '',
    defaultCurrency: row.defaultCurrency ?? '',
    timezone: row.timezone ?? '',
    weekendRule: row.weekendRule ?? '',
    entryRequirements: row.entryRequirements ?? '',
    safetyNotes: row.safetyNotes ?? '',
    taxNotes: row.taxNotes ?? '',
    paymentNotes: row.paymentNotes ?? '',
    supplierNotes: row.supplierNotes ?? '',
  })
  dialogVisible.value = true
}

const handleSubmit = async () => {
  try {
    // Clean empty strings to null for optional fields
    const payload = { ...formData }
    const optionalFields = [
      'defaultLanguage', 'defaultCurrency', 'timezone', 'weekendRule',
      'entryRequirements', 'safetyNotes', 'taxNotes', 'paymentNotes', 'supplierNotes',
    ] as const
    const payloadRecord = payload as Record<string, unknown>
    for (const field of optionalFields) {
      if (payload[field] === '') {
        payloadRecord[field] = undefined
      }
    }

    if (isEdit.value) {
      await countryApi.update(currentId.value, payload)
      Message.success('更新成功')
    } else {
      await countryApi.create(payload as CreateCountryDto)
      Message.success('创建成功')
    }
    dialogVisible.value = false
    fetchList()
  } catch {
    // Error handled by interceptor
  }
}

const handleDelete = (row: Country) => {
  arcoConfirm(`确定禁用国家 "${row.nameZh}" 吗？`, '确认', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    try {
      await countryApi.delete(row.id)
      Message.success('禁用成功')
      fetchList()
    } catch {
      // Error handled by interceptor
    }
  }).catch(() => {
    // cancelled
  })
}

const statusTagType = (status: string) => {
  return status === 'Active' ? 'success' : 'info'
}

onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="country-page">
    <!-- Search bar -->
    <a-card class="search-card">
      <a-form :model="queryParams" inline>
        <a-form-item label="关键词">
          <a-input
            v-model="queryParams.keyword"
            placeholder="搜索国家名称/代码"
            clearable
            @keyup.enter="handleSearch"
          />
        </a-form-item>
        <a-form-item label="状态">
          <a-select v-model="queryParams.status" placeholder="全部" clearable>
            <a-option label="活跃" value="Active" />
            <a-option label="禁用" value="Inactive" />
          </a-select>
        </a-form-item>
        <a-form-item>
          <a-button type="primary" @click="handleSearch">
            查询
          </a-button>
          <a-button @click="handleReset">
            重置
          </a-button>
        </a-form-item>
      </a-form>
    </a-card>

    <!-- Table -->
    <a-card class="table-card">
      <div class="table-header">
        <span class="table-title">国家列表</span>
        <a-button type="primary" @click="openCreate">
          <a-icon><Plus /></a-icon> 新增国家
        </a-button>
      </div>

      <a-table
        ref="tableRef"
        v-loading="loading"
        :data="countryList"
        border
        stripe
        style="width: 100%"
      >
        <a-table-column prop="countryCode" label="国家代码" :width="100" />
        <a-table-column prop="nameZh" label="中文名称" :min-width="120" />
        <a-table-column prop="nameEn" label="英文名称" :min-width="140" />
        <a-table-column prop="defaultLanguage" label="默认语言" :width="100" />
        <a-table-column prop="defaultCurrency" label="默认币种" :width="100" />
        <a-table-column prop="timezone" label="时区" :min-width="160" />
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

      <div class="pagination-wrapper">
        <a-pagination
          v-model:current-page="queryParams.page"
          v-model:page-size="queryParams.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </a-card>

    <!-- Create/Edit Dialog -->
    <a-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑国家' : '新增国家'"
      width="680px"
      :close-on-click-modal="false"
    >
      <a-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="120px"
      >
        <a-row :gutter="20">
          <a-col :span="8">
            <a-form-item label="国家代码" prop="countryCode">
              <a-input v-model="formData.countryCode" :disabled="isEdit" :maxlength="10" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="中文名称" prop="nameZh">
              <a-input v-model="formData.nameZh" :maxlength="50" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="英文名称" prop="nameEn">
              <a-input v-model="formData.nameEn" :maxlength="50" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="20">
          <a-col :span="8">
            <a-form-item label="默认语言">
              <a-input v-model="formData.defaultLanguage" :maxlength="10" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="默认币种">
              <a-input v-model="formData.defaultCurrency" :maxlength="10" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="时区">
              <a-input v-model="formData.timezone" :maxlength="50" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="周末规则">
          <a-input v-model="formData.weekendRule" :maxlength="20" placeholder="例如: Sat-Sun" />
        </a-form-item>
        <a-form-item label="入境要求">
          <a-textarea v-model="formData.entryRequirements" :rows="2" />
        </a-form-item>
        <a-form-item label="安全注意事项">
          <a-textarea v-model="formData.safetyNotes" :rows="2" />
        </a-form-item>
        <a-form-item label="税务注意事项">
          <a-textarea v-model="formData.taxNotes" :rows="2" />
        </a-form-item>
        <a-form-item label="付款注意事项">
          <a-textarea v-model="formData.paymentNotes" :rows="2" />
        </a-form-item>
        <a-form-item label="供应商注意事项">
          <a-textarea v-model="formData.supplierNotes" :rows="2" />
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
  </div>
</template>
