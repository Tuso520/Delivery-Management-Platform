<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { departmentApi, referenceApi, systemOperationsApi } from '@/api/platform'
import type {
  DepartmentNode,
  ExternalContactCandidate,
  IntegrationConfig,
  RoleOption,
} from '@/types/platform'

interface ProviderOption {
  value: string
  label: string
}

const loading = ref(false)
const records = ref<IntegrationConfig[]>([])
const dialogVisible = ref(false)
const editingId = ref('')
const candidatesVisible = ref(false)
const candidatesLoading = ref(false)
const selectedIntegration = ref<IntegrationConfig>()
const candidates = ref<ExternalContactCandidate[]>([])
const roleOptions = ref<RoleOption[]>([])
const departmentOptions = ref<Array<{ value: string; label: string }>>([])
const approveVisible = ref(false)
const approving = ref(false)
const approvingCandidate = ref<ExternalContactCandidate>()

const form = ref({
  provider: 'enterprise_wechat',
  configName: '',
  isEnabled: false,
  description: '',
})
const config = ref({
  corpId: '',
  agentId: '',
  secret: '',
  appId: '',
  appSecret: '',
  encryptKey: '',
  verificationToken: '',
  webhookUrl: '',
  host: '',
  port: 465,
  secure: true,
  username: '',
  password: '',
  sender: '',
  endpoint: '',
  region: '',
  bucket: '',
  accessKeyId: '',
  accessKeySecret: '',
  url: '',
  method: 'POST',
  authType: 'none',
  token: '',
  mockContactsText: '',
})
const approveForm = ref({
  roleIds: [] as string[],
  departmentId: '',
  positionsText: '',
  username: '',
  comment: '',
})

const providerOptions: ProviderOption[] = [
  { value: 'enterprise_wechat', label: '企业微信' },
  { value: 'feishu', label: '飞书' },
  { value: 'email', label: '邮件 SMTP' },
  { value: 'aliyun_oss', label: '阿里云 OSS' },
  { value: 'webhook', label: 'Webhook' },
]

const peopleProviders = new Set(['enterprise_wechat', 'feishu'])
const selectedProviderLabel = computed(() => providerLabel(form.value.provider))

function providerLabel(provider: string): string {
  return providerOptions.find((item) => item.value === provider)?.label || provider
}

function isPeopleProvider(row: IntegrationConfig | { provider: string }): boolean {
  return peopleProviders.has(row.provider)
}

async function fetchRecords(): Promise<void> {
  loading.value = true
  try {
    records.value = await systemOperationsApi.getIntegrations()
  } finally {
    loading.value = false
  }
}

async function loadSelectorOptions(): Promise<void> {
  const [roles, departments] = await Promise.all([
    referenceApi.getRoleOptions(),
    departmentApi.getTree(),
  ])
  roleOptions.value = roles
  departmentOptions.value = flattenDepartments(departments)
}

function flattenDepartments(
  nodes: DepartmentNode[],
  prefix = '',
): Array<{ value: string; label: string }> {
  return nodes.flatMap((node) => {
    const label = prefix ? `${prefix} / ${node.departmentName}` : node.departmentName
    return [
      { value: node.id, label },
      ...flattenDepartments(node.children || [], label),
    ]
  })
}

function openEditor(row?: IntegrationConfig): void {
  editingId.value = row?.id ?? ''
  form.value = {
    provider: row?.provider ?? 'enterprise_wechat',
    configName: row?.configName ?? '',
    isEnabled: row?.isEnabled ?? false,
    description: row?.description ?? '',
  }
  const value = row?.configValue ?? {}
  config.value = {
    corpId: String(value.corpId ?? ''),
    agentId: String(value.agentId ?? ''),
    secret: String(value.secret ?? ''),
    appId: String(value.appId ?? ''),
    appSecret: String(value.appSecret ?? ''),
    encryptKey: String(value.encryptKey ?? ''),
    verificationToken: String(value.verificationToken ?? ''),
    webhookUrl: String(value.webhookUrl ?? ''),
    host: String(value.host ?? ''),
    port: Number(value.port ?? 465),
    secure: Boolean(value.secure ?? true),
    username: String(value.username ?? ''),
    password: String(value.password ?? ''),
    sender: String(value.sender ?? ''),
    endpoint: String(value.endpoint ?? ''),
    region: String(value.region ?? ''),
    bucket: String(value.bucket ?? ''),
    accessKeyId: String(value.accessKeyId ?? ''),
    accessKeySecret: String(value.accessKeySecret ?? ''),
    url: String(value.url ?? ''),
    method: String(value.method ?? 'POST'),
    authType: String(value.authType ?? 'none'),
    token: String(value.token ?? ''),
    mockContactsText: Array.isArray(value.mockContacts)
      ? JSON.stringify(value.mockContacts, null, 2)
      : '',
  }
  dialogVisible.value = true
}

