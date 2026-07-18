<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconMenuFold, IconMenuUnfold } from '@arco-design/web-vue/es/icon'
import type { MenuItem } from '@/store/permission'
import { resolveMenuIcon } from '@/utils/menu-icons'

const props = defineProps<{
  collapsed: boolean
  activeMenu: string
  menus: MenuItem[]
  menuReady: boolean
}>()
const emit = defineEmits<{ select: [path: string]; toggle: [] }>()
const { t } = useI18n()
const defaultOpenKeys = computed(() =>
  props.menus
    .filter((menu) => menu.children?.some((child) => child.path === props.activeMenu))
    .map((menu) => menu.path),
)

function resolveMenuTitle(menu: MenuItem): string {
  return t(menu.title)
}
</script>

<template>
  <aside class="layout-aside" :class="{ collapsed }">
    <a-menu
      v-if="menus.length"
      :selected-keys="[activeMenu]"
      :default-open-keys="defaultOpenKeys"
      :collapsed="collapsed"
      :accordion="true"
      auto-open-selected
      class="sidebar-menu"
      @menu-item-click="emit('select', $event)"
    >
      <template v-for="menu in menus" :key="menu.name">
        <a-sub-menu v-if="menu.children?.length" :key="menu.path">
          <template #icon>
            <component :is="resolveMenuIcon(menu.icon)" />
          </template>
          <template #title>
            {{ resolveMenuTitle(menu) }}
          </template>
          <a-menu-item v-for="child in menu.children" :key="child.path">
            <template #icon>
              <component :is="resolveMenuIcon(child.icon)" />
            </template>
            {{ resolveMenuTitle(child) }}
          </a-menu-item>
        </a-sub-menu>
        <a-menu-item v-else :key="menu.path">
          <template #icon>
            <component :is="resolveMenuIcon(menu.icon)" />
          </template>
          {{ resolveMenuTitle(menu) }}
        </a-menu-item>
      </template>
    </a-menu>
    <div v-else-if="!collapsed" class="menu-empty">
      {{ menuReady ? t('shell.noAccessibleMenu') : t('shell.loadingMenu') }}
    </div>
    <div class="collapse-area">
      <a-button type="text" class="collapse-button" @click="emit('toggle')">
        <template #icon>
          <IconMenuUnfold v-if="collapsed" /><IconMenuFold v-else />
        </template>
        <span class="sr-only">{{ t('shell.toggleSidebar') }}</span>
      </a-button>
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
  font-size: 18px;
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
  border-radius: 2px;
  background: #f7f8fa;
  color: #4e5969;
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
