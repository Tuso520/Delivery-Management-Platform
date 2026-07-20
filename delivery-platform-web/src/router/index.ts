import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteLocationNormalizedLoaded, RouteRecordRaw } from 'vue-router'

import BasicLayout from '@/layouts/BasicLayout.vue'
import NotFound from '@/views/NotFound.vue'
import type { MenuItem } from '@/store/permission'

const loadSettingsCenter = () => import('@/views/system/settings-center.vue')
import i18n from '@/locales'

type NavigationSurface = 'main' | 'settings'

interface ShellRouteMeta {
  title: string
  icon?: string
  permissions?: string[]
  navigationGroup?: NavigationSurface
  menu?: boolean
  order?: number
  hidden?: boolean
}

function shellMeta(route: RouteRecordRaw): ShellRouteMeta {
  return (route.meta ?? {}) as unknown as ShellRouteMeta
}

function routePath(parentPath: string, path: string): string {
  if (path.startsWith('/')) return path
  const base = parentPath === '/' ? '' : parentPath.replace(/\/$/u, '')
  return `${base}/${path}`.replace(/\/+/gu, '/') || '/'
}

function routeName(route: RouteRecordRaw): string {
  return typeof route.name === 'string' ? route.name : route.path
}

export function buildNavigationFromRoutes(
  records: RouteRecordRaw[],
  surface: NavigationSurface,
): MenuItem[] {
  return records
    .filter((record) => shellMeta(record).navigationGroup === surface)
    .sort((left, right) => (shellMeta(left).order ?? 0) - (shellMeta(right).order ?? 0))
    .map((group) => {
      const groupMeta = shellMeta(group)
      const groupPath = routePath('/', group.path)
      const children = (group.children ?? [])
        .filter((child) => shellMeta(child).menu)
        .sort((left, right) => (shellMeta(left).order ?? 0) - (shellMeta(right).order ?? 0))
        .map((child) => {
          const meta = shellMeta(child)
          return {
            path: routePath(groupPath, child.path),
            name: routeName(child),
            title: meta.title,
            icon: meta.icon,
            permissions: meta.permissions,
          }
        })

      return {
        path: groupPath,
        name: routeName(group),
        title: groupMeta.title,
        icon: groupMeta.icon,
        children,
      }
    })
}

export function resolveRouteTitle(
  meta: RouteLocationNormalizedLoaded['meta'],
  locale: 'zh-CN' | 'en-US',
): string {
  const routeMeta = meta as unknown as ShellRouteMeta
  const key = routeMeta.title || 'menu.workspace'
  const segments = key.split('.')
  let message: unknown = i18n.global.getLocaleMessage(locale)
  for (const segment of segments) {
    if (!message || typeof message !== 'object' || !(segment in message)) return key
    message = (message as Record<string, unknown>)[segment]
  }
  return typeof message === 'string' ? message : key
}

const ProjectOverviewView = () => import('@/views/project/index.vue')
const ReviewView = () => import('@/views/review/pending.vue')
const ArchiveTemplateView = () => import('@/views/archive/template.vue')
const StandardView = () => import('@/views/standard/index.vue')
const KnowledgeView = () => import('@/views/knowledge/index.vue')

