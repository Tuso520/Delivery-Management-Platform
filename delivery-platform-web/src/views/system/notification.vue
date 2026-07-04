<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { notificationApi } from '@/api/notification'
import { dictionaryApi, referenceApi } from '@/api/platform'
import type { CreateNotificationRuleDto, UpdateNotificationRuleDto } from '@/api/notification'
import type { NotificationRule } from '@/types/system'
import type { DictionaryItem, RoleOption } from '@/types/platform'

const loading = ref(false)
const ruleList = ref<NotificationRule[]>([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref('')

const eventTypeOptions = ref<DictionaryItem[]>([])
const channelOptions = ref<DictionaryItem[]>([])
const roleOptions = ref<RoleOption[]>([])

const formData = ref<CreateNotificationRuleDto>({
  name: '',
  eventType: '',
  channel: 'in_app',
  recipientRole: '',
  template: '',
  isEnabled: true,
})

const fetchRules = async () => {
  loading.value = true
  try {
    const res = await notificationApi.getRules()
    ruleList.value = res
  } catch {
    ruleList.value = []
  } finally {
    loading.value = false
  }
}

const handleAdd = () => {
  isEdit.value = false
  editId.value = ''
  formData.value = {
    name: '',
    eventType: '',
    channel: 'in_app',
    recipientRole: '',
    template: '',
    isEnabled: true,
  }
  dialogVisible.value = true
}

const handleEdit = (row: NotificationRule) => {
  isEdit.value = true
  editId.value = row.id
  formData.value = {
    name: row.name,
    eventType: row.eventType,
    channel: row.channel,
    recipientRole: row.recipientRole || '',
    template: row.template || '',
    isEnabled: row.isEnabled,
  }
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!formData.value.name.trim()) {
    Message.warning('规则名称不能为空')
    return
  }
  try {
    if (isEdit.value) {
      const dto: UpdateNotificationRuleDto = { ...formData.value }
      if (!dto.recipientRole) dto.recipientRole = undefined
      await notificationApi.updateRule(editId.value, dto)
      Message.success('更新成功')
    } else {
      const dto: CreateNotificationRuleDto = { ...formData.value }
      if (!dto.recipientRole) dto.recipientRole = undefined
      await notificationApi.createRule(dto)
      Message.success('创建成功')
    }
    dialogVisible.value = false
    fetchRules()
  } catch {
    // Error handled by interceptor
  }
}

const handleDelete = (row: NotificationRule) => {
  arcoConfirm(`确认删除规则 "${row.name}"？`, '确认', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    try {
      await notificationApi.deleteRule(row.id)
      Message.success('删除成功')
      fetchRules()
    } catch {
      // Error handled by interceptor
    }
  }).catch(() => {
    // Cancelled
  })
}

const handleToggleEnabled = async (row: NotificationRule) => {
  try {
    await notificationApi.updateRule(row.id, { isEnabled: !row.isEnabled })
    Message.success(row.isEnabled ? '已禁用' : '已启用')
    fetchRules()
  } catch {
    // Error handled by interceptor
  }
}

onMounted(async () => {
  const [events, channels, roles] = await Promise.all([
    dictionaryApi.getByCode('notification_event'),
    dictionaryApi.getByCode('notification_channel'),
    referenceApi.getRoleOptions(),
  ])
  eventTypeOptions.value = events.items
  channelOptions.value = channels.items
  roleOptions.value = roles
  await fetchRules()
})
</script>

<template>
  <div class="notification-page">
    <a-card>
      <template #header>
        <div class="card-header">
          <span class="card-title">通知规则管理</span>
          <a-button type="primary" size="small" @click="handleAdd">
            新增规则
          </a-button>
        </div>
      </template>

      <a-table
        v-loading="loading"
        :data="ruleList"
        border
        stripe
      >
        <a-table-column prop="name" label="规则名称" :width="160" />
        <a-table-column label="事件类型" :width="140">
          <template #default="{ row }">
            {{ eventTypeOptions.find(o => o.itemValue === row.eventType)?.itemLabel || row.eventType }}
          </template>
        </a-table-column>
        <a-table-column label="通知渠道" :width="100">
          <template #default="{ row }">
            {{ channelOptions.find(o => o.itemValue === row.channel)?.itemLabel || row.channel }}
          </template>
        </a-table-column>
        <a-table-column label="接收角色" :width="120">
          <template #default="{ row }">
            {{ roleOptions.find(o => o.roleCode === row.recipientRole)?.roleName || '不限 '}}
          </template>
        </a-table-column>
        <a-table-column
          prop="template"
          label="通知模板"
          :min-width="200"
          show-overflow-tooltip
        />
        <a-table-column label="启用" :width="80">
          <template #default="{ row }">
            <a-switch :model-value="row.isEnabled" @change="handleToggleEnabled(row)" />
          </template>
        </a-table-column>
        <a-table-column label="操作" :width="160" fixed="right">
          <template #default="{ row }">
            <a-button size="small" @click="handleEdit(row)">
              编辑
            </a-button>
            <a-button size="small" status="danger" type="secondary" @click="handleDelete(row)">
              删除
            </a-button>
          </template>
        </a-table-column>
      </a-table>

      <a-empty v-if="ruleList.length === 0 && !loading" description="暂无通知规则" />
    </a-card>

    <!-- Edit dialog -->
    <a-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑规则' : '新增规则'"
      width="560px"
      :close-on-click-modal="false"
    >
      <a-form :model="{}" label-width="100px">
        <a-form-item label="规则名称" required>
          <a-input
            v-model="formData.name"
            placeholder="请输入规则名称"
            :maxlength="100"
            show-word-limit
          />
        </a-form-item>
        <a-form-item label="事件类型" required>
          <a-select v-model="formData.eventType" style="width: 100%">
            <a-option
              v-for="opt in eventTypeOptions"
              :key="opt.id"
              :label="opt.itemLabel"
              :value="opt.itemValue"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="通知渠道">
          <a-select v-model="formData.channel" style="width: 100%">
            <a-option
              v-for="opt in channelOptions"
              :key="opt.id"
              :label="opt.itemLabel"
              :value="opt.itemValue"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="接收角色">
          <a-select v-model="formData.recipientRole" style="width: 100%" clearable>
            <a-option
              v-for="opt in roleOptions"
              :key="opt.id"
              :label="opt.roleName"
              :value="opt.roleCode"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="通知模板">
          <a-textarea
            v-model="formData.template"

            :rows="3"
            placeholder="通知模板内容，支持变量"
          />
        </a-form-item>
        <a-form-item label="是否启用">
          <a-switch v-model="formData.isEnabled" />
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
