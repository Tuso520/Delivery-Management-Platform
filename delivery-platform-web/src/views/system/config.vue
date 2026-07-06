<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import type { TableColumnData } from '@arco-design/web-vue'
import { systemConfigApi } from '@/api/system'
import type { SystemConfig, UpsertSystemConfigDto } from '@/types/system'

const loading = ref(false)
const configList = ref<SystemConfig[]>([])
const dialogVisible = ref(false)
const editingKey = ref('')
const editingValue = ref('')
const editingDesc = ref('')
const editingType = ref('string')
const isNew = ref(false)
const activeGroup = ref('platform')

const groupLabels: Record<string, string> = {
  platform: '平台基础',
  project: '项目管理',
  attachment: '附件上传',
  file: '文件规则',
  report: '工时报告',
  approval: '审批流程',
  knowledge: '知识库',
  security: '安全登录',
  notification: '通知',
  currency: '汇率',
  ui: '界面显示',
}

const configLabelMap: Record<string, string> = {
  'platform.name': '平台名称',
  'platform.short_name': '平台简称',
  'platform.login_slogan': '登录页主文案',
  'platform.default_language': '默认语言',
  'platform.default_currency': '默认币种',
  'platform.timezone': '默认时区',
  'project.default_page_size': '项目默认分页',
  'project.default_risk_level': '项目默认风险',
  'project.archive_auto_generate': '自动生成项目档案',
  'attachment.max_size_mb': '附件大小上限（MB）',
  'file.allowed_extensions': '允许上传扩展名',
  'report.default_type': '默认报告类型',
  'report.reminder_hour': '日报提醒小时',
  'approval.timeout_days': '审批超时天数',
  'knowledge.default_page_size': '知识库默认分页',
  'security.session_hours': '登录会话时长',
  'security.login_max_attempts': '连续登录失败上限',
  'notification.default_channel': '默认通知渠道',
  'currency.sync_base': '汇率同步基准币种',
  'currency.sync_enabled': '启用在线汇率同步',
  'ui.date_format': '日期格式',
  'ui.table_density': '表格密度',
}

