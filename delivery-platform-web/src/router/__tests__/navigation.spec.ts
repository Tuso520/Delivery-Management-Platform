// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RouteRecordRaw } from 'vue-router'
import { describe, expect, it } from 'vitest'

import { menuItems, resolveRouteTitle, settingItems, shellRoutes } from '@/router'
import router from '@/router'

const routerSource = readFileSync(resolve(process.cwd(), 'src/router/index.ts'), 'utf8')
const permissionSource = readFileSync(resolve(process.cwd(), 'src/router/permission.ts'), 'utf8')
const sidebarSource = readFileSync(
  resolve(process.cwd(), 'src/layouts/components/AppSidebar.vue'),
  'utf8',
)
const layoutSource = readFileSync(resolve(process.cwd(), 'src/layouts/BasicLayout.vue'), 'utf8')
const loginSource = readFileSync(resolve(process.cwd(), 'src/views/login/index.vue'), 'utf8')

function flattenRoutes(records: RouteRecordRaw[]): RouteRecordRaw[] {
  return records.flatMap((record) => [record, ...flattenRoutes(record.children ?? [])])
}

describe('application navigation', () => {
  it('derives the three main navigation groups from route metadata', () => {
    expect(menuItems.map((group) => group.title)).toEqual([
      'menu.workspace',
      'menu.projectGroup',
      'menu.standardKnowledge',
    ])
    expect(menuItems.map((group) => group.children?.map((item) => item.title))).toEqual([
      ['menu.dashboard', 'menu.review'],
      ['routes.projectOverview', 'menu.archive', 'menu.archiveTemplate'],
      ['menu.standard', 'menu.knowledge', 'menu.tools'],
    ])
  })

  it('keeps settings out of the sidebar and exposes settings plus field configuration', () => {
    expect(menuItems.flatMap((group) => group.children ?? [])).not.toContainEqual(
      expect.objectContaining({ name: 'Currency' }),
    )
    expect(settingItems.map((item) => item.title)).toEqual([
      'menu.systemCurrency',
      'menu.systemApproval',
      'menu.systemFields',
      'menu.systemIntegration',
      'menu.systemConfig',
      'menu.userCenter',
    ])
  })

  it('registers only the canonical project routes', () => {
    const records = flattenRoutes(shellRoutes)
    const projectOverview = records.find((record) => record.name === 'Project')
    const projectDrawerRoutes = records.filter((record) =>
      ['ProjectCreate', 'ProjectDetail', 'ProjectEdit'].includes(String(record.name)),
    )
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/projects', name: 'Project' }),
        expect.objectContaining({ path: '/projects/create', name: 'ProjectCreate' }),
        expect.objectContaining({ path: '/projects/:projectId', name: 'ProjectDetail' }),
        expect.objectContaining({ path: '/projects/:projectId/edit', name: 'ProjectEdit' }),
      ]),
    )

    expect(router.resolve('/projects/project-1/edit').name).toBe('ProjectEdit')
    expect(projectDrawerRoutes).toHaveLength(3)
    expect(
      projectDrawerRoutes.every((record) => record.component === projectOverview?.component),
    ).toBe(true)
    expect(router.resolve('/settings/currency').name).toBe('Currency')
    expect(router.resolve('/project').name).toBe('NotFound')
  })

  it('registers shareable entity routes on the same list-page components', () => {
    const records = flattenRoutes(shellRoutes)
    const routePairs = [
      ['Review', 'ReviewDetail', '/review/task-1'],
      ['ArchiveTemplate', 'ArchiveTemplateDetail', '/archive-templates/template-1'],
      ['Standard', 'StandardDetail', '/standards/standard-1'],
      ['Knowledge', 'KnowledgeDetail', '/knowledge/knowledge-1'],
    ] as const

    for (const [listName, detailName, path] of routePairs) {
      const listRoute = records.find((record) => record.name === listName)
      const detailRoute = records.find((record) => record.name === detailName)
      expect(router.resolve(path).name).toBe(detailName)
      expect(detailRoute?.component).toBe(listRoute?.component)
      expect(detailRoute?.meta?.hidden).toBe(true)
    }

    expect(router.resolve('/forbidden').name).toBe('Forbidden')
    expect(router.resolve('/knowledge/create').name).toBe('NotFound')
    expect(router.resolve('/standards/create').name).toBe('NotFound')
  })

  it('does not register retired domains or compatibility aliases', () => {
    const records = flattenRoutes(shellRoutes)
    const registeredPaths = records.map((record) => record.path)
    const retiredPaths = [
      'todo',
      'process-records',
      'knowledge/create',
      'project',
      'project/create',
      'project/detail/:id',
      'project/edit/:id',
      'report',
      'report/create',
      'report/detail/:id',
      'retrospective',
      'okr',
      'okr/edit',
      'okr/scoring',
      'skills',
      'training',
      'global/currency',
      'global/country',
      'global/language',
      'operations/notification',
      'operations/approval',
      'operations/logs',
      'operations/config',
      'operations/integrations',
      'operations/storage',
      'system/integrations',
    ]

    expect(registeredPaths.filter((path) => retiredPaths.includes(path))).toEqual([])
    expect(router.resolve('/todo').name).toBe('NotFound')
    expect(router.resolve('/process-records').name).toBe('NotFound')
  })

  it('uses route metadata as the single title, menu and permission source', () => {
    expect(routerSource).toContain(
      "export const menuItems = buildNavigationFromRoutes(shellRoutes, 'main')",
    )
    expect(routerSource).toContain("buildNavigationFromRoutes(shellRoutes, 'settings')")
    expect(sidebarSource).not.toContain('menuKeyMap')
    expect(layoutSource).not.toContain('routeTitleKeys')
    expect(layoutSource).not.toContain('pageDescriptionMap')
    expect(layoutSource).not.toContain('breadcrumbs')
  })

  it('resolves localized titles from the same route metadata', () => {
    expect(resolveRouteTitle({ title: 'routes.projectOverview' }, 'en-US')).toBe('Project Overview')
  })

  it('restores the cookie-backed session before deciding navigation', () => {
    expect(permissionSource).toContain('const hasSession = await userStore.ensureSession()')
    expect(permissionSource).toContain("if (to.path === '/login')")
    expect(permissionSource).toContain('query: { redirect: to.fullPath }')
    expect(permissionSource).not.toContain('await userStore.ensureProfile()')
    expect(permissionSource).toContain("next('/forbidden')")
    expect(permissionSource).not.toContain('userStore.resetState()')
    expect(loginSource).toContain('getFirstAccessiblePath(')
    expect(loginSource).toContain("?? '/forbidden'")
  })
})
