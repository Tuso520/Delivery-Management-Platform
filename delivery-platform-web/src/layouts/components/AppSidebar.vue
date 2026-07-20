<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MenuItem } from '@/store/permission'
import menuDashboardIcon from '@/assets/figma/project-overview/menu-dashboard.svg'
import menuProjectIcon from '@/assets/figma/project-overview/menu-project.svg'
import menuKnowledgeIcon from '@/assets/figma/project-overview/menu-knowledge.svg'
import menuSettingsIcon from '@/assets/figma/project-overview/menu-settings.svg'
import menuChevronIcon from '@/assets/figma/project-overview/menu-chevron.svg'
import menuChevronActiveIcon from '@/assets/figma/project-overview/menu-chevron-active.svg'
import menuFoldIcon from '@/assets/figma/project-overview/menu-fold.svg'

const props = defineProps<{
  collapsed: boolean
  activeMenu: string
  menus: MenuItem[]
  menuReady: boolean
}>()
const emit = defineEmits<{ select: [path: string]; toggle: [] }>()
const { t } = useI18n()
const openKeys = computed(() =>
  props.menus.filter((menu) => Boolean(menu.children?.length)).map((menu) => menu.path),
)

function resolveMenuTitle(menu: MenuItem): string {
  return t(menu.title)
}
function figmaMenuIcon(menu: MenuItem): string {
  if (menu.name === 'DeliveryGroup' || menu.path.includes('project')) return menuProjectIcon
  if (menu.path.includes('standard') || menu.path.includes('knowledge')) return menuKnowledgeIcon
  if (menu.path.includes('system') || menu.path.includes('setting')) return menuSettingsIcon
  return menuDashboardIcon
}
function isActiveGroup(menu: MenuItem): boolean {
  return Boolean(menu.children?.some((child) => child.path === props.activeMenu))
}
</script>

<template>
  <aside class="layout-aside" :class="{ collapsed }">
    <a-menu
      v-if="menus.length"
      :selected-keys="[activeMenu]"
      :open-keys="openKeys"
      :collapsed="collapsed"
      :accordion="false"
      auto-open-selected
      class="sidebar-menu"
      @menu-item-click="emit('select', $event)"
    >
      <template v-for="menu in menus" :key="menu.name">
        <a-sub-menu v-if="menu.children?.length" :key="menu.path">
          <template #icon>
            <img class="figma-menu-icon" :src="figmaMenuIcon(menu)" alt="" />
          </template>
          <template #title>
            <span class="menu-title">{{ resolveMenuTitle(menu) }}</span>
            <img
              class="menu-chevron"
              :src="isActiveGroup(menu) ? menuChevronActiveIcon : menuChevronIcon"
              alt=""
            />
          </template>
          <a-menu-item v-for="child in menu.children" :key="child.path">
            {{ resolveMenuTitle(child) }}
          </a-menu-item>
        </a-sub-menu>
        <a-menu-item v-else :key="menu.path">
          <template #icon>
            <img class="figma-menu-icon" :src="figmaMenuIcon(menu)" alt="" />
          </template>
          {{ resolveMenuTitle(menu) }}
        </a-menu-item>
      </template>
    </a-menu>
    <div v-else-if="!collapsed" class="menu-empty">
      {{ menuReady ? t('shell.noAccessibleMenu') : t('shell.loadingMenu') }}
    </div>
    <div class="collapse-area">
      <button class="collapse-button" type="button" @click="emit('toggle')">
        <img :class="{ 'is-collapsed': collapsed }" :src="menuFoldIcon" alt="" />
        <span class="sr-only">{{ t('shell.toggleSidebar') }}</span>
      </button>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.layout-aside {
  position: relative;
  width: 180px;
  height: 100%;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-2);
  transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  &.collapsed {
    width: 48px;
  }
}
.sidebar-menu {
  width: auto;
  flex: 1;
  padding: 4px 8px;
  overflow: auto;
  border-right: 0;
}
.sidebar-menu :deep(.arco-menu-inner) {
  padding: 0;
}
.sidebar-menu :deep(.arco-menu-item),
.sidebar-menu :deep(.arco-menu-inline-header) {
  height: 40px;
  margin: 2px 0;
  border-radius: 2px;
  font-weight: 400;
}
.sidebar-menu :deep(.arco-menu-icon) {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.figma-menu-icon {
  width: 18px;
  height: 18px;
  display: block;
}
.menu-title {
  min-width: 0;
  flex: 1;
}
.menu-chevron {
  width: 14px;
  height: 14px;
  display: block;
}
.sidebar-menu :deep(.arco-menu-icon-suffix) {
  display: none;
}
.sidebar-menu :deep(.arco-menu-selected) {
  background: #f2f3f5;
  color: #165dff;
}
.sidebar-menu :deep(.arco-menu-item:hover),
.sidebar-menu :deep(.arco-menu-inline-header:hover) {
  background: #f7f8fa;
  color: #165dff;
}
.collapse-area {
  padding: 12px;
  display: flex;
  justify-content: flex-end;
}
.collapse-button {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: #f7f8fa;
  color: #4e5969;
  cursor: pointer;
}
.collapse-button img {
  width: 16px;
  height: 16px;
  display: block;
}
.collapse-button img.is-collapsed {
  transform: scaleX(-1);
}
.menu-empty {
  padding: 32px 16px;
  color: #86909c;
  font-size: 12px;
  text-align: center;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
@media (max-width: 900px) {
  .layout-aside {
    position: fixed;
    inset: 60px auto 0 0;
    z-index: 1001;
    width: 180px !important;
    transform: translateX(0);
    &.collapsed {
      transform: translateX(-100%);
    }
  }
}
@media (prefers-reduced-motion: reduce) {
  .layout-aside {
    transition: none;
  }
}
</style>
