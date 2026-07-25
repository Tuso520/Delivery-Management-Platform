import type { MenuItem } from '@/platform/permission/access-policy'

import menuDashboardIcon from '@/assets/figma/project-overview/menu-dashboard.svg'
import menuProjectIcon from '@/assets/figma/project-overview/menu-project.svg'
import menuKnowledgeIcon from '@/assets/figma/project-overview/menu-knowledge.svg'
import menuSettingsIcon from '@/assets/figma/project-overview/menu-settings.svg'

export type SidebarMenuIconName = 'dashboard' | 'project' | 'knowledge' | 'settings'

export interface SidebarMenuIcon {
  name: SidebarMenuIconName
  source: string
}

const SIDEBAR_MENU_ICONS: Readonly<Record<string, SidebarMenuIcon>> = {
  Monitor: { name: 'dashboard', source: menuDashboardIcon },
  FolderOpened: { name: 'project', source: menuProjectIcon },
  Reading: { name: 'knowledge', source: menuKnowledgeIcon },
  Setting: { name: 'settings', source: menuSettingsIcon },
}

export function resolveSidebarMenuIcon(menu: Pick<MenuItem, 'icon' | 'name'>): SidebarMenuIcon {
  const icon = menu.icon ? SIDEBAR_MENU_ICONS[menu.icon] : undefined
  if (!icon) {
    throw new Error(`Unsupported sidebar icon for ${menu.name}: ${menu.icon ?? 'missing'}`)
  }
  return icon
}

export function buildSettingsMenuGroup(children: MenuItem[]): MenuItem {
  return {
    path: '/settings-group',
    name: 'SettingsGroup',
    title: 'menu.system',
    icon: 'Setting',
    children,
  }
}
