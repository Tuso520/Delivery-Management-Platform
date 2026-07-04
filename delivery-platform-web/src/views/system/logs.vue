<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { operationLogApi, type QueryOperationLogParams } from '@/api/system'
import type { OperationLog } from '@/types/system'
import type { TagType } from '@/types/ui'

const loading = ref(false)
const logList = ref<OperationLog[]>([])
const total = ref(0)

const queryParams = ref<QueryOperationLogParams>({
  page: 1,
  pageSize: 20,
  userId: '',
  module: '',
  action: '',
  targetType: '',
  startDate: '',
  endDate: '',
  result: '',
})

const moduleOptions = [
  { value: '', label: '全部模块' },
  { value: 'auth', label: '认证' },
  { value: 'user', label: '用户' },
  { value: 'role', label: '角色' },
  { value: 'project', label: '项目' },
  { value: 'archive', label: '档案' },
  { value: 'file', label: '文件' },
  { value: 'review', label: '审核' },
  { value: 'checklist', label: '检查项' },
  { value: 'system', label: '系统' },
]

const actionOptions = [
  { value: '', label: '全部操作' },
  { value: 'create', label: '创建' },
  { value: 'update', label: '更新' },
  { value: 'delete', label: '删除' },
  { value: 'view', label: '查看' },
  { value: 'upload', label: '上传' },
  { value: 'download', label: '下载' },
  { value: 'review', label: '审核' },
  { value: 'login', label: '登录' },
  { value: 'export', label: '导出' },
]

const resultOptions = [
  { value: '', label: '全部结果' },
  { value: 'success', label: '成功' },
  { value: 'failure', label: '失败' },
  { value: 'denied', label: '拒绝' },
]

const targetTypeOptions = [
  { value: '', label: '全部类型' },
  { value: 'project', label: '项目' },
  { value: 'user', label: '用户' },
  { value: 'role', label: '角色' },
  { value: 'file', label: '文件' },
  { value: 'archive_item', label: '档案项 '},
  { value: 'checklist_item', label: '检查项' },
]

const fetchLogs = async () => {
  loading.value = true
  try {
    const params: QueryOperationLogParams = { page: queryParams.value.page, pageSize: queryParams.value.pageSize }
    if (queryParams.value.userId) params.userId = queryParams.value.userId
    if (queryParams.value.module) params.module = queryParams.value.module
    if (queryParams.value.action) params.action = queryParams.value.action
    if (queryParams.value.targetType) params.targetType = queryParams.value.targetType
    if (queryParams.value.startDate) params.startDate = queryParams.value.startDate
    if (queryParams.value.endDate) params.endDate = queryParams.value.endDate
    if (queryParams.value.result) params.result = queryParams.value.result

    const res = await operationLogApi.getList(params)
    logList.value = res.list
    total.value = res.pagination.total
  } catch {
    logList.value = []
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  queryParams.value.page = 1
  fetchLogs()
}

const handleReset = () => {
  queryParams.value = {
    page: 1,
    pageSize: 20,
    userId: '',
    module: '',
    action: '',
    targetType: '',
    startDate: '',
    endDate: '',
    result: '',
  }
  fetchLogs()
}

const handlePageChange = (page: number) => {
  queryParams.value.page = page
  fetchLogs()
}

const resultTypeMap: Record<string, TagType> = {
  success: 'success',
  failure: 'danger',
  denied: 'warning',
}

const getResultTagType = (result: string): TagType => {
  return resultTypeMap[result] || 'info'
}

onMounted(() => {
  fetchLogs()
})
</script>

<template>
  <div class="log-page">
    <!-- Search form -->
    <a-card class="search-card">
      <a-form :model="queryParams" inline label-width="0">
        <a-form-item>
          <a-select v-model="queryParams.module" placeholder="选择模块" style="width: 120px">
            <a-option
              v-for="opt in moduleOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </a-select>
        </a-form-item>
        <a-form-item>
          <a-select v-model="queryParams.action" placeholder="选择操作" style="width: 120px">
            <a-option
              v-for="opt in actionOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </a-select>
        </a-form-item>
        <a-form-item>
          <a-select v-model="queryParams.targetType" placeholder="目标类型" style="width: 120px">
            <a-option
              v-for="opt in targetTypeOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </a-select>
        </a-form-item>
        <a-form-item>
          <a-select v-model="queryParams.result" placeholder="操作结果" style="width: 110px">
            <a-option
              v-for="opt in resultOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </a-select>
        </a-form-item>
        <a-form-item>
          <a-date-picker
            v-model="queryParams.startDate"
            type="date"
            placeholder="开始日期"
            value-format="YYYY-MM-DD"
            style="width: 140px"
          />
        </a-form-item>
        <a-form-item>
          <a-date-picker
            v-model="queryParams.endDate"
            type="date"
            placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 140px"
          />
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

    <!-- Log table -->
    <a-card>
      <a-table
        v-loading="loading"
        :data="logList"
        border
        stripe
      >
        <a-table-column label="用户" :width="120">
          <template #default="{ row }">
            {{ row.user?.realName || row.user?.username || row.userId }}
          </template>
        </a-table-column>
        <a-table-column prop="module" label="模块" :width="80" />
        <a-table-column prop="action" label="操作" :width="80" />
        <a-table-column prop="targetType" label="目标类型" :width="100" />
        <a-table-column
          prop="targetId"
          label="目标ID"
          :width="200"
          show-overflow-tooltip
        />
        <a-table-column prop="ipAddress" label="IP地址" :width="140" />
        <a-table-column label="结果" :width="80">
          <template #default="{ row }">
            <a-tag :type="getResultTagType(row.result)" size="small">
              {{ row.result }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column label="时间" :width="180">
          <template #default="{ row }">
            {{ row.createdAt ? new Date(row.createdAt).toLocaleString() : '' }}
          </template>
        </a-table-column>
      </a-table>

      <div v-if="total > 0" class="pagination-wrapper">
        <a-pagination
          v-model:current-page="queryParams.page"
          :page-size="queryParams.pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </a-card>
  </div>
</template>
