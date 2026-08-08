import { describe, expect, it } from 'vitest'

import router, { menuItems, settingItems } from '@/router'
import {
  buildSettingsMenuGroup,
  resolveSidebarMenuIcon,
} from '@/layouts/sidebar-navigation'
import {
  resolveActiveMenuGroupPath,
  resolveActiveMenuPath,
} from '@/store/permission'

const allSidebarGroups = [...menuItems, buildSettingsMenuGroup(settingItems)]

describe('sidebar navigation contract', () => {
  it('keeps each group title, semantic icon and secondary menu together', () => {
    expect(
      allSidebarGroups.map((group) => ({
        name: group.name,
        title: group.title,
        icon: resolveSidebarMenuIcon(group).name,
        children: group.children?.map((child) => child.title),
      })),
    ).toEqual([
      {
        name: 'WorkspaceGroup',
        title: 'menu.workspace',
        icon: 'dashboard',
        children: ['menu.dashboard', 'menu.review'],
      },
      {
        name: 'DeliveryGroup',
        title: 'menu.projectGroup',
        icon: 'project',
        children: ['routes.projectOverview', 'menu.archive', 'menu.archiveTemplate'],
      },
      {
        name: 'KnowledgeGroup',
        title: 'menu.standardKnowledge',
        icon: 'knowledge',
        children: ['menu.standard', 'menu.knowledge', 'menu.tools'],
      },
      {
        name: 'SettingsGroup',
        title: 'menu.system',
        icon: 'settings',
        children: [
          'menu.systemCurrency',
          'menu.systemApproval',
          'menu.systemFields',
          'menu.systemConfig',
          'menu.userCenter',
          'menu.systemIntegration',
        ],
      },
    ])
  })

  it.each([
    ['/dashboard', '/workspace'],
    ['/review', '/workspace'],
    ['/projects', '/delivery'],
    ['/projects/project-1', '/delivery'],
    ['/archive', '/delivery'],
    ['/archive-template', '/delivery'],
    ['/archive-templates/template-1', '/delivery'],
    ['/standards', '/standards-knowledge'],
    ['/standards/standard-1', '/standards-knowledge'],
    ['/knowledge', '/standards-knowledge'],
    ['/knowledge/knowledge-1', '/standards-knowledge'],
    ['/tools', '/standards-knowledge'],
    ['/settings', '/settings-group'],
    ['/settings/currency', '/settings-group'],
    ['/settings/approvals', '/settings-group'],
    ['/settings/fields', '/settings-group'],
    ['/settings/system', '/settings-group'],
    ['/settings/integrations', '/settings-group'],
  ])('maps route %s to the matching active group %s', (routePath, groupPath) => {
    const resolvedRoute = router.resolve(routePath)
    const activeMenu = resolveActiveMenuPath(
      allSidebarGroups,
      typeof resolvedRoute.meta.activeMenu === 'string'
        ? resolvedRoute.meta.activeMenu
        : resolvedRoute.path,
    )
    expect(resolveActiveMenuGroupPath(allSidebarGroups, activeMenu)).toBe(groupPath)
  })

  it('rejects a group without an explicit semantic icon mapping', () => {
    expect(() =>
      resolveSidebarMenuIcon({ name: 'UnknownGroup', icon: 'Unknown' }),
    ).toThrow('Unsupported sidebar icon for UnknownGroup: Unknown')
  })
})
