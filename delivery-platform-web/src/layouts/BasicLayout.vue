<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'
import { useAppStore } from '@/store/app'
import {
  resolveActiveMenuPath,
  usePermissionStore,
} from '@/store/permission'
import { useLocaleStore } from '@/store/locale'
import { menuItems } from '@/router'
import type { LocaleCode } from '@/store/locale'
import AppHeader from './components/AppHeader.vue'
import AppSidebar from './components/AppSidebar.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const appStore = useAppStore()
const permissionStore = usePermissionStore()
const localeStore = useLocaleStore()
const { t } = useI18n()
const isMobile = ref(false)

permissionStore.setMenus(menuItems)

const sidebarCollapsed = computed(() => appStore.sidebarCollapsed)
const filteredMenus = computed(() => permissionStore.filteredMenus)
const activeMenu = computed(() =>
  resolveActiveMenuPath(filteredMenus.value, route.path),
)
const userName = computed(() =>
  userStore.userInfo?.realName || userStore.userInfo?.username || '用户',
)

const breadcrumbs = computed(() => {
  const matched = route.matched.filter((item) => item.path !== '/')
  return matched.map((item) => ({
    path: item.path,
    title: (item.meta?.title as string) || '',
  }))
})

const routeTitleKeys: Record<string, string> = {
  Dashboard: 'menu.dashboard',
  Todo: 'menu.todo',
  Project: 'menu.project',
  Archive: 'menu.archive',
  ProcessRecords: 'menu.processRecord',
  Review: 'menu.review',
  Report: 'menu.report',
  Retrospective: 'menu.retrospective',
  Workflow: 'menu.workflow',
  Checklist: 'menu.checklist',
  ArchiveTemplate: 'menu.archiveTemplate',
  Template: 'menu.template',
  Knowledge: 'menu.knowledge',
  Tools: 'menu.tools',
  Training: 'menu.training',
  Okr: 'menu.goalPerformance',
  Skills: 'menu.skills',
  Departments: 'menu.departments',
  Users: 'menu.user',
  Roles: 'menu.role',
  Country: 'menu.systemCountry',
  Currency: 'menu.systemCurrency',
  Language: 'menu.systemLanguage',
  Notifications: 'menu.systemNotification',
  Approvals: 'menu.systemApproval',
  Logs: 'menu.systemLogs',
  SystemConfig: 'menu.systemConfig',
  Storage: 'menu.systemStorage',
  Integrations: 'menu.systemIntegration',
}

const pageTitle = computed(() => {
  const routeName = typeof route.name === 'string' ? route.name : ''
  const translationKey = routeTitleKeys[routeName]
  if (translationKey) return t(translationKey)
  return breadcrumbs.value.at(-1)?.title || '工作台'
})

