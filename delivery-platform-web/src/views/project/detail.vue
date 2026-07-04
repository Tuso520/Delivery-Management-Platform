<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { projectApi } from '@/api/project'
import { projectPaymentApi } from '@/api/project-payment'
import { userApi } from '@/api/user'
import type { Project, ProjectMember } from '@/types/project'
import {
  COUNTRY_OPTIONS,
  PROJECT_ROLE_OPTIONS,
} from '@/types/project'
import type { UserListItem } from '@/types/user'
import type { ProjectPayment, ProjectPaymentPayload } from '@/types/project-payment'
import type { TagType } from '@/types/ui'
import { useLocaleStore } from '@/store/locale'
import {
  localizeProjectRisk,
  localizeProjectStage,
  localizeProjectStatus,
} from '@/utils/project-localization'

const route = useRoute()
const router = useRouter()
const localeStore = useLocaleStore()

const projectId = route.params.id as string
const loading = ref(false)
const project = ref<Project | null>(null)
const memberList = ref<ProjectMember[]>([])
const userOptions = ref<UserListItem[]>([])
const memberDialogVisible = ref(false)
const memberForm = ref({ userId: '', projectRole: 'MEMBER' })
const paymentList = ref<ProjectPayment[]>([])
const paymentDialogVisible = ref(false)
const editingPaymentId = ref('')
const paymentForm = ref<ProjectPaymentPayload>({
  projectId,
  paymentName: '',
  originalAmount: 0,
  originalCurrency: 'CNY',
  convertedCurrency: 'CNY',
  receivedOriginalAmount: 0,
  dueDate: '',
  receivedDate: '',
  remark: '',
})

const fetchProject = async () => {
  loading.value = true
  try {
    const res = await projectApi.getById(projectId)
    project.value = res as unknown as Project
    memberList.value = (project.value as unknown as { members: ProjectMember[] }).members || []
    try {
      const payments = await projectPaymentApi.getList({
        page: 1,
        pageSize: 100,
        projectId,
      })
      paymentList.value = payments.list
    } catch {
      paymentList.value = []
    }
  } catch {
    project.value = null
  } finally {
    loading.value = false
  }
}

const handleEdit = () => {
  router.push(`/project/edit/${projectId}`)
}

const handleBack = () => {
  router.push('/project')
}

const handleRemoveMember = async (member: ProjectMember) => {
  try {
    await arcoConfirm(`确定移除成员"${member.user?.realName || member.userId}"？`, '确认', {
      type: 'warning',
    })
    await projectApi.removeMember(projectId, member.id)
    Message.success('移除成功')
    fetchProject()
  } catch {
    // cancelled
  }
}

const openAddMember = async () => {
  if (!userOptions.value.length) {
    const page = await userApi.getList({ page: 1, pageSize: 200, status: 'Active' })
    userOptions.value = page.list
  }
  memberForm.value = { userId: '', projectRole: 'MEMBER' }
  memberDialogVisible.value = true
}

const handleAddMember = async () => {
  if (!memberForm.value.userId) {
    Message.warning('请选择项目成员')
    return
  }
  await projectApi.addMember(projectId, memberForm.value)
  Message.success('项目成员已添加')
  memberDialogVisible.value = false
  await fetchProject()
}

const paymentStatusLabel: Record<string, string> = {
  Planned: '计划中',
  Invoiced: '已开票',
  PartiallyReceived: '部分回款',
  Received: '已回款',
  Overdue: '已逾期',
}

const openPayment = (payment?: ProjectPayment) => {
  editingPaymentId.value = payment?.id ?? ''
  paymentForm.value = payment
    ? {
        projectId,
        paymentName: payment.paymentName,
        paymentType: payment.paymentType,
        dueDate: payment.dueDate?.slice(0, 10) ?? '',
        originalAmount: payment.originalAmount,
        originalCurrency: payment.originalCurrency,
        convertedCurrency: payment.convertedCurrency,
        receivedOriginalAmount: payment.receivedOriginalAmount,
        receivedDate: payment.receivedDate?.slice(0, 10) ?? '',
        remark: payment.remark ?? '',
      }
    : {
        projectId,
        paymentName: '',
        originalAmount: 0,
        originalCurrency: project.value?.contractCurrency || 'CNY',
        convertedCurrency: project.value?.baseCurrency || 'CNY',
        receivedOriginalAmount: 0,
        dueDate: '',
        receivedDate: '',
        remark: '',
      }
  paymentDialogVisible.value = true
}

const savePayment = async () => {
  if (!paymentForm.value.paymentName || paymentForm.value.originalAmount <= 0) {
    Message.warning('请填写回款节点和应回款金额')
    return
  }
  if (editingPaymentId.value) {
    await projectPaymentApi.update(editingPaymentId.value, paymentForm.value)
  } else {
    await projectPaymentApi.create(paymentForm.value)
  }
  Message.success('回款记录已保存')
  paymentDialogVisible.value = false
  await fetchProject()
}