function parseMockContacts(): Record<string, unknown>[] | undefined {
  const text = config.value.mockContactsText.trim()
  if (!text) return undefined
  const parsed = JSON.parse(text)
  if (!Array.isArray(parsed)) {
    throw new Error('mockContacts must be an array')
  }
  return parsed as Record<string, unknown>[]
}

function buildPeopleConfig(): Record<string, unknown> {
  const mockContacts = parseMockContacts()
  if (form.value.provider === 'enterprise_wechat') {
    return {
      corpId: config.value.corpId,
      agentId: config.value.agentId,
      secret: config.value.secret,
      webhookUrl: config.value.webhookUrl,
      mockContacts,
    }
  }
  return {
    appId: config.value.appId,
    appSecret: config.value.appSecret,
    webhookUrl: config.value.webhookUrl,
    encryptKey: config.value.encryptKey,
    verificationToken: config.value.verificationToken,
    mockContacts,
  }
}

function buildConfig(): Record<string, unknown> {
  if (isPeopleProvider(form.value)) return buildPeopleConfig()
  if (form.value.provider === 'email') {
    return {
      host: config.value.host,
      port: config.value.port,
      secure: config.value.secure,
      username: config.value.username,
      password: config.value.password,
      sender: config.value.sender,
    }
  }
  if (form.value.provider === 'aliyun_oss') {
    return {
      endpoint: config.value.endpoint,
      region: config.value.region,
      bucket: config.value.bucket,
      accessKeyId: config.value.accessKeyId,
      accessKeySecret: config.value.accessKeySecret,
    }
  }
  return {
    url: config.value.url,
    method: config.value.method,
    authType: config.value.authType,
    token: config.value.authType === 'none' ? '' : config.value.token,
  }
}

async function save(): Promise<void> {
  let payload: Record<string, unknown>
  try {
    payload = { ...form.value, configValue: buildConfig() }
  } catch {
    Message.error('人员同步样例必须是 JSON 数组')
    return
  }

  try {
    if (editingId.value) {
      await systemOperationsApi.updateIntegration(editingId.value, payload)
    } else {
      await systemOperationsApi.createIntegration(payload)
    }
    Message.success('接口配置已保存')
    dialogVisible.value = false
    await fetchRecords()
  } catch {
    Message.error('保存失败')
  }
}

async function toggle(row: IntegrationConfig): Promise<void> {
  await systemOperationsApi.toggleIntegration(row.id, !row.isEnabled)
  Message.success(row.isEnabled ? '接口已停用' : '接口已启用')
  await fetchRecords()
}

async function syncUsers(row: IntegrationConfig): Promise<void> {
  if (!row.isEnabled) {
    Message.warning('请先启用该集成配置')
    return
  }
  const result = await systemOperationsApi.syncExternalContacts(row.id)
  Message.success(`已同步 ${result.total} 人，新增 ${result.created} 人，刷新 ${result.refreshed} 人`)
  await openCandidates(row)
}

async function openCandidates(row: IntegrationConfig): Promise<void> {
  selectedIntegration.value = row
  candidatesVisible.value = true
  candidatesLoading.value = true
  try {
    await loadSelectorOptions()
    candidates.value = await systemOperationsApi.getExternalContacts(row.id)
  } finally {
    candidatesLoading.value = false
  }
}

