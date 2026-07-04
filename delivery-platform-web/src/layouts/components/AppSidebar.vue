<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MenuItem } from '@/store/permission'

const props = defineProps<{
  collapsed: boolean
  activeMenu: string
  menus: MenuItem[]
  menuReady: boolean
}>()

const emit = defineEmits<{
  select: [path: string]
  toggle: []
}>()

const { t } = useI18n()

const defaultOpenKeys = computed(() =>
  props.menus
    .filter((menu) =>
      menu.children?.some((child) => child.path === props.activeMenu),
    )
    .map((menu) => menu.path),
)

const menuKeyMap: Record<string, string> = {
  WorkspaceGroup: 'menu.workspace',
  Dashboard: 'menu.dashboard',
  Todo: 'menu.todo',
  DeliveryGroup: 'menu.projectGroup',
  Project: 'menu.project',
  Review: 'menu.review',
  Archive: 'menu.archive',
  Checklist: 'menu.checklist',
  Workflow: 'menu.workflow',
  Template: 'menu.template',
  Knowledge: 'menu.knowledge',
  Tools: 'menu.tools',
  Report: 'menu.report',
  Retrospective: 'menu.retrospective',
  ProcessRecords: 'menu.processRecord',
  KnowledgeGroup: 'menu.standardKnowledge',
  ArchiveTemplate: 'menu.archiveTemplate',
  Training: 'menu.training',
  PerformanceGroup: 'menu.performance',
  Okr: 'menu.goalPerformance',
  Skills: 'menu.skills',
  OrganizationGroup: 'menu.organization',
  Departments: 'menu.departments',
  Users: 'menu.user',
  Roles: 'menu.role',
  OperationsGroup: 'menu.system',
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

function resolveMenuTitle(menu: MenuItem): string {
  const key = menuKeyMap[menu.name]
  return key ? t(key) : menu.title
}

function handleMenuClick(key: string): void {
  emit('select', key)
}
</script>

<template>
  <aside class="layout-aside" :class="{ collapsed }">
    <div
      class="logo-section"
      tabindex="0"
      role="button"
      aria-label="切换侧边栏"
      @click="emit('toggle')"
      @keyup.enter="emit('toggle')"
    >
      <img src="@/assets/logo.svg" alt="" class="logo-mark" />
      <span v-if="!collapsed" class="logo-copy">
        <span class="logo-text">交付管理平台</span>
        <span class="logo-subtitle">Delivery Operations</span>
      </span>
    </div>

    <a-menu
      v-if="menus.length > 0"
      :selected-keys="[activeMenu]"
      :default-open-keys="defaultOpenKeys"
      :collapsed="collapsed"
      auto-open-selected
      class="sidebar-menu"
      @menu-item-click="handleMenuClick"
    >
      <template v-for="menu in menus" :key="menu.name">
        <a-sub-menu v-if="menu.children && menu.children.length > 0" :key="menu.path">
          <template #icon>
            <component v-if="menu.icon" :is="menu.icon" />
          </template>
          <template #title>{{ resolveMenuTitle(menu) }}</template>
          <a-menu-item
            v-for="child in menu.children"
            :key="child.path"
          >
            <template #icon>
              <component v-if="child.icon" :is="child.icon" />
            </template>
            {{ resolveMenuTitle(child) }}
          </a-menu-item>
        </a-sub-menu>

        <a-menu-item v-else :key="menu.path">
          <template #icon>
            <component v-if="menu.icon" :is="menu.icon" />
          </template>
          {{ resolveMenuTitle(menu) }}
        </a-menu-item>
      </template>
    </a-menu>

    <div v-else-if="!collapsed" class="menu-empty">
      <span>{{ menuReady ? '当前账号暂无可访问菜单' : '正在加载菜单' }}</span>
    </div>

    <div v-if="!collapsed" class="sidebar-footer">
      <span>GLOBAL OPERATIONS</span>
      <strong>DC / 01</strong>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.layout-aside {
  position: relative;
  width: 240px;
  height: 100dvh;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-2);
  overflow: hidden;
  transition: width 0.24s ease;
  border-right: 1px solid var(--color-border-2);

  &.collapsed {
    width: 64px;
  }
}

.menu-empty {
  min-height: 160px;
  padding: 34px 20px;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 12px;
  color: var(--color-text-3);
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
}

.logo-section {
  position: relative;
  z-index: 1;
  height: 72px;
  padding: 0 17px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  color: var(--color-text-1);
  border-bottom: 1px solid var(--color-border-2);
}

.logo-mark {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
}

.logo-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.logo-text {
  font-size: 16px;
  font-weight: 650;
  line-height: 1.15;
}

.logo-subtitle {
  margin-top: 3px;
  color: var(--color-text-3);
  font-size: 11px;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sidebar-menu {
  width: auto;
  flex: 1;
  padding: 12px 8px;
  overflow-x: hidden;
  overflow-y: auto;
  border-right: 0;
}

.sidebar-menu :deep(.arco-menu-inner) {
  padding: 0;
}

.sidebar-menu :deep(.arco-menu-item),
.sidebar-menu :deep(.arco-menu-inline-header) {
  height: 42px;
  margin: 3px 0;
  border-radius: 6px;
  font-weight: 520;
}

.sidebar-menu :deep(.arco-menu-selected) {
  background: rgb(var(--primary-1));
  color: rgb(var(--primary-6));
}

.sidebar-footer {
  min-height: 48px;
  margin: 0 14px;
  padding: 13px 2px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--color-border-2);
  color: var(--color-text-3);
  font-size: 9px;
  letter-spacing: 0.08em;
}

.sidebar-footer strong {
  color: var(--color-text-2);
  font-size: 10px;
  font-weight: 600;
}

@media (max-width: 900px) {
  .layout-aside {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 1001;
    width: 260px !important;
    transform: translateX(0);

    &.collapsed {
      transform: translateX(-100%);
    }
  }
}
</style>
