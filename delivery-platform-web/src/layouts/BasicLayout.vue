<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '@/store/user'
import { useAppStore } from '@/store/app'
import {
  filterMenusByPermissions,
  resolveActiveMenuPath,
  usePermissionStore,
} from '@/store/permission'
import { useLocaleStore } from '@/store/locale'
import { menuItems, resolveRouteTitle, settingItems } from '@/router'
import type { MenuItem } from '@/store/permission'
import AppHeader from './components/AppHeader.vue'
import AppSidebar from './components/AppSidebar.vue'
import AppBreadcrumb from './components/AppBreadcrumb.vue'
import { buildSettingsMenuGroup } from './sidebar-navigation'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const appStore = useAppStore()
const permissionStore = usePermissionStore()
const localeStore = useLocaleStore()
const isMobile = ref(false)
let mobileSidebarMediaQuery: MediaQueryList | null = null
const { t } = useI18n()
permissionStore.setMenus(menuItems)
const sidebarCollapsed = computed(() => appStore.sidebarCollapsed)
const filteredSettings = computed(() =>
  filterMenusByPermissions(
    settingItems,
    userStore.userInfo?.permissions ?? [],
    userStore.userInfo?.roles ?? [],
  ),
)
const filteredMenus = computed<MenuItem[]>(() => [
  ...permissionStore.filteredMenus,
  ...(filteredSettings.value.length ? [buildSettingsMenuGroup(filteredSettings.value)] : []),
])
const activeMenu = computed(() =>
  resolveActiveMenuPath(
    filteredMenus.value,
    typeof route.meta.activeMenu === 'string' ? route.meta.activeMenu : route.path,
  ),
)
const activeGroup = computed(() =>
  filteredMenus.value.find((menu) =>
    menu.children?.some((child) => child.path === activeMenu.value),
  ),
)
const groupTitle = computed(() => (activeGroup.value ? t(activeGroup.value.title) : ''))
const userName = computed(
  () => userStore.userInfo?.realName || userStore.userInfo?.username || t('shell.userFallback'),
)
const avatarUrl = computed(() => userStore.userInfo?.avatar || undefined)
const pageTitle = computed(() => resolveRouteTitle(route.meta, localeStore.currentLocale))
watchEffect(() => {
  document.title = `${pageTitle.value} - ${t('app.title')}`
})
function handleMenuSelect(path: string): void {
  void router.push(path)
  if (isMobile.value) appStore.setSidebarCollapsed(true)
}
function syncResponsiveSidebar(): void {
  isMobile.value =
    mobileSidebarMediaQuery?.matches ??
    (window.innerWidth <= 600 && window.navigator.maxTouchPoints > 0)
  if (isMobile.value) appStore.setSidebarCollapsed(true)
}
onMounted(() => {
  mobileSidebarMediaQuery = window.matchMedia('(max-width: 600px) and (pointer: coarse)')
  syncResponsiveSidebar()
  mobileSidebarMediaQuery.addEventListener('change', syncResponsiveSidebar)
})
onBeforeUnmount(() => {
  mobileSidebarMediaQuery?.removeEventListener('change', syncResponsiveSidebar)
  mobileSidebarMediaQuery = null
})
</script>

<template>
  <div class="basic-layout">
    <AppHeader
      :user-name="userName"
      :avatar-url="avatarUrl"
      @toggle-sidebar="appStore.toggleSidebar"
      @logout="userStore.logout"
    />
    <div class="layout-body">
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
        :aria-label="t('shell.closeMenu')"
        @click="appStore.setSidebarCollapsed(true)"
      />
      <div class="layout-content">
        <AppBreadcrumb :group-title="groupTitle" :page-title="pageTitle" />
        <main class="layout-main">
          <router-view />
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.basic-layout {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f7f8fa;
  font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.layout-body {
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  display: flex;
  overflow: hidden;
}
.layout-content {
  width: 0;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  padding: 13px;
  overflow: hidden;
}
.layout-main {
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  margin-top: 6px;
  overflow: auto;
  border-radius: 4px;
}
.drawer-backdrop {
  position: fixed;
  inset: 60px 0 0;
  z-index: 1000;
  border: 0;
  background: rgba(29, 33, 41, 0.42);
}
@media (max-width: 600px) and (pointer: coarse) {
  .layout-content {
    padding: 12px;
  }
}
@media (max-width: 420px) and (pointer: coarse) {
  .layout-content {
    padding: 8px;
  }
}
</style>