const configTypeOptions = [
  { value: 'string', label: '字符串' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔' },
  { value: 'json', label: 'JSON' },
]

const columns: TableColumnData[] = [
  { title: '配置项', dataIndex: 'configKey', slotName: 'configKey', minWidth: 220 },
  { title: '配置值', dataIndex: 'configValue', slotName: 'configValue', minWidth: 260 },
  { title: '说明', dataIndex: 'description', minWidth: 220 },
  { title: '类型', dataIndex: 'configType', width: 100 },
  { title: '更新时间', dataIndex: 'updatedAt', slotName: 'updatedAt', width: 170 },
  { title: '操作', slotName: 'actions', width: 100, fixed: 'right' },
]

const numberValue = computed({
  get: () => Number(editingValue.value || 0),
  set: (value: number) => {
    editingValue.value = String(value)
  },
})

const booleanValue = computed({
  get: () => editingValue.value === 'true',
  set: (value: boolean) => {
    editingValue.value = String(value)
  },
})

const configGroups = computed(() =>
  Array.from(new Set(configList.value.map((item) => item.configKey.split('.')[0]))),
)

const filteredConfigs = computed(() =>
  configList.value.filter((item) => item.configKey.startsWith(`${activeGroup.value}.`)),
)

async function fetchConfigs(): Promise<void> {
  loading.value = true
  try {
    configList.value = await systemConfigApi.getAll()
    if (!configGroups.value.includes(activeGroup.value)) {
      activeGroup.value = configGroups.value[0] || 'platform'
    }
  } finally {
    loading.value = false
  }
}

function handleEdit(row: SystemConfig): void {
  isNew.value = false
  editingKey.value = row.configKey
  editingValue.value = row.configValue
  editingDesc.value = row.description || ''
  editingType.value = row.configType
  dialogVisible.value = true
}

function handleAdd(): void {
  isNew.value = true
  editingKey.value = ''
  editingValue.value = ''
  editingDesc.value = ''
  editingType.value = 'string'
  dialogVisible.value = true
}

async function handleSave(): Promise<void> {
  if (!editingKey.value.trim()) {
    Message.warning('配置键不能为空')
    return
  }

  try {
    if (editingType.value === 'json') {
      JSON.parse(editingValue.value)
    }
    const dto: UpsertSystemConfigDto = {
      configKey: editingKey.value.trim(),
      configValue: editingValue.value,
      description: editingDesc.value || undefined,
      configType: editingType.value,
    }
    await systemConfigApi.upsert(editingKey.value.trim(), dto)
    Message.success('保存成功')
    dialogVisible.value = false
    await fetchConfigs()
  } catch (error) {
    if (error instanceof SyntaxError) {
      Message.error('请输入有效 JSON')
    }
  }
}

function configLabel(key: string): string {
  return configLabelMap[key] || key
}

function formatDate(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

onMounted(fetchConfigs)
</script>

<template>
  <section class="config-page">
    <a-card>
      <template #title>平台系统配置</template>
      <template #extra>
        <a-space>
          <a-button @click="fetchConfigs">刷新</a-button>
          <a-button type="primary" @click="handleAdd">新增配置</a-button>
        </a-space>
      </template>

      <a-tabs v-model="activeGroup" class="config-tabs">
        <a-tab-pane
          v-for="group in configGroups"
          :key="group"
          :name="group"
          :label="groupLabels[group] || group"
        />
      </a-tabs>

      <a-table
        :loading="loading"
        :columns="columns"
        :data="filteredConfigs"
        row-key="id"
        :pagination="false"
      >
        <template #configKey="{ record }">
          <div class="config-key">
            <strong>{{ configLabel(record.configKey) }}</strong>
            <span>{{ record.configKey }}</span>
          </div>
        </template>
        <template #configValue="{ record }">
          <code>{{ record.configValue }}</code>
        </template>
        <template #updatedAt="{ record }">
          {{ formatDate(record.updatedAt) }}
        </template>
        <template #actions="{ record }">
          <a-button type="text" size="small" @click="handleEdit(record)">编辑</a-button>
        </template>
      </a-table>

      <a-empty
        v-if="filteredConfigs.length === 0 && !loading"
        description="该分组暂无配置"
        class="empty-state"
      />
    </a-card>

    <a-modal
      v-model:visible="dialogVisible"
      :title="isNew ? '新增配置' : `编辑配置 - ${editingKey}`"
      ok-text="保存"
      cancel-text="取消"
      @ok="handleSave"
    >
      <a-form :model="{ editingKey, editingValue, editingDesc, editingType }" layout="vertical">
        <a-form-item label="配置键" required>
          <a-input v-model="editingKey" :disabled="!isNew" placeholder="请输入配置键" />
        </a-form-item>
        <a-form-item label="配置值" required>
          <a-input-number
            v-if="editingType === 'number'"
            v-model="numberValue"
            class="full-input"
          />
          <a-switch
            v-else-if="editingType === 'boolean'"
            v-model="booleanValue"
            checked-text="是"
            unchecked-text="否"
          />
          <a-textarea
            v-else-if="editingType === 'json'"
            v-model="editingValue"
            placeholder="请输入有效 JSON"
            :auto-size="{ minRows: 4, maxRows: 8 }"
          />
          <a-input v-else v-model="editingValue" placeholder="请输入配置值" />
        </a-form-item>
        <a-form-item label="说明">
          <a-input v-model="editingDesc" placeholder="请输入配置说明" />
        </a-form-item>
        <a-form-item label="类型">
          <a-select v-model="editingType">
            <a-option
              v-for="option in configTypeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </a-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </section>
</template>

<style scoped lang="scss">
.config-page {
  min-width: 0;
}

.config-tabs {
  margin-bottom: 14px;
}

.config-key {
  display: grid;
  gap: 4px;

  strong {
    color: var(--color-text-1);
  }

  span {
    color: var(--color-text-3);
    font-size: 12px;
  }
}

code {
  display: inline-block;
  max-width: 100%;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--color-fill-2);
  color: var(--color-text-2);
  word-break: break-all;
}

.full-input {
  width: 100%;
}

.empty-state {
  margin-top: 18px;
}
</style>
