<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useUserStore } from '@/store/user'
import { useLocaleStore } from '@/store/locale'
import { dashboardApi } from '@/api/dashboard'
import type { DashboardOverview, UserProject } from '@/types/dashboard'
import {
  IconAlipayCircle as Coin,
  IconCheckCircle as CircleCheck,
  IconCheckSquare as DocumentChecked,
  IconExclamationCircleFill as WarningFilled,
  IconFolder as FolderOpened,
  IconPlayCircle as VideoPlay,
} from '@arco-design/web-vue/es/icon'
import StatCards from './components/StatCards.vue'
import StageDistribution from './components/StageDistribution.vue'
import StatusDistribution from './components/StatusDistribution.vue'
import RecentProjects from './components/RecentProjects.vue'
import DashboardOverviewBand from './components/DashboardOverviewBand.vue'
import PaymentOverview from './components/PaymentOverview.vue'
import { localizeProjectRisk, localizeProjectStatus } from '@/utils/project-localization'

type TagType = 'primary' | 'success' | 'warning' | 'danger' | 'info'

const userStore = useUserStore()
const localeStore = useLocaleStore()

const userInfo = computed(() => userStore.userInfo)

const loading = shallowRef(false)
const overview = shallowRef<DashboardOverview>({
  totalProjects: 0,
  activeProjects: 0,
  highRiskProjects: 0,
  delayedProjects: 0,
  pendingReviews: 0,
  avgCompletionRate: 0,
  byStatus: [],
  byStage: [],
  acceptedProjects: 0,
  draftProjects: 0,
  totalContractAmount: 0,
  totalPlannedPaymentAmount: 0,
  totalReceivedAmount: 0,
  outstandingPaymentAmount: 0,
  overduePaymentAmount: 0,
  overduePaymentCount: 0,
  paymentCompletionRate: 0,
  recentProjects: [],
})
const myProjects = shallowRef<UserProject[]>([])

const todayLabel = computed(() =>
  new Intl.DateTimeFormat(localeStore.currentLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date()),
)

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: '系统管理员',
  SYSTEM_ADMIN: '系统管理员',
  DELIVERY_MANAGER: '交付负责人',
  COUNTRY_MANAGER: '国家负责人',
  PROJECT_MANAGER: '项目经理',
  ELEC_LEADER: '电气负责人',
  ELEC_ENGINEER: '电气工程师',
  SOFTWARE_LEADER: '软件负责人',
  SOFTWARE_ENGINEER: '软件工程师',
  PURCHASE: '采购人员',
  FINANCE: '财务人员',
  HSE: '安全人员',
  STANDARD_ADMIN: '标准化管理员',
  PARTNER: '外部合作方',
}

const roleDescriptions: Record<string, string> = {
  SUPER_ADMIN: '请优先关注系统运行、用户权限、审批配置、备份状态和关键操作审计。',
  SYSTEM_ADMIN: '请优先关注系统运行、用户权限、审批配置、备份状态和关键操作审计。',
  DELIVERY_MANAGER: '这里汇总全局项目进度、阶段门、回款和高风险事项，请优先处理延期项目与待审核资料。',
  COUNTRY_MANAGER: '请关注所辖国家项目的现场进度、资料闭环、客户沟通和本地化交付风险。',
  PROJECT_MANAGER: '请优先确认负责项目的阶段进展、待审核资料、风险事项和回款节点，把卡点推进到下一责任人。',
  ELEC_LEADER: '请优先核对电气设计、安装调试资料、点表和现场问题闭环。',
  ELEC_ENGINEER: '请完成今日电气资料上传、点位核对和调试记录，确保版本可追溯。',
  SOFTWARE_LEADER: '请关注软件配置、联调验证、策略调试和远程问题闭环。',
  SOFTWARE_ENGINEER: '请更新软件配置和调试记录，补齐平台截图、点表和异常处理说明。',
  PURCHASE: '请跟进采购申请、供应商交期、到货验收和采购资料归档。',
  FINANCE: '请核对回款计划、逾期款项、币种折算和项目成本资料。',
  HSE: '请检查安全晨会、风险交底、现场影像和整改闭环。',
  STANDARD_ADMIN: '请维护流程、模板、知识库和工具中心，优先处理待发布和缺失标准。',
  PARTNER: '请查看授权项目资料和待补充文件，按要求提交交付证据。',
}

