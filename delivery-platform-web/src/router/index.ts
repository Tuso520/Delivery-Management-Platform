import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import BasicLayout from '@/layouts/BasicLayout.vue'
import NotFound from '@/views/NotFound.vue'
import type { MenuItem } from '@/store/permission'

export const menuItems: MenuItem[] = [
  {
    path: '/workspace',
    name: 'WorkspaceGroup',
    title: '工作台',
    icon: 'Monitor',
    children: [
      { path: '/dashboard', name: 'Dashboard', title: '数据看板', icon: 'DataLine', permissions: ['dashboard:view'] },
      { path: '/todo', name: 'Todo', title: '我的待办', icon: 'BellFilled', permissions: ['todo:view'] },
    ],
  },
  {
    path: '/delivery',
    name: 'DeliveryGroup',
    title: '项目管理',
    icon: 'FolderOpened',
    children: [
      { path: '/project', name: 'Project', title: '项目台账', icon: 'Folder', permissions: ['project:view'] },
      { path: '/archive', name: 'Archive', title: '项目档案', icon: 'Files', permissions: ['archive:view'] },
      { path: '/review', name: 'Review', title: '文件审核', icon: 'CircleCheck', permissions: ['file:review'] },
      { path: '/report', name: 'Report', title: '工时与日报', icon: 'EditPen', permissions: ['report:view'] },
      { path: '/retrospective', name: 'Retrospective', title: '项目复盘', icon: 'Refresh', permissions: ['retrospective:view'] },
    ],
  },
  {
    path: '/knowledge-center',
    name: 'KnowledgeGroup',
    title: '标准与知识',
    icon: 'Reading',
    children: [
      { path: '/workflow', name: 'Workflow', title: '交付流程', icon: 'Share', permissions: ['workflow:view'] },
      { path: '/checklist', name: 'Checklist', title: '检查模板', icon: 'List', permissions: ['checklist:view'] },
      { path: '/archive-template', name: 'ArchiveTemplate', title: '档案模板', icon: 'Collection', permissions: ['archive_template:view'] },
      { path: '/template', name: 'Template', title: '文档模板', icon: 'CopyDocument', permissions: ['template:view'] },
      { path: '/knowledge', name: 'Knowledge', title: '知识库', icon: 'Notebook', permissions: ['knowledge:view'] },
      { path: '/tools', name: 'Tools', title: '工具中心', icon: 'Tools', permissions: ['tools:view'] },
      { path: '/training', name: 'Training', title: '培训记录', icon: 'School', permissions: ['training:view'] },
    ],
  },
  {
    path: '/performance',
    name: 'PerformanceGroup',
    title: '绩效与团队',
    icon: 'TrendCharts',
    children: [
      { path: '/okr', name: 'Okr', title: '目标与绩效', icon: 'Aim', permissions: ['okr:view'] },
      { path: '/skills', name: 'Skills', title: '技能评估', icon: 'Medal', permissions: ['skill:view'] },
    ],
  },
  {
    path: '/organization',
    name: 'OrganizationGroup',
    title: '组织与权限',
    icon: 'Connection',
    children: [
      { path: '/organization/departments', name: 'Departments', title: '组织架构', icon: 'Share', permissions: ['department:view'] },
      { path: '/organization/users', name: 'Users', title: '用户管理', icon: 'User', permissions: ['user:view'] },
      { path: '/organization/roles', name: 'Roles', title: '角色权限', icon: 'Avatar', permissions: ['role:view'] },
    ],
  },
  {
    path: '/operations',
    name: 'OperationsGroup',
    title: '系统设置',
    icon: 'Setting',
    children: [
      { path: '/global/country', name: 'Country', title: '国家配置', icon: 'Flag', permissions: ['country:view'] },
      { path: '/global/currency', name: 'Currency', title: '币种与汇率', icon: 'Coin', permissions: ['currency:view'] },
      { path: '/global/language', name: 'Language', title: '语言与翻译', icon: 'ChatDotSquare', permissions: ['language:view'] },
      { path: '/operations/notification', name: 'Notifications', title: '通知规则', icon: 'Bell', permissions: ['notification:view'] },
      { path: '/operations/approval', name: 'Approvals', title: '审批配置', icon: 'Finished', permissions: ['approval:view'] },
      { path: '/operations/logs', name: 'Logs', title: '操作日志', icon: 'Tickets', permissions: ['system:view_log'] },
      { path: '/operations/config', name: 'SystemConfig', title: '系统参数', icon: 'Operation', permissions: ['system:manage_config'] },
      { path: '/operations/storage', name: 'Storage', title: '存储备份', icon: 'Box', permissions: ['system:view_storage', 'system:manage_backup'] },
      { path: '/operations/integrations', name: 'Integrations', title: '接口集成', icon: 'Link', permissions: ['integration:manage'] },
    ],
  },
]

