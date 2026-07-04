<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
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
  ui: '鐣岄潰鏄剧ず',
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
  'ui.table_density': '琛ㄦ牸瀵嗗害',
}

const configTypeOptions = [
  { value: 'string', label: '字符串'},
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔' },
  { value: 'json', label: 'JSON' },
]
const numberValue = computed({
  get: () => Number(editingValue.value || 0),
  set: (value: number) => { editingValue.value = String(value) },
})
const booleanValue = computed({
  get: () => editingValue.value === 'true',
  set: (value: boolean) => { editingValue.value = String(value) },
})
const configGroups = computed(() =>
  Array.from(new Set(configList.value.map((item) => item.configKey.split('.')[0]))),
)
const filteredConfigs = computed(() =>
  configList.value.filter((item) => item.configKey.startsWith(`${activeGroup.value}.`)),
)

const fetchConfigs = async () => {
  loading.value = true
  try {
    const res = await systemConfigApi.getAll()
    configList.value = res
    if (!configGroups.value.includes(activeGroup.value)) {
      activeGroup.value = configGroups.value[0] || 'platform'
    }
  } catch {
    configList.value = []
  } finally {
    loading.value = false
  }
}

const handleEdit = (row: SystemConfig) => {
  isNew.value = false
  editingKey.value = row.configKey
  editingValue.value = row.configValue
  editingDesc.value = row.description || ''
  editingType.value = row.configType
  dialogVisible.value = true
}

const handleAdd = () => {
  isNew.value = true
  editingKey.value = ''
  editingValue.value = ''
  editingDesc.value = ''
  editingType.value = 'string'
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!editingKey.value.trim()) {
    Message.warning('配置键不能为空')
    return
  }
  try {
    if (editingType.value === 'json') {
      JSON.parse(editingValue.value)
    }
    const dto: UpsertSystemConfigDto = {
      configKey: editingKey.value,
      configValue: editingValue.value,
      description: editingDesc.value || undefined,
      configType: editingType.value,
    }
    await systemConfigApi.upsert(editingKey.value, dto)
    Message.success('保存成功')
    dialogVisible.value = false
    fetchConfigs()
  } catch (error) {
    if (error instanceof SyntaxError) {
      Message.error('请输入有效 JSON')
    }
  }
}

onMounted(() => {
  fetchConfigs()
})
</script>

<template>
  <div class="config-page">
    <a-card>
      <template #header>
        <div class="card-header">
          <span class="card-title">可配置系统参数</span>
          <a-button type="primary" size="small" @click="handleAdd">
            新增配置
          </a-button>
        </div>
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
        v-loading="loading"
        :data="filteredConfigs"
        border
        stripe
      >
        <a-table-column label="配置项" :min-width="190">
          <template #default="{ row }">
            <div class="config-name">
              <strong>{{ configLabelMap[row.configKey] || row.description || row.configKey }}</strong>
              <code>{{ row.configKey }}</code>
            </div>
          </template>
        </a-table-column>
        <a-table-column
          prop="configValue"
          label="配置项"
          :min-width="240"
          show-overflow-tooltip
        />
        <a-table-column
          prop="description"
          label="描述"
          :min-width="220"
          show-overflow-tooltip
        />
        <a-table-column prop="configType" label="类型" :width="90" />
        <a-table-column label="更新时间" :width="180">
          <template #default="{ row }">
            {{ row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '' }}
          </template>
        </a-table-column>
        <a-table-column label="操作" :width="100" fixed="right">
          <template #default="{ row }">
            <a-button size="small" @click="handleEdit(row)">
              编辑
            </a-button>
          </template>
        </a-table-column>
      </a-table>

      <a-empty v-if="filteredConfigs.length === 0 && !loading" description="该分组暂无配置" />
    </a-card>

    <!-- Edit dialog -->
    <a-dialog
      v-model="dialogVisible"
      :title="isNew ? '新增配置' : `编辑配置 - ${editingKey}`"
      width="520px"
      :close-on-click-modal="false"
    >
      <a-form :model="{}" label-width="100px">
        <a-form-item label="配置项" required>
          <a-input v-model="editingKey" :disabled="!isNew" placeholder="请输入配置键" />
        </a-form-item>
        <a-form-item label="配置项" required>
          <a-input-number
            v-if="editingType === 'number'"
            v-model="numberValue"
            :min="0"
            controls-position="right"
          />
          <a-switch
            v-else-if="editingType === 'boolean'"
            v-model="booleanValue"
            inline-prompt
            active-text="是"
            inactive-text="否"
          />
          <a-textarea
            v-else-if="editingType === 'json'"
            v-model="editingValue"

            :rows="5"
            placeholder="请输入有效 JSON"
          />
          <a-input v-else v-model="editingValue" placeholder="请输入配置项" />
        </a-form-item>
        <a-form-item label="描述">
          <a-input v-model="editingDesc" placeholder="请输入配置描述" />
        </a-form-item>
        <a-form-item label="类型">
          <a-segmented
            v-model="editingType"
            :options="configTypeOptions.map(item => ({ label: item.label, value: item.value }))"
          />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="dialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" @click="handleSave">
          保存
        </a-button>
      </template>
    </a-dialog>
  </div>
</template>

<style scoped lang="scss">
.config-name {
  display: grid;
  gap: 3px;

  strong {
    color: var(--app-text);
    font-weight: 600;
  }

  code {
    color: var(--app-text-muted);
    font-size: 11px;
  }
}
</style>
