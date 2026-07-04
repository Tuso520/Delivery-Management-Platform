<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { approvalApi } from '@/api/platform'
import { countryApi } from '@/api/country'
import { roleApi } from '@/api/role'
import { userApi } from '@/api/user'
import type { ApprovalStep, ApprovalTask, ApprovalTemplate } from '@/types/platform'
import type { Country } from '@/types/country'
import type { Role } from '@/types/role'
import type { UserListItem } from '@/types/user'
import { getApprovalBusinessLabel } from '@/utils/approval'

const loading = ref(false)
const activeTab = ref('templates')
const templates = ref<ApprovalTemplate[]>([])
const tasks = ref<ApprovalTask[]>([])
const roles = ref<Role[]>([])
const users = ref<UserListItem[]>([])
const countries = ref<Country[]>([])
const dialogVisible = ref(false)
const form = ref({
  templateCode: '',
  templateName: '',
  businessType: 'report',
  countryCode: '',
  isEnabled: true,
  steps: [{ stepOrder: 1, stepName: '负责人审核', approverType: 'role', approverValue: '' }] as ApprovalStep[],
})
const businessOptions = [
  { value: 'report', label: '工作报告' },
  { value: 'knowledge', label: '知识发布' },
  { value: 'checklist', label: '检查模板记录 '},
  { value: 'process_record', label: '项目过程记录' },
  { value: 'performance', label: '绩效评分' },
]

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [templatePage, taskPage, roleList, userPage, countryPage] = await Promise.all([
      approvalApi.getTemplates({ page: 1, pageSize: 100 }),
      approvalApi.getTasks({ page: 1, pageSize: 100 }),
      roleApi.getList(),
      userApi.getList({ page: 1, pageSize: 100, status: 'Active' }),
      countryApi.getList({ page: 1, pageSize: 100 }),
    ])
    templates.value = templatePage.list
    tasks.value = taskPage.list
    roles.value = roleList
    users.value = userPage.list
    countries.value = countryPage.list
  } finally {
    loading.value = false
  }
}

function openTemplate(row?: ApprovalTemplate): void {
  form.value = row
    ? {
        templateCode: row.templateCode,
        templateName: row.templateName,
        businessType: row.businessType,
        countryCode: row.countryCode ?? '',
        isEnabled: row.isEnabled,
        steps: row.steps.map((step) => ({ ...step })),
      }
    : {
        templateCode: '',
        templateName: '',
        businessType: 'report',
        countryCode: '',
        isEnabled: true,
        steps: [{ stepOrder: 1, stepName: '负责人审核', approverType: 'role', approverValue: '' }],
      }
  dialogVisible.value = true
}

function addStep(): void {
  form.value.steps.push({
    stepOrder: form.value.steps.length + 1,
    stepName: `第 ${form.value.steps.length + 1} 步审核`,
    approverType: 'role',
    approverValue: '',
  })
}

async function saveTemplate(): Promise<void> {
  await approvalApi.saveTemplate(form.value)
  Message.success('审批模板已保存')
  dialogVisible.value = false
  await fetchData()
}

async function decide(task: ApprovalTask, decision: 'Approved' | 'Rejected'): Promise<void> {
  try {
    const result = await arcoPrompt(
      decision === 'Approved' ? '可填写审批意见' : '请填写驳回原因',
      decision === 'Approved' ? '审批通过' : '驳回审批',
      {
        inputType: 'textarea',
        inputValidator: (value) =>
          decision === 'Rejected' && !value.trim() ? '驳回时必须填写原因' : true,
      },
    )
    await approvalApi.decide(task.id, {
      decision,
      comment: result.value.trim() || undefined,
    })
    Message.success(decision === 'Approved' ? '审批已通过' : '审批已驳回')
    await fetchData()
  } catch {
    // User cancelled the decision dialog.
  }
}

onMounted(fetchData)
</script>

