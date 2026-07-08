<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { systemOperationsApi } from '@/api/platform'
import type { IntegrationConfig } from '@/types/platform'

const loading = ref(false)
const records = ref<IntegrationConfig[]>([])
const dialogVisible = ref(false)
const editingId = ref('')
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
})
const providerOptions = [
  { value: 'enterprise_wechat', label: '企业微信' },
  { value: 'feishu', label: '飞书' },
  { value: 'email', label: '邮件 SMTP' },
  { value: 'aliyun_oss', label: '阿里云 OSS' },
  { value: 'webhook', label: 'Webhook' },
]

async function fetchRecords(): Promise<void> {
  loading.value = true
  try {
    records.value = await systemOperationsApi.getIntegrations()
  } finally {
    loading.value = false
  }
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
  }
  dialogVisible.value = true
}

function buildConfig(): Record<string, unknown> {
  if (form.value.provider === 'enterprise_wechat') {
    return {
      corpId: config.value.corpId,
      agentId: config.value.agentId,
      secret: config.value.secret,
      webhookUrl: config.value.webhookUrl,
    }
  }
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
  if (form.value.provider === 'feishu') {
    return {
      appId: config.value.appId,
      appSecret: config.value.appSecret,
      webhookUrl: config.value.webhookUrl,
      encryptKey: config.value.encryptKey,
      verificationToken: config.value.verificationToken,
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
  try {
    const payload = { ...form.value, configValue: buildConfig() }
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

onMounted(fetchRecords)
</script>

<template>
  <section class="resource-page">
    <div class="page-toolbar">
      <div><h2>接口集成</h2><p>维护第三方接口配置、启停状态和审计记录，密钥字段自动脱敏</p></div>
      <a-button type="primary" @click="openEditor()">
        新增集成
      </a-button>
    </div>
    <a-table
      v-loading="loading"
      :data="records"
      border
      stripe
    >
      <a-table-column label="服务商" :width="150">
        <template #default="{ row }">
          {{ providerOptions.find(item => item.value === row.provider)?.label || row.provider }}
        </template>
      </a-table-column>
      <a-table-column prop="configName" label="配置名称" :min-width="180" />
      <a-table-column prop="description" label="说明" :min-width="220" />
      <a-table-column label="配置摘要" :min-width="260">
        <template #default="{ row }">
          <code>{{ JSON.stringify(row.configValue) }}</code>
        </template>
      </a-table-column>
      <a-table-column label="启用" :width="90">
        <template #default="{ row }">
          <a-switch :model-value="row.isEnabled" @change="toggle(row)" />
        </template>
      </a-table-column>
      <a-table-column label="操作" :width="90">
        <template #default="{ row }">
          <a-button text type="primary" @click="openEditor(row)">
            编辑
          </a-button>
        </template>
      </a-table-column>
    </a-table>

    <a-dialog v-model="dialogVisible" title="接口配置" width="680px">
      <a-form :model="form" label-width="100px">
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
        <a-form-item label="配置名称">
          <a-input v-model="form.configName" />
        </a-form-item>
        <template v-if="form.provider === 'enterprise_wechat'">
          <a-form-item label="企业 ID">
            <a-input v-model="config.corpId" />
          </a-form-item>
          <a-form-item label="应用 AgentId">
            <a-input v-model="config.agentId" />
          </a-form-item>
          <a-form-item label="应用 Secret">
            <a-input v-model="config.secret" type="password" show-password />
          </a-form-item>
          <a-form-item label="群机器人">
            <a-input v-model="config.webhookUrl" placeholder="可选 Webhook URL" />
          </a-form-item>
        </template>
        <template v-else-if="form.provider === 'feishu'">
          <a-form-item label="App ID">
            <a-input v-model="config.appId" />
          </a-form-item>
          <a-form-item label="App Secret">
            <a-input v-model="config.appSecret" type="password" show-password />
          </a-form-item>
          <a-form-item label="机器人地址">
            <a-input v-model="config.webhookUrl" placeholder="飞书群机器人 Webhook" />
          </a-form-item>
          <a-form-item label="Encrypt Key">
            <a-input v-model="config.encryptKey" type="password" show-password />
          </a-form-item>
          <a-form-item label="校验 Token">
            <a-input v-model="config.verificationToken" type="password" show-password />
          </a-form-item>
        </template>
        <template v-else-if="form.provider === 'email'">
          <a-form-item label="SMTP 主机">
            <a-input v-model="config.host" placeholder="smtp.example.com" />
          </a-form-item>
          <a-form-item label="端口">
            <a-input-number v-model="config.port" :min="1" :max="65535" />
          </a-form-item>
          <a-form-item label="SSL/TLS">
            <a-switch v-model="config.secure" />
          </a-form-item>
          <a-form-item label="用户名">
            <a-input v-model="config.username" />
          </a-form-item>
          <a-form-item label="密码">
            <a-input v-model="config.password" type="password" show-password />
          </a-form-item>
          <a-form-item label="发件人">
            <a-input v-model="config.sender" placeholder="交付中心 &lt;delivery@example.com&gt;" />
          </a-form-item>
        </template>
        <template v-else-if="form.provider === 'aliyun_oss'">
          <a-form-item label="Endpoint">
            <a-input v-model="config.endpoint" />
          </a-form-item>
          <a-form-item label="Region">
            <a-input v-model="config.region" />
          </a-form-item>
          <a-form-item label="Bucket">
            <a-input v-model="config.bucket" />
          </a-form-item>
          <a-form-item label="AccessKey ID">
            <a-input v-model="config.accessKeyId" />
          </a-form-item>
          <a-form-item label="AccessKey Secret">
            <a-input v-model="config.accessKeySecret" type="password" show-password />
          </a-form-item>
        </template>
        <template v-else>
          <a-form-item label="请求地址">
            <a-input v-model="config.url" placeholder="https://..." />
          </a-form-item>
          <a-form-item label="请求方法">
            <a-segmented v-model="config.method" :options="['POST', 'PUT', 'PATCH']" />
          </a-form-item>
          <a-form-item label="鉴权方式">
            <a-select v-model="config.authType">
              <a-option label="无鉴权" value="none" />
              <a-option label="Bearer Token" value="bearer" />
              <a-option label="签名密钥" value="signature" />
            </a-select>
          </a-form-item>
          <a-form-item v-if="config.authType !== 'none'" label="凭据">
            <a-input v-model="config.token" type="password" show-password />
          </a-form-item>
        </template>
        <a-form-item label="说明">
          <a-input v-model="form.description" />
        </a-form-item>
        <a-form-item label="启用">
          <a-switch v-model="form.isEnabled" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button type="primary" @click="save">
          保存
        </a-button>
      </template>
    </a-dialog>
  </section>
</template>

<style scoped lang="scss">
code { display:block; overflow:hidden; color:#53615a; text-overflow:ellipsis; white-space:nowrap; }
</style>