export const shellRoutes: RouteRecordRaw[] = [
  {
    path: 'workspace',
    name: 'WorkspaceGroup',
    redirect: '/dashboard',
    meta: {
      title: 'menu.workspace',
      icon: 'Monitor',
      navigationGroup: 'main',
      order: 10,
    },
    children: [
      {
        path: '/dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: {
          title: 'menu.dashboard',
          icon: 'DataLine',
          permissions: ['dashboard:view'],
          menu: true,
          order: 10,
        },
      },
      {
        path: '/review',
        name: 'Review',
        component: ReviewView,
        meta: {
          title: 'menu.review',
          icon: 'CircleCheck',
          menu: true,
          order: 20,
        },
      },
      {
        path: '/review/:taskId',
        name: 'ReviewDetail',
        component: ReviewView,
        meta: {
          title: 'menu.review',
          hidden: true,
        },
      },
    ],
  },
  {
    path: 'delivery',
    name: 'DeliveryGroup',
    redirect: '/projects',
    meta: {
      title: 'menu.projectGroup',
      icon: 'FolderOpened',
      navigationGroup: 'main',
      order: 20,
    },
    children: [
      {
        path: '/projects',
        name: 'Project',
        component: ProjectOverviewView,
        meta: {
          title: 'routes.projectOverview',
          icon: 'Folder',
          permissions: ['project:view'],
          menu: true,
          order: 10,
        },
      },
      {
        path: '/projects/create',
        name: 'ProjectCreate',
        component: ProjectOverviewView,
        meta: {
          title: 'routes.projectCreate',
          permissions: ['project:create'],
          hidden: true,
        },
      },
      {
        path: '/projects/:projectId/edit',
        name: 'ProjectEdit',
        component: ProjectOverviewView,
        meta: {
          title: 'routes.projectEdit',
          permissions: ['project:update'],
          hidden: true,
        },
      },
      {
        path: '/projects/:projectId',
        name: 'ProjectDetail',
        component: ProjectOverviewView,
        meta: {
          title: 'routes.projectDetail',
          permissions: ['project:view'],
          hidden: true,
        },
      },
      {
        path: '/archive',
        name: 'Archive',
        component: () => import('@/views/archive/index.vue'),
        meta: {
          title: 'menu.archive',
          icon: 'Files',
          permissions: ['archive:view'],
          menu: true,
          order: 20,
        },
      },
      {
        path: '/archive-template',
        name: 'ArchiveTemplate',
        component: ArchiveTemplateView,
        meta: {
          title: 'menu.archiveTemplate',
          icon: 'Collection',
          permissions: ['archive_template:view'],
          menu: true,
          order: 30,
        },
      },
      {
        path: '/archive-templates/:templateId',
        name: 'ArchiveTemplateDetail',
        component: ArchiveTemplateView,
        meta: {
          title: 'menu.archiveTemplate',
          permissions: ['archive_template:view'],
          hidden: true,
        },
      },
    ],
  },
  {
    path: 'standards-knowledge',
    name: 'KnowledgeGroup',
    redirect: '/standards',
    meta: {
      title: 'menu.standardKnowledge',
      icon: 'Reading',
      navigationGroup: 'main',
      order: 30,
    },
    children: [
      {
        path: '/standards',
        name: 'Standard',
        component: StandardView,
        meta: {
          title: 'menu.standard',
          icon: 'CopyDocument',
          permissions: ['standard:view'],
          menu: true,
          order: 10,
        },
      },
      {
        path: '/standards/:id([A-Za-z0-9_-]*[0-9_-][A-Za-z0-9_-]*)',
        name: 'StandardDetail',
        component: StandardView,
        meta: {
          title: 'menu.standard',
          permissions: ['standard:view'],
          hidden: true,
        },
      },
      {
        path: '/knowledge',
        name: 'Knowledge',
        component: KnowledgeView,
        meta: {
          title: 'menu.knowledge',
          icon: 'Notebook',
          permissions: ['knowledge:view'],
          menu: true,
          order: 20,
        },
      },
      {
        path: '/knowledge/:id([A-Za-z0-9_-]*[0-9_-][A-Za-z0-9_-]*)',
        name: 'KnowledgeDetail',
        component: KnowledgeView,
        meta: {
          title: 'menu.knowledge',
          permissions: ['knowledge:view'],
          hidden: true,
        },
      },
      {
        path: '/tools',
        name: 'Tools',
        component: () => import('@/views/tools/index.vue'),
        meta: {
          title: 'menu.tools',
          icon: 'Tools',
          permissions: ['tools:view'],
          menu: true,
          order: 30,
        },
      },
    ],
  },
  {
    path: 'settings',
    name: 'SettingsGroup',
    meta: {
      title: 'routes.settings',
      icon: 'Setting',
      navigationGroup: 'settings',
      order: 10,
    },
    children: [
      {
        path: '/settings',
        name: 'SettingsCenter',
        component: loadSettingsCenter,
        meta: {
          title: 'routes.settings',
          icon: 'Setting',
          permissions: [
            'settings:view', 'currency:view', 'notification_rule:view', 'approval_config:view',
            'audit_log:view', 'system_setting:view', 'integration:view',
          ],
          menu: true,
          order: 60,
        },
      },
      {
        path: 'fields',
        name: 'FieldSettings',
        component: () => import('@/views/system/FieldSettings.vue'),
        meta: {
          title: 'menu.systemFields',
          icon: 'List',
          permissions: ['field_setting:manage'],
          menu: true,
          order: 30,
        },
      },
      {
        path: 'currency',
        name: 'Currency',
        component: loadSettingsCenter,
        beforeEnter: () => ({ path: '/settings', hash: '#currency' }),
        meta: {
          title: 'menu.systemCurrency',
          icon: 'Coin',
          permissions: ['currency:view', 'currency:manage'],
          menu: true,
          hidden: true,
          order: 10,
        },
      },
      {
        path: 'notifications',
        name: 'Notifications',
        component: loadSettingsCenter,
        beforeEnter: () => ({ path: '/settings', hash: '#notifications' }),
        meta: {
          title: 'menu.systemNotification',
          icon: 'Bell',
          permissions: ['notification_rule:view', 'notification_rule:manage'],
          hidden: true,
          order: 20,
        },
      },
      {
        path: 'approvals',
        name: 'Approvals',
        component: loadSettingsCenter,
        beforeEnter: () => ({ path: '/settings', hash: '#approvals' }),
        meta: {
          title: 'menu.systemApproval',
          icon: 'Finished',
          permissions: ['approval_config:view', 'approval_config:manage'],
          menu: true,
          hidden: true,
          order: 20,
        },
      },
      {
        path: 'logs',
        name: 'Logs',
        component: loadSettingsCenter,
        beforeEnter: () => ({ path: '/settings', hash: '#logs' }),
        meta: {
          title: 'menu.systemLogs',
          icon: 'Tickets',
          permissions: ['audit_log:view'],
          hidden: true,
          order: 40,
        },
      },
      {
        path: 'system',
        name: 'SystemConfig',
        component: loadSettingsCenter,
        beforeEnter: () => ({ path: '/settings', hash: '#system' }),
        meta: {
          title: 'menu.systemConfig',
          icon: 'Operation',
          permissions: ['system_setting:view', 'system_setting:manage'],
          menu: true,
          hidden: true,
          order: 50,
        },
      },
      {
        path: 'integrations',
        name: 'Integrations',
        component: loadSettingsCenter,
        beforeEnter: () => ({ path: '/settings', hash: '#integrations' }),
        meta: {
          title: 'menu.systemIntegration',
          icon: 'Link',
          permissions: ['integration:view', 'integration:manage'],
          menu: true,
          hidden: true,
          order: 40,
        },
      },
    ],
  },

  // 组织与权限仍是目标后台能力，但不进入主导航。
  {
    path: 'organization/departments',
    name: 'Departments',
    component: () => import('@/views/organization/departments.vue'),
    meta: { title: 'routes.departments', permissions: ['department:view'], hidden: true },
  },
  {
    path: 'organization/users',
    name: 'Users',
    component: () => import('@/views/system/user/index.vue'),
    meta: { title: 'routes.users', permissions: ['user:view'], hidden: true },
  },
  {
    path: 'organization/roles',
    name: 'Roles',
    component: () => import('@/views/system/role/index.vue'),
    meta: { title: 'routes.roles', permissions: ['role:view'], hidden: true },
  },
  {
    path: '/forbidden',
    name: 'Forbidden',
    component: () => import('./PermissionDeniedView.vue'),
    meta: { title: 'shell.noAccessibleMenu', hidden: true },
  },
]

export const menuItems = buildNavigationFromRoutes(shellRoutes, 'main')
export const settingItems = (
  buildNavigationFromRoutes(shellRoutes, 'settings')[0]?.children ?? []
).map((item) => (item.name === 'SettingsCenter' ? { ...item, title: 'menu.userCenter' } : item))

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: 'routes.login', hidden: true },
  },
  {
    path: '/',
    component: BasicLayout,
    redirect: '/dashboard',
    children: shellRoutes,
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFound,
    meta: { title: 'routes.notFound', hidden: true },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ left: 0, top: 0 }),
})

router.afterEach((to) => {
  const locale = window.localStorage.getItem('lang') === 'en-US' ? 'en-US' : 'zh-CN'
  const title = resolveRouteTitle(to.meta, locale)
  const platformTitle = resolveRouteTitle({ title: 'app.title' }, locale)
  document.title = title ? `${title} - ${platformTitle}` : platformTitle
})

export default router