<template>
  <section v-loading="loading" class="resource-page">
    <div class="page-toolbar">
      <div><h2>审批配置</h2><p>配置报告、知识发布、项目过程记录和绩效评分的审批步骤</p></div>
      <a-button v-if="activeTab === 'templates'" type="primary" @click="openTemplate()">
        新建模板
      </a-button>
    </div>
    <a-tabs v-model="activeTab">
      <a-tab-pane label="审批模板" name="templates">
        <a-table :data="templates" border stripe>
          <a-table-column prop="templateCode" label="编码" :width="170" />
          <a-table-column prop="templateName" label="名称" :min-width="180" />
          <a-table-column label="业务类型" :width="130">
            <template #default="{ row }">
              {{ businessOptions.find(item => item.value === row.businessType)?.label || row.businessType }}
            </template>
          </a-table-column>
          <a-table-column label="审批步骤" :min-width="260">
            <template #default="{ row }">
              <a-tag v-for="step in row.steps" :key="step.id || step.stepOrder" class="step-tag">
                {{ step.stepOrder }}. {{ step.stepName }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column label="启用" :width="80">
            <template #default="{ row }">
              <a-tag :type="row.isEnabled ? 'success' : 'info'">
                {{ row.isEnabled ? '是' : '否' }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column label="操作" :width="90">
            <template #default="{ row }">
              <a-button text type="primary" @click="openTemplate(row)">
                编辑
              </a-button>
            </template>
          </a-table-column>
        </a-table>
      </a-tab-pane>
      <a-tab-pane label="审批任务" name="tasks">
        <a-table :data="tasks" border stripe>
          <a-table-column type="expand">
            <template #default="{ row }">
              <a-timeline class="approval-history">
                <a-timeline-item
                  v-for="action in row.actions"
                  :key="action.id"
                  :timestamp="action.createdAt"
                >
                  第{{ action.stepOrder }} 步 · {{ action.actor.realName }} / {{ action.action }}
                  <span v-if="action.comment">：{{ action.comment }}</span>
                </a-timeline-item>
              </a-timeline>
            </template>
          </a-table-column>
          <a-table-column prop="template.templateName" label="审批类型" :min-width="170" />
          <a-table-column prop="businessTitle" label="业务事项" :min-width="220" />
          <a-table-column label="业务" :width="110">
            <template #default="{ row }">
              {{ getApprovalBusinessLabel(row.businessType) }}
            </template>
          </a-table-column>
          <a-table-column prop="applicant.realName" label="申请人" :width="110" />
          <a-table-column prop="approver.realName" label="当前审批人" :width="120" />
          <a-table-column prop="currentStep" label="步骤" :width="80" />
          <a-table-column prop="status" label="状态" :width="100" />
          <a-table-column prop="createdAt" label="创建时间" :width="180" />
          <a-table-column label="操作" :width="140">
            <template #default="{ row }">
              <template v-if="row.status === 'Pending'">
                <a-button text status="success" type="secondary" @click="decide(row, 'Approved')">
                  通过
                </a-button>
                <a-button text status="danger" type="secondary" @click="decide(row, 'Rejected')">
                  驳回
                </a-button>
              </template>
            </template>
          </a-table-column>
        </a-table>
      </a-tab-pane>
    </a-tabs>

    <a-dialog v-model="dialogVisible" title="审批模板" width="720px">
      <a-form :model="form" label-width="100px">
        <a-form-item label="模板编码">
          <a-input v-model="form.templateCode" />
        </a-form-item>
        <a-form-item label="模板名称">
          <a-input v-model="form.templateName" />
        </a-form-item>
        <a-form-item label="业务类型">
          <a-select v-model="form.businessType">
            <a-option
              v-for="item in businessOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="适用国家">
          <a-select
            v-model="form.countryCode"
            clearable
            filterable
            placeholder="全部国家"
          >
            <a-option
              v-for="country in countries"
              :key="country.id"
              :label="country.nameZh"
              :value="country.countryCode"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="启用">
          <a-switch v-model="form.isEnabled" />
        </a-form-item>
        <a-form-item label="审批步骤">
          <div class="steps-editor">
            <div v-for="(step, index) in form.steps" :key="index" class="step-row">
              <a-input-number v-model="step.stepOrder" :min="1" controls-position="right" />
              <a-input v-model="step.stepName" placeholder="步骤名称" />
              <a-select v-model="step.approverType" @change="step.approverValue = ''">
                <a-option label="按角色" value="role" />
                <a-option label="指定人员" value="user" />
              </a-select>
              <a-select v-model="step.approverValue" filterable placeholder="选择审批人">
                <template v-if="step.approverType === 'role'">
                  <a-option
                    v-for="role in roles"
                    :key="role.id"
                    :label="role.roleName"
                    :value="role.roleCode"
                  />
                </template>
                <template v-else>
                  <a-option
                    v-for="user in users"
                    :key="user.id"
                    :label="user.realName"
                    :value="user.id"
                  />
                </template>
              </a-select>
              <a-button status="danger" type="secondary" text @click="form.steps.splice(index, 1)">
                删除
              </a-button>
            </div>
            <a-button @click="addStep">
              增加步骤
            </a-button>
          </div>
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button type="primary" @click="saveTemplate">
          保存
        </a-button>
      </template>
    </a-dialog>
  </section>
</template>

<style scoped lang="scss">
.step-tag { margin:2px 4px 2px 0; }
.steps-editor { width:100%; display:grid; gap:10px; }
.step-row { display:grid; grid-template-columns:90px 1fr 110px 180px auto; gap:8px; }
.approval-history { padding:8px 24px 0; }
@media (max-width: 760px) {
  .step-row { grid-template-columns:1fr; }
}
</style>
