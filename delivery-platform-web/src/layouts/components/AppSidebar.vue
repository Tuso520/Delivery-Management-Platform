<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MenuItem } from '@/store/permission'
import { resolveMenuIcon } from '@/utils/menu-icons'

const props = defineProps<{
  collapsed: boolean
  activeMenu: string
  menus: MenuItem[]
  menuReady: boolean
}>()

const { t } = useI18n()

const emit = defineEmits<{
  select: [path: string]
  toggle: []
}>()

const defaultOpenKeys = computed(() =>
  props.menus
    .filter((menu) => menu.children?.some((child) => child.path === props.activeMenu))
    .map((menu) => menu.path),
)

function resolveMenuTitle(menu: MenuItem): string {
  return t(menu.title)
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
      :aria-label="t('shell.toggleSidebar')"
      @click="emit('toggle')"
      @keyup.enter="emit('toggle')"
    >
      <img src="@/assets/logo.svg" alt="" class="logo-mark" />
      <span v-if="!collapsed" class="logo-text">{{ t('app.title') }}</span>
    </div>

    <a-menu
      v-if="menus.length > 0"
      :selected-keys="[activeMenu]"
      :default-open-keys="defaultOpenKeys"
      :collapsed="collapsed"
      :accordion="true"
      auto-open-selected
      class="sidebar-menu"
      @menu-item-click="handleMenuClick"
    >
      <template v-for="menu in menus" :key="menu.name">
        <a-sub-menu v-if="menu.children && menu.children.length > 0" :key="menu.path">
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
      <span>{{ menuReady ? t('shell.noAccessibleMenu') : t('shell.loadingMenu') }}</span>
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
  overflow: hidden;
  background: var(--color-bg-2);
  border-right: 1px solid var(--color-border-2);
  transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1);

  &.collapsed {
    width: 64px;
  }
}

.logo-section {
  position: relative;
  z-index: 1;
  height: 48px;
  min-height: 48px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  color: var(--color-text-1);
  border-bottom: 1px solid var(--color-border-2);
}

.logo-section:focus-visible {
  outline: 2px solid rgb(var(--primary-6));
  outline-offset: -2px;
}

.logo-mark {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
}

.logo-text {
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-menu {
  width: auto;
  flex: 1;
  padding: 8px;
  overflow-x: hidden;
  overflow-y: auto;
  border-right: 0;
}

.sidebar-menu :deep(.arco-menu-inner) {
  padding: 0;
}

.sidebar-menu :deep(.arco-menu-item),
.sidebar-menu :deep(.arco-menu-inline-header) {
  height: 40px;
  margin: 2px 0;
  border-radius: 4px;
  font-weight: 500;
}

.sidebar-menu :deep(.arco-menu-selected) {
  background: rgb(var(--primary-1));
  color: rgb(var(--primary-6));
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

@media (max-width: 900px) {
  .layout-aside {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 1001;
    width: 240px !important;
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