const rolePriority = [
  'SUPER_ADMIN',
  'SYSTEM_ADMIN',
  'DELIVERY_MANAGER',
  'COUNTRY_MANAGER',
  'PROJECT_MANAGER',
  'STANDARD_ADMIN',
  'ELEC_LEADER',
  'ELEC_ENGINEER',
  'SOFTWARE_LEADER',
  'SOFTWARE_ENGINEER',
  'PURCHASE',
  'FINANCE',
  'HSE',
  'PARTNER',
]

const primaryRole = computed(() => {
  const roles = userInfo.value?.roles || []
  return rolePriority.find((role) => roles.includes(role)) || roles[0] || ''
})

const userDisplayName = computed(() =>
  userInfo.value?.realName || userInfo.value?.username || '用户',
)

const dashboardHeadline = computed(() => {
  const roleLabel = roleLabels[primaryRole.value]
  return roleLabel
    ? `${roleLabel}，欢迎回来，${userDisplayName.value}`
    : `欢迎回来，${userDisplayName.value}`
})

const dashboardDescription = computed(() => {
  const roleDescription = roleDescriptions[primaryRole.value]
  return `今天是 ${todayLabel.value}，${roleDescription || '这里汇总当前项目、回款、进度和风险情况。'}`
})

const averageCompletionLabel = computed(() =>
  `${Math.round(overview.value.avgCompletionRate || 0)}%`,
)

const totalContractAmountLabel = computed(() =>
  new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(
    overview.value.totalContractAmount / 10000,
  ),
)

const statCards = computed(() => [
  {
    title: '项目总数',
    value: loading.value ? '--' : String(overview.value.totalProjects),
    icon: FolderOpened,
    color: '#165dff',
  },
  {
    title: '进行中项目',
    value: loading.value ? '--' : String(overview.value.activeProjects),
    icon: VideoPlay,
    color: '#00b42a',
  },
  {
    title: '延期项目',
    value: loading.value ? '--' : String(overview.value.delayedProjects),
    icon: DocumentChecked,
    color: '#ff7d00',
  },
  {
    title: '高风险项目',
    value: loading.value ? '--' : String(overview.value.highRiskProjects),
    icon: WarningFilled,
    color: '#f53f3f',
  },
  {
    title: '待审核资料',
    value: loading.value ? '--' : String(overview.value.pendingReviews),
    icon: CircleCheck,
    color: '#722ed1',
  },
  {
    title: '合同总额(万)',
    value: loading.value ? '--' : totalContractAmountLabel.value,
    icon: Coin,
    color: '#0fc6c2',
  },
])

const statusColors: Record<string, string> = {
  Draft: '#86909c',
  Active: '#165dff',
  Suspended: '#ff7d00',
  Delayed: '#f53f3f',
  Accepted: '#00b42a',
  Archived: '#6b7785',
  Closed: '#6b7785',
}

const riskTagType = (risk: string): TagType => {
  switch (risk) {
    case 'Critical': return 'danger'
    case 'High': return 'warning'
    case 'Medium': return 'primary'
    default: return 'info'
  }
}

const riskLabel = (risk: string) =>
  localizeProjectRisk(risk, localeStore.currentLocale)

const statusLabel = (status: string) =>
  localizeProjectStatus(status, localeStore.currentLocale)

const statusTagType = (status: string): TagType => {
  switch (status) {
    case 'Active': return 'primary'
    case 'Draft': return 'info'
    case 'Suspended': return 'warning'
    case 'Delayed': return 'danger'
    case 'Accepted': return 'success'
    default: return 'info'
  }
}