function openApprove(row: ExternalContactCandidate): void {
  approvingCandidate.value = row
  approveForm.value = {
    roleIds: [],
    departmentId: '',
    positionsText: row.positionNames?.join('、') || '',
    username: `${row.provider}_${row.externalUserId}`.replace(/[^a-zA-Z0-9_.-]+/g, '_'),
    comment: '',
  }
  approveVisible.value = true
}

async function approveCandidate(): Promise<void> {
  const integrationId = selectedIntegration.value?.id
  const candidateId = approvingCandidate.value?.id
  if (!integrationId || !candidateId) return
  if (!approveForm.value.roleIds.length) {
    Message.warning('请选择至少一个岗位角色')
    return
  }
  approving.value = true
  try {
    await systemOperationsApi.approveExternalContact(integrationId, candidateId, {
      roleIds: approveForm.value.roleIds,
      departmentId: approveForm.value.departmentId || undefined,
      positions: approveForm.value.positionsText
        .split(/[、,，/]/)
        .map((item) => item.trim())
        .filter(Boolean),
      username: approveForm.value.username || undefined,
      comment: approveForm.value.comment || undefined,
    })
    Message.success('人员接入审批已通过')
    approveVisible.value = false
    candidates.value = await systemOperationsApi.getExternalContacts(integrationId)
  } finally {
    approving.value = false
  }
}

async function rejectCandidate(row: ExternalContactCandidate): Promise<void> {
  const integrationId = selectedIntegration.value?.id
  if (!integrationId) return
  await systemOperationsApi.rejectExternalContact(integrationId, row.id, {
    comment: '接入信息不符合当前审批要求',
  })
  Message.success('已驳回该人员接入')
  candidates.value = await systemOperationsApi.getExternalContacts(integrationId)
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    Pending: '待审批',
    Approved: '已通过',
    Rejected: '已驳回',
  }
  return map[status] || status
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    Pending: 'orange',
    Approved: 'green',
    Rejected: 'red',
  }
  return map[status] || 'blue'
}

onMounted(fetchRecords)
</script>