const children: RouteRecordRaw[] = [
  { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/dashboard/index.vue'), meta: { title: '数据看板', permissions: ['dashboard:view'] } },
  { path: 'todo', name: 'Todo', component: () => import('@/views/todo/index.vue'), meta: { title: '我的待办', permissions: ['todo:view'] } },
  { path: 'project', name: 'Project', component: () => import('@/views/project/index.vue'), meta: { title: '项目台账', permissions: ['project:view'] } },
  { path: 'project/create', name: 'ProjectCreate', component: () => import('@/views/project/create.vue'), meta: { title: '创建项目', hidden: true, permissions: ['project:create'] } },
  { path: 'project/detail/:id', name: 'ProjectDetail', component: () => import('@/views/project/detail.vue'), meta: { title: '项目详情', hidden: true, permissions: ['project:view'] } },
  { path: 'project/edit/:id', name: 'ProjectEdit', component: () => import('@/views/project/create.vue'), meta: { title: '编辑项目', hidden: true, permissions: ['project:update'] } },
  { path: 'archive', name: 'Archive', component: () => import('@/views/archive/index.vue'), meta: { title: '项目档案', permissions: ['archive:view'] } },
  { path: 'process-records', redirect: '/archive' },
  { path: 'review', name: 'Review', component: () => import('@/views/review/pending.vue'), meta: { title: '文件审核', permissions: ['file:review'] } },
  { path: 'report', name: 'Report', component: () => import('@/views/report/index.vue'), meta: { title: '工时与日报', permissions: ['report:view'] } },
  { path: 'report/create', name: 'ReportCreate', component: () => import('@/views/report/create.vue'), meta: { title: '撰写报告', hidden: true, permissions: ['report:create'] } },
  { path: 'report/detail/:id', name: 'ReportDetail', component: () => import('@/views/report/detail.vue'), meta: { title: '报告详情', hidden: true, permissions: ['report:view'] } },
  { path: 'retrospective', name: 'Retrospective', component: () => import('@/views/project/retrospective.vue'), meta: { title: '项目复盘', permissions: ['retrospective:view'] } },
  { path: 'workflow', name: 'Workflow', component: () => import('@/views/workflow/index.vue'), meta: { title: '交付流程', permissions: ['workflow:view'] } },
  { path: 'workflow/detail/:id', name: 'WorkflowDetail', component: () => import('@/views/workflow/detail.vue'), meta: { title: '流程文档详情', hidden: true, permissions: ['workflow:view'] } },
  { path: 'checklist', name: 'Checklist', component: () => import('@/views/checklist/template/index.vue'), meta: { title: '检查模板', permissions: ['checklist:view'] } },
  { path: 'checklist/template/:id', name: 'ChecklistTemplateDetail', component: () => import('@/views/checklist/template/template-detail.vue'), meta: { title: '模板检查项', hidden: true, permissions: ['checklist:view'] } },
  { path: 'archive-template', name: 'ArchiveTemplate', component: () => import('@/views/archive/template.vue'), meta: { title: '档案模板', permissions: ['archive_template:view'] } },
  { path: 'template', name: 'Template', component: () => import('@/views/template/index.vue'), meta: { title: '文档模板', permissions: ['template:view'] } },
  { path: 'template/create', name: 'TemplateCreate', component: () => import('@/views/template/detail.vue'), meta: { title: '创建模板', hidden: true, permissions: ['template:create'] } },
  { path: 'template/:id', name: 'TemplateDetail', component: () => import('@/views/template/detail.vue'), meta: { title: '模板详情', hidden: true, permissions: ['template:view'] } },
  { path: 'knowledge', name: 'Knowledge', component: () => import('@/views/knowledge/index.vue'), meta: { title: '知识库', permissions: ['knowledge:view'] } },
  { path: 'knowledge/create', name: 'KnowledgeCreate', component: () => import('@/views/knowledge/article.vue'), meta: { title: '创建知识条目', hidden: true, permissions: ['knowledge:create'] } },
  { path: 'knowledge/:id', name: 'KnowledgeArticle', component: () => import('@/views/knowledge/article.vue'), meta: { title: '知识条目详情', hidden: true, permissions: ['knowledge:view'] } },
  { path: 'tools', name: 'Tools', component: () => import('@/views/tools/index.vue'), meta: { title: '工具中心', permissions: ['tools:view'] } },
  { path: 'okr', name: 'Okr', component: () => import('@/views/okr/index.vue'), meta: { title: 'OKR目标', permissions: ['okr:view'] } },
  { path: 'okr/edit', name: 'OkrEdit', component: () => import('@/views/okr/edit.vue'), meta: { title: '编辑目标', hidden: true, permissions: ['okr:create'] } },
  { path: 'okr/scoring', name: 'OkrScoring', component: () => import('@/views/okr/scoring.vue'), meta: { title: '目标评分', hidden: true, permissions: ['okr:score'] } },
  { path: 'skills', name: 'Skills', component: () => import('@/views/workforce/skills.vue'), meta: { title: '技能评估', permissions: ['skill:view'] } },
  { path: 'training', name: 'Training', component: () => import('@/views/workforce/training.vue'), meta: { title: '培训记录', permissions: ['training:view'] } },
  { path: 'global/country', name: 'Country', component: () => import('@/views/country/index.vue'), meta: { title: '国家配置', permissions: ['country:view'] } },
  { path: 'global/currency', name: 'Currency', component: () => import('@/views/currency/index.vue'), meta: { title: '币种与汇率', permissions: ['currency:view'] } },
  { path: 'global/language', name: 'Language', component: () => import('@/views/language/index.vue'), meta: { title: '语言与翻译', permissions: ['language:view'] } },
  { path: 'organization/departments', name: 'Departments', component: () => import('@/views/organization/departments.vue'), meta: { title: '组织架构', permissions: ['department:view'] } },
  { path: 'organization/users', name: 'Users', component: () => import('@/views/system/user/index.vue'), meta: { title: '用户管理', permissions: ['user:view'] } },
  { path: 'organization/roles', name: 'Roles', component: () => import('@/views/system/role/index.vue'), meta: { title: '角色权限', permissions: ['role:view'] } },
  { path: 'operations/notification', name: 'Notifications', component: () => import('@/views/system/notification.vue'), meta: { title: '通知规则', permissions: ['notification:view'] } },
  { path: 'operations/approval', name: 'Approvals', component: () => import('@/views/system/approvals.vue'), meta: { title: '审批配置', permissions: ['approval:view'] } },
  { path: 'operations/logs', name: 'Logs', component: () => import('@/views/system/logs.vue'), meta: { title: '操作日志', permissions: ['system:view_log'] } },
  { path: 'operations/config', name: 'SystemConfig', component: () => import('@/views/system/config.vue'), meta: { title: '系统参数', permissions: ['system:manage_config'] } },
  { path: 'operations/storage', name: 'Storage', component: () => import('@/views/system/storage.vue'), meta: { title: '存储备份', permissions: ['system:view_storage', 'system:manage_backup'] } },
  { path: 'operations/integrations', name: 'Integrations', component: () => import('@/views/system/integrations.vue'), meta: { title: '接口集成', permissions: ['integration:manage'] } },
  { path: 'system/integrations', redirect: '/operations/integrations', meta: { hidden: true } },
]

export const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'Login', component: () => import('@/views/login/index.vue'), meta: { title: '登录', hidden: true } },
  { path: '/preview', name: 'PreviewRedirect', component: () => import('@/views/preview/redirect.vue'), meta: { title: '在线预览', hidden: true } },
  { path: '/', component: BasicLayout, redirect: '/dashboard', children },
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: NotFound, meta: { title: '404', hidden: true } },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ left: 0, top: 0 }),
})

export default router