const fetchOverview = async () => {
  loading.value = true
  try {
    overview.value = await dashboardApi.getOverview()
  } catch {
    // Keep defaults
  } finally {
    loading.value = false
  }
}

const fetchMyProjects = async () => {
  try {
    myProjects.value = await dashboardApi.getMyProjects()
  } catch {
    myProjects.value = []
  }
}

onMounted(() => {
  fetchOverview()
  fetchMyProjects()
})
</script>

<template>
  <div class="dashboard-page">
    <DashboardOverviewBand
      :headline="dashboardHeadline"
      :description="dashboardDescription"
      :loading="loading"
      :average-completion-label="averageCompletionLabel"
      :active-project-count="overview.activeProjects"
      :project-count="myProjects.length"
    />

    <StatCards :cards="statCards" />

    <PaymentOverview
      :contract-amount="overview.totalContractAmount"
      :planned-amount="overview.totalPlannedPaymentAmount"
      :received-amount="overview.totalReceivedAmount"
      :outstanding-amount="overview.outstandingPaymentAmount"
      :overdue-amount="overview.overduePaymentAmount"
      :overdue-count="overview.overduePaymentCount"
      :completion-rate="overview.paymentCompletionRate"
    />

    <div class="distribution-grid">
      <StageDistribution :items="overview.byStage" />
      <StatusDistribution :items="overview.byStatus" :status-colors="statusColors" />
    </div>

    <section class="data-panel project-panel">
      <header class="panel-header">
        <div>
          <h3 class="panel-title">
            我的项目
          </h3>
          <p class="panel-description">
            当前账号参与的交付项目
          </p>
        </div>
        <span class="panel-count">{{ myProjects.length }}</span>
      </header>
      <div class="panel-body table-body">
        <a-table
          v-loading="loading"
          :data="myProjects.slice(0, 8)"
          stripe
          size="small"
        >
          <a-table-column
            prop="projectName"
            label="项目名称"
            :min-width="240"
            show-overflow-tooltip
          />
          <a-table-column prop="countryCode" label="国家" :width="90" />
          <a-table-column prop="projectStatus" label="状态" :width="110">
            <template #default="{ row }">
              {{ statusLabel(row.projectStatus) }}
            </template>
          </a-table-column>
          <a-table-column prop="role" label="项目角色" :min-width="150" />
        </a-table>
        <a-empty v-if="myProjects.length === 0 && !loading" description="暂无参与的项目" />
      </div>
    </section>

    <RecentProjects
      :projects="overview.recentProjects"
      :loading="loading"
      :status-tag-type="statusTagType"
      :risk-tag-type="riskTagType"
      :status-label="statusLabel"
      :risk-label="riskLabel"
    />
  </div>
</template>

<style scoped lang="scss">
.dashboard-page {
  width: 100%;
  min-width: 0;
}

.distribution-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
  margin-bottom: 18px;
}

.data-panel {
  min-width: 0;
  border: 1px solid #e5e6eb;
  border-radius: 0;
  background: #fff;
  overflow: hidden;
}

.project-panel {
  margin-bottom: 18px;
}

.panel-header {
  min-height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 20px;
  border-bottom: 1px solid #f2f3f5;
}

.panel-title {
  margin: 0;
  color: #1d2129;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.3;
}

.panel-description {
  margin: 4px 0 0;
  color: #86909c;
  font-size: 12px;
}

.panel-count {
  min-width: 30px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  border-radius: 0;
  background: #e8f3ff;
  color: #165dff;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.panel-body {
  min-height: 220px;
}

.table-body {
  padding: 4px 14px 14px;

  :deep(.arco-table) {
    --arco-table-border-color: #f2f3f5;
    --arco-table-header-bg-color: #f7f8fa;
    --arco-table-row-hover-bg-color: #f2f7f4;
    color: #4e5969;
  }

  :deep(.arco-table th.arco-table__cell) {
    color: #727e78;
    font-size: 12px;
    font-weight: 600;
  }
}

@media (max-width: 760px) {
  .distribution-grid {
    grid-template-columns: 1fr;
  }
}
</style>