<template>
  <section class="resource-page integration-page">
    <div class="page-toolbar">
      <div>
        <h2>接口集成</h2>
        <p>维护飞书、企业微信、邮件、对象存储和 Webhook；飞书/企业微信支持人员同步与接入审批。</p>
      </div>
      <a-button type="primary" @click="openEditor()">
        新增集成
      </a-button>
    </div>

    <a-table
      :loading="loading"
      :data="records"
      :pagination="false"
      border
      stripe
      class="integration-table"
      :scroll="{ x: 1328 }"
    >
      <a-table-column label="服务商" :width="150">
        <template #default="{ row }">
          {{ providerLabel(row.provider) }}
        </template>
      </a-table-column>
      <a-table-column prop="configName" label="配置名称" :width="190" show-overflow-tooltip />
      <a-table-column prop="description" label="说明" :width="230" show-overflow-tooltip />
      <a-table-column label="配置摘要" :width="420">
        <template #default="{ row }">
          <code>{{ JSON.stringify(row.configValue) }}</code>
        </template>
      </a-table-column>
      <a-table-column label="启用" :width="88" align="center">
        <template #default="{ row }">
          <a-switch :model-value="row.isEnabled" @change="toggle(row)" />
        </template>
      </a-table-column>
      <a-table-column label="操作" :width="250" fixed="right">
        <template #default="{ row }">
          <a-space size="mini" :wrap="false">
            <a-button type="text" size="mini" @click="openEditor(row)">编辑</a-button>
            <a-button
              v-if="isPeopleProvider(row)"
              type="text"
              size="mini"
              @click="syncUsers(row)"
            >
              同步人员
            </a-button>
            <a-button
              v-if="isPeopleProvider(row)"
              type="text"
              size="mini"
              @click="openCandidates(row)"
            >
              接入审批
            </a-button>
          </a-space>
        </template>
      </a-table-column>
    </a-table>

    <a-modal
      v-model:visible="dialogVisible"
      title="接口配置"
      :width="760"
      ok-text="保存"
      cancel-text="取消"
      @ok="save"
    >
      <a-form :model="form" layout="vertical">
        <a-grid :cols="2" :col-gap="12" :row-gap="8">
          <a-grid-item>
            <a-form-item label="服务商">
              <a-select v-model="form.provider">
                <a-option
                  v-for="item in providerOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </a-select>
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item label="配置名称">
              <a-input v-model="form.configName" :placeholder="`${selectedProviderLabel} 接入配置`" />
            </a-form-item>
          </a-grid-item>
        </a-grid>

        <template v-if="form.provider === 'enterprise_wechat'">
          <a-grid :cols="2" :col-gap="12" :row-gap="8">
            <a-grid-item><a-form-item label="企业 ID"><a-input v-model="config.corpId" /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="应用 AgentId"><a-input v-model="config.agentId" /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="应用 Secret"><a-input v-model="config.secret" type="password" show-password /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="群机器人"><a-input v-model="config.webhookUrl" placeholder="可选 Webhook URL" /></a-form-item></a-grid-item>
          </a-grid>
        </template>
        <template v-else-if="form.provider === 'feishu'">
          <a-grid :cols="2" :col-gap="12" :row-gap="8">
            <a-grid-item><a-form-item label="App ID"><a-input v-model="config.appId" /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="App Secret"><a-input v-model="config.appSecret" type="password" show-password /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="机器人地址"><a-input v-model="config.webhookUrl" placeholder="飞书群机器人 Webhook" /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="Encrypt Key"><a-input v-model="config.encryptKey" type="password" show-password /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="校验 Token"><a-input v-model="config.verificationToken" type="password" show-password /></a-form-item></a-grid-item>
          </a-grid>
        </template>
        <template v-else-if="form.provider === 'email'">
          <a-grid :cols="2" :col-gap="12" :row-gap="8">
            <a-grid-item><a-form-item label="SMTP 主机"><a-input v-model="config.host" placeholder="smtp.example.com" /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="端口"><a-input-number v-model="config.port" :min="1" :max="65535" /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="用户名"><a-input v-model="config.username" /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="密码"><a-input v-model="config.password" type="password" show-password /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="发件人"><a-input v-model="config.sender" placeholder="交付中心 <delivery@example.com>" /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="SSL/TLS"><a-switch v-model="config.secure" /></a-form-item></a-grid-item>
          </a-grid>
        </template>
        <template v-else-if="form.provider === 'aliyun_oss'">
          <a-grid :cols="2" :col-gap="12" :row-gap="8">
            <a-grid-item><a-form-item label="Endpoint"><a-input v-model="config.endpoint" /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="Region"><a-input v-model="config.region" /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="Bucket"><a-input v-model="config.bucket" /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="AccessKey ID"><a-input v-model="config.accessKeyId" /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="AccessKey Secret"><a-input v-model="config.accessKeySecret" type="password" show-password /></a-form-item></a-grid-item>
          </a-grid>
        </template>
        <template v-else>
          <a-grid :cols="2" :col-gap="12" :row-gap="8">
            <a-grid-item><a-form-item label="请求地址"><a-input v-model="config.url" placeholder="https://..." /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="请求方法"><a-segmented v-model="config.method" :options="['POST', 'PUT', 'PATCH']" /></a-form-item></a-grid-item>
            <a-grid-item><a-form-item label="鉴权方式"><a-select v-model="config.authType"><a-option label="无鉴权" value="none" /><a-option label="Bearer Token" value="bearer" /><a-option label="签名密钥" value="signature" /></a-select></a-form-item></a-grid-item>
            <a-grid-item v-if="config.authType !== 'none'"><a-form-item label="凭据"><a-input v-model="config.token" type="password" show-password /></a-form-item></a-grid-item>
          </a-grid>
        </template>

        <a-form-item v-if="isPeopleProvider(form)" label="人员同步样例 JSON">
          <a-textarea
            v-model="config.mockContactsText"
            placeholder='可选。格式：[{"externalUserId":"u001","realName":"张三","phone":"138...","email":"a@b.com","departmentName":"交付中心","positionNames":["项目经理"]}]'
            :auto-size="{ minRows: 3, maxRows: 6 }"
          />
        </a-form-item>
        <a-form-item label="说明">
          <a-input v-model="form.description" />
        </a-form-item>
        <a-form-item label="启用">
          <a-switch v-model="form.isEnabled" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:visible="candidatesVisible"
      :title="`${providerLabel(selectedIntegration?.provider || '')} 人员接入审批`"
      :width="1080"
      :footer="false"
    >
      <a-table
        :loading="candidatesLoading"
        :data="candidates"
        :pagination="false"
        row-key="id"
        border
        stripe
        class="candidate-table"
        :scroll="{ x: 980 }"
      >
        <a-table-column label="姓名" :width="120">
          <template #default="{ row }"><strong>{{ row.realName }}</strong></template>
        </a-table-column>
        <a-table-column label="电话" :width="130"><template #default="{ row }">{{ row.phone || '-' }}</template></a-table-column>
        <a-table-column label="邮箱" :min-width="180"><template #default="{ row }">{{ row.email || '-' }}</template></a-table-column>
        <a-table-column label="部门" :width="130"><template #default="{ row }">{{ row.departmentName || '-' }}</template></a-table-column>
        <a-table-column label="岗位" :min-width="160">
          <template #default="{ row }">{{ row.positionNames?.join('、') || '-' }}</template>
        </a-table-column>
        <a-table-column label="状态" :width="92" align="center">
          <template #default="{ row }">
            <a-tag :color="statusColor(row.status)" size="small">{{ statusLabel(row.status) }}</a-tag>
          </template>
        </a-table-column>
        <a-table-column label="平台账号" :width="120">
          <template #default="{ row }">{{ row.approvedUser?.realName || '-' }}</template>
        </a-table-column>
        <a-table-column label="操作" :width="132" fixed="right">
          <template #default="{ row }">
            <a-space v-if="row.status === 'Pending'" size="mini" :wrap="false">
              <a-button type="primary" size="mini" @click="openApprove(row)">通过</a-button>
              <a-button status="danger" size="mini" @click="rejectCandidate(row)">驳回</a-button>
            </a-space>
            <span v-else class="muted-text">已处理</span>
          </template>
        </a-table-column>
      </a-table>
    </a-modal>

    <a-modal
      v-model:visible="approveVisible"
      title="人员接入审批"
      :width="620"
      :confirm-loading="approving"
      ok-text="审批通过"
      cancel-text="取消"
      @ok="approveCandidate"
    >
      <a-form :model="approveForm" layout="vertical">
        <a-grid :cols="2" :col-gap="12" :row-gap="8">
          <a-grid-item>
            <a-form-item label="平台用户名">
              <a-input v-model="approveForm.username" />
            </a-form-item>
          </a-grid-item>
          <a-grid-item>
            <a-form-item label="归属部门">
              <a-select v-model="approveForm.departmentId" allow-clear filterable placeholder="可选">
                <a-option
                  v-for="item in departmentOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </a-select>
            </a-form-item>
          </a-grid-item>
        </a-grid>
        <a-form-item label="岗位角色">
          <a-select
            v-model="approveForm.roleIds"
            multiple
            allow-clear
            filterable
            placeholder="可多选，用于平台权限"
          >
            <a-option
              v-for="role in roleOptions"
              :key="role.id"
              :label="`${role.roleName} (${role.roleCode})`"
              :value="role.id"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="岗位名称">
          <a-input v-model="approveForm.positionsText" placeholder="多个岗位用顿号或逗号分隔" />
        </a-form-item>
        <a-form-item label="审批意见">
          <a-textarea v-model="approveForm.comment" :auto-size="{ minRows: 2, maxRows: 4 }" />
        </a-form-item>
      </a-form>
    </a-modal>
  </section>
</template>

<style scoped lang="scss">
.integration-page {
  min-height: 0;
}

.integration-table,
.candidate-table {
  border-radius: 0;
  overflow: hidden;
}

.integration-table :deep(.arco-table-th),
.integration-table :deep(.arco-table-cell),
.candidate-table :deep(.arco-table-th),
.candidate-table :deep(.arco-table-cell) {
  padding: 8px 10px;
  font-size: 12px;
}

code {
  display: block;
  max-width: 100%;
  overflow: hidden;
  color: #4e5969;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted-text {
  color: var(--color-text-3);
  font-size: 12px;
}
</style>