const getCountryLabel = (code: string): string => {
  return COUNTRY_OPTIONS.find((o) => o.value === code)?.label || code
}

const getStatusLabel = (status: string): string => {
  return localizeProjectStatus(status, localeStore.currentLocale)
}

const getStatusType = (status: string): TagType => {
  const map: Record<string, TagType> = { Draft: 'info', Active: 'success', Suspended: 'warning', Delayed: 'danger' }
  return map[status] || 'info'
}

onMounted(() => {
  fetchProject()
})
</script>

<template>
  <div class="project-detail-page">
    <div class="page-header">
      <a-button @click="handleBack">
        返回列表
      </a-button>
      <div class="header-actions">
        <a-button type="primary" @click="handleEdit">
          编辑
        </a-button>
      </div>
    </div>

    <a-card v-loading="loading">
      <template #header>
        <div class="card-header">
          <span class="card-title">{{ project?.projectName || '项目详情' }}</span>
          <a-tag v-if="project" :type="getStatusType(project.projectStatus)" size="small">
            {{ getStatusLabel(project.projectStatus) }}
          </a-tag>
        </div>
      </template>

      <template v-if="project">
        <a-descriptions :column="2" border>
          <a-descriptions-item label="项目编号" :span="1">
            {{ project.projectCode }}
          </a-descriptions-item>
          <a-descriptions-item label="项目名称" :span="1">
            {{ project.projectName }}
          </a-descriptions-item>
          <a-descriptions-item label="国家">
            {{ getCountryLabel(project.countryCode) }}
          </a-descriptions-item>
          <a-descriptions-item label="城市">
            {{ project.city || '-' }}
          </a-descriptions-item>
          <a-descriptions-item label="客户名称">
            {{ project.customerName || '-' }}
          </a-descriptions-item>
          <a-descriptions-item label="项目类型">
            {{ project.projectType || '-' }}
          </a-descriptions-item>
          <a-descriptions-item label="合同币种">
            {{ project.contractCurrency || '-' }}
          </a-descriptions-item>
          <a-descriptions-item label="基准币种">
            {{ project.baseCurrency || '-' }}
          </a-descriptions-item>
          <a-descriptions-item label="合同金额">
            <span v-if="project.contractAmount != null">
              {{ project.contractCurrency }} {{ project.contractAmount.toLocaleString() }}
            </span>
            <span v-else>-</span>
          </a-descriptions-item>
          <a-descriptions-item label="折算金额">
            <span v-if="project.convertedAmount != null">
              {{ project.baseCurrency }} {{ project.convertedAmount.toLocaleString() }}
            </span>
            <span v-else>-</span>
          </a-descriptions-item>
          <a-descriptions-item label="折算汇率">
            {{ project.exchangeRate ?? '-' }}
          </a-descriptions-item>
          <a-descriptions-item label="汇率日期">
            {{ project.exchangeRateDate ? new Date(project.exchangeRateDate).toLocaleDateString() : '-' }}
          </a-descriptions-item>
          <a-descriptions-item label="汇率来源">
            {{ project.exchangeRateSource || '-' }}
          </a-descriptions-item>
          <a-descriptions-item label="项目语言">
            {{ project.projectLanguage || '-' }}
          </a-descriptions-item>
          <a-descriptions-item label="当前阶段">
            {{ project.currentStage ? localizeProjectStage(project.currentStage, localeStore.currentLocale) : '-' }}
          </a-descriptions-item>
          <a-descriptions-item label="风险等级">
            <a-tag :type="project.riskLevel === 'Low' ? 'success' : project.riskLevel === 'Medium' ? 'warning' : 'danger'" size="small">
              {{ localizeProjectRisk(project.riskLevel, localeStore.currentLocale) }}
            </a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="开始日期">
            {{ project.startDate ? new Date(project.startDate).toLocaleDateString() : '-' }}
          </a-descriptions-item>
          <a-descriptions-item label="计划结束日期">
            {{ project.plannedEndDate ? new Date(project.plannedEndDate).toLocaleDateString() : '-' }}
          </a-descriptions-item>
          <a-descriptions-item label="实际结束日期">
            {{ project.actualEndDate ? new Date(project.actualEndDate).toLocaleDateString() : '-' }}
          </a-descriptions-item>
          <a-descriptions-item label="创建时间">
            {{ new Date(project.createdAt).toLocaleString() }}
          </a-descriptions-item>
          <a-descriptions-item label="更新时间">
            {{ new Date(project.updatedAt).toLocaleString() }}
          </a-descriptions-item>
        </a-descriptions>

        <a-divider />

        <div class="section-heading">
          <h3 class="section-title">
            项目成员 ({{ memberList.length }})
          </h3>
          <a-button type="primary" size="small" @click="openAddMember">
            添加成员
          </a-button>
        </div>
        <a-table :data="memberList" border stripe>
          <a-table-column prop="user?.realName" label="姓名" :min-width="120" />
          <a-table-column prop="user?.username" label="用户名" :width="120" />
          <a-table-column prop="user?.email" label="邮箱" :min-width="180" />
          <a-table-column prop="projectRole" label="项目角色" :width="140">
            <template #default="{ row }">
              {{ PROJECT_ROLE_OPTIONS.find((o) => o.value === row.projectRole)?.label || row.projectRole }}
            </template>
          </a-table-column>
          <a-table-column prop="permissionLevel" label="权限级别" :width="100" />
          <a-table-column label="操作" :width="100" fixed="right">
            <template #default="{ row }">
              <a-button
                text
                status="danger" type="secondary"
                size="small"
                @click="handleRemoveMember(row)"
              >
                移除
              </a-button>
            </template>
          </a-table-column>
        </a-table>

        <a-divider />
        <div class="section-heading">
          <h3 class="section-title">
            回款计划与到账          </h3>
          <a-button type="primary" size="small" @click="openPayment()">
            新增回款节点
          </a-button>
        </div>
        <a-table :data="paymentList" border stripe>
          <a-table-column prop="paymentName" label="回款节点" :min-width="160" />
          <a-table-column prop="dueDate" label="计划日期" :width="120">
            <template #default="{ row }">
              {{ row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '-' }}
            </template>
          </a-table-column>
          <a-table-column label="应回款" :width="150" align="right">
            <template #default="{ row }">
              {{ row.originalCurrency }} {{ row.originalAmount.toLocaleString() }}
            </template>
          </a-table-column>
          <a-table-column label="已回款" :width="150" align="right">
            <template #default="{ row }">
              {{ row.originalCurrency }} {{ row.receivedOriginalAmount.toLocaleString() }}
            </template>
          </a-table-column>
          <a-table-column label="状态" :width="110">
            <template #default="{ row }">
              <a-tag :type="row.status === 'Received' ? 'success' : row.status === 'Overdue' ? 'danger' : 'warning'">
                {{ paymentStatusLabel[row.status] || row.status }}
              </a-tag>
            </template>
          </a-table-column>
          <a-table-column label="操作" :width="90">
            <template #default="{ row }">
              <a-button text type="primary" @click="openPayment(row)">
                编辑
              </a-button>
            </template>
          </a-table-column>
        </a-table>
      </template>
    </a-card>

    <a-dialog v-model="memberDialogVisible" title="添加项目成员" width="520px">
      <a-form :model="memberForm" label-width="90px">
        <a-form-item label="员工">
          <a-select v-model="memberForm.userId" filterable style="width: 100%">
            <a-option
              v-for="user in userOptions"
              :key="user.id"
              :label="`${user.realName} (${user.username})`"
              :value="user.id"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="项目岗位">
          <a-select v-model="memberForm.projectRole" style="width: 100%">
            <a-option
              v-for="role in PROJECT_ROLE_OPTIONS"
              :key="role.value"
              :label="role.label"
              :value="role.value"
            />
          </a-select>
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="memberDialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" @click="handleAddMember">
          添加
        </a-button>
      </template>
    </a-dialog>

    <a-dialog v-model="paymentDialogVisible" :title="editingPaymentId ? '编辑回款记录' : '新增回款节点'" width="620px">
      <a-form :model="paymentForm" label-width="100px">
        <a-form-item label="回款节点" required>
          <a-input v-model="paymentForm.paymentName" placeholder="例如：设备到场款" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="计划日期">
              <a-date-picker v-model="paymentForm.dueDate" type="date" value-format="YYYY-MM-DD" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="到账日期">
              <a-date-picker v-model="paymentForm.receivedDate" type="date" value-format="YYYY-MM-DD" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="应回款">
              <a-input-number v-model="paymentForm.originalAmount" :min="0" :precision="2" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="已回款">
              <a-input-number v-model="paymentForm.receivedOriginalAmount" :min="0" :precision="2" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="原币币种">
              <a-input v-model="paymentForm.originalCurrency" disabled />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="折算币种">
              <a-input v-model="paymentForm.convertedCurrency" disabled />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="备注">
          <a-textarea v-model="paymentForm.remark" :rows="3" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="paymentDialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" @click="savePayment">
          保存
        </a-button>
      </template>
    </a-dialog>
  </div>
</template>

<style scoped lang="scss">
.project-detail-page {
  min-width: 0;

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .card-title {
    font-size: 16px;
    font-weight: 600;
  }

  .section-title {
    margin: 0 0 12px;
    font-size: 15px;
    font-weight: 600;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;

    .section-title {
      margin-bottom: 0;
    }
  }
}
</style>