const pageDescriptionMap: Record<string, string> = {
  Dashboard: '实时查看项目进度、风险、档案、待办和合同回款。',
  Todo: '集中处理审批任务、通知和待办事项。',
  Project: '管理交付项目全生命周期、成员分工和关键里程碑。',
  ProjectCreate: '创建项目并配置交付范围、团队和计划。',
  ProjectEdit: '更新项目基础信息、成员和交付计划。',
  ProjectDetail: '查看项目进度、成员、回款和交付资料。',
  Archive: '跟踪项目档案目录、文件版本和审核状态。',
  ProcessRecords: '记录会议、进展、问题、文件和现场影像。',
  Review: '集中处理待审核文件和退回资料。',
  Report: '记录工时并沉淀日报、周报和月报。',
  ReportCreate: '填写项目工时、进展、风险和回款说明。',
  ReportDetail: '查看报告内容、工时和审批记录。',
  Retrospective: '沉淀项目经验并跟踪整改闭环。',
  Checklist: '维护标准检查项并跟踪项目执行情况。',
  ChecklistTemplateDetail: '配置检查项、证据要求和适用范围。',
  Workflow: '管理交付流程标准、作业步骤和风险提示。',
  WorkflowDetail: '查看流程文档、步骤和关联资料。',
  ArchiveTemplate: '配置项目档案目录和适用范围。',
  Template: '管理交付过程中的标准文档模板。',
  TemplateCreate: '创建可复用的交付文档模板。',
  TemplateDetail: '查看、维护和下载标准文档模板。',
  Knowledge: '沉淀多专业交付知识、附件和最佳实践。',
  KnowledgeCreate: '编写知识条目并关联附件和业务范围。',
  KnowledgeArticle: '查看知识正文、版本和可在线预览的附件。',
  Tools: '集中访问交付计算、校验和辅助工具。',
  Training: '管理培训计划、资料、录屏和完成记录。',
  Okr: '构建 OKR 与 KPI，并配置评分流程和计算方式。',
  OkrEdit: '维护目标、指标、评分人和评分规则。',
  MonthlyPerformance: '执行绩效评分并查看计算结果。',
  Skills: '维护团队技能矩阵和季度评估。',
  Departments: '维护组织层级、负责人和人员归属。',
  Users: '管理组织用户、状态和角色授权。',
  Roles: '维护模块操作权限和系统访问边界。',
  Country: '维护国家、区域和本地化交付配置。',
  Currency: '维护币种、汇率和金额折算规则。',
  Language: '维护中文基准文本和多语言翻译。',
  Notifications: '配置通知规则和消息触达策略。',
  Approvals: '配置业务审批步骤并处理审批任务。',
  Logs: '查看敏感操作、权限变更和系统审计记录。',
  SystemConfig: '维护系统参数、通知和集成配置。',
  Storage: '查看对象存储状态并执行数据库备份。',
  Integrations: '维护第三方接口配置和启停状态。',
}

const pageDescription = computed(() => {
  const routeName = typeof route.name === 'string' ? route.name : ''
  if (localeStore.currentLocale === 'en-US') {
    return 'Delivery management workspace'
  }
  return pageDescriptionMap[routeName] || '交付管理平台'
})

function handleMenuSelect(path: string): void {
  router.push(path)
  if (isMobile.value) {
    appStore.setSidebarCollapsed(true)
  }
}

function handleLanguageChange(locale: LocaleCode): void {
  localeStore.setLocale(locale)
}

function handleLogout(): void {
  userStore.logout()
}

function syncViewport(): void {
  isMobile.value = window.innerWidth <= 900
  if (isMobile.value) {
    appStore.setSidebarCollapsed(true)
  }
}

onMounted(() => {
  syncViewport()
  window.addEventListener('resize', syncViewport)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)
})
</script>

<template>
  <div class="basic-layout">
    <AppSidebar
      :collapsed="sidebarCollapsed"
      :active-menu="activeMenu"
      :menus="filteredMenus"
      :menu-ready="userStore.profileInitialized"
      @select="handleMenuSelect"
      @toggle="appStore.toggleSidebar"
    />
    <button
      v-if="isMobile && !sidebarCollapsed"
      class="drawer-backdrop"
      type="button"
      aria-label="关闭菜单"
      @click="appStore.setSidebarCollapsed(true)"
    />

    <div class="layout-content">
      <AppHeader
        :sidebar-collapsed="sidebarCollapsed"
        :page-title="pageTitle"
        :page-description="pageDescription"
        :breadcrumbs="breadcrumbs"
        :user-name="userName"
        :current-locale="localeStore.currentLocale"
        @toggle-sidebar="appStore.toggleSidebar"
        @language-change="handleLanguageChange"
        @logout="handleLogout"
      />

      <main class="layout-main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.basic-layout {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100dvh;
  min-height: 100dvh;
  background: var(--color-fill-1);
  overflow: hidden;
}

.layout-main {
  width: 100%;
  min-height: 0;
  flex: 1 1 auto;
  min-width: 0;
  padding: 8px;
  background: var(--color-fill-1);
  overflow: auto;
}

.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  border: 0;
  background: rgba(29, 33, 41, 0.42);
}

.layout-content {
  width: 0;
  height: 100%;
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

@media (max-width: 900px) {
  .layout-main {
    padding: 6px;
  }
}
</style>
