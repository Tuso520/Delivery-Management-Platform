<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '@/store/user'
import { useAppStore } from '@/store/app'
import type { ThemeMode } from '@/store/app'
import {
  filterMenusByPermissions,
  resolveActiveMenuPath,
  usePermissionStore,
} from '@/store/permission'
import { useLocaleStore } from '@/store/locale'
import { menuItems, resolveRouteTitle, settingItems } from '@/router'
import type { LocaleCode } from '@/store/locale'
import AppHeader from './components/AppHeader.vue'
import AppSidebar from './components/AppSidebar.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const appStore = useAppStore()
const permissionStore = usePermissionStore()
const localeStore = useLocaleStore()
const isMobile = ref(false)
const { t } = useI18n()

permissionStore.setMenus(menuItems)

const sidebarCollapsed = computed(() => appStore.sidebarCollapsed)
const filteredMenus = computed(() => permissionStore.filteredMenus)
const filteredSettings = computed(() =>
  filterMenusByPermissions(
    settingItems,
    userStore.userInfo?.permissions ?? [],
    userStore.userInfo?.roles ?? [],
  ),
)
const activeMenu = computed(() => resolveActiveMenuPath(filteredMenus.value, route.path))
const userName = computed(
  () => userStore.userInfo?.realName || userStore.userInfo?.username || t('shell.userFallback'),
)
const pageTitle = computed(() => resolveRouteTitle(route.meta, localeStore.currentLocale))

watchEffect(() => {
  document.title = `${pageTitle.value} - ${t('app.title')}`
})

function handleMenuSelect(path: string): void {
  void router.push(path)
  if (isMobile.value) appStore.setSidebarCollapsed(true)
}

function handleSettingSelect(path: string): void {
  void router.push(path)
}

function handleLanguageChange(locale: LocaleCode): void {
  localeStore.setLocale(locale)
}

function handleThemeChange(theme: ThemeMode): void {
  appStore.setTheme(theme)
}

function handleLogout(): void {
  void userStore.logout()
}

function syncViewport(): void {
  isMobile.value = window.innerWidth <= 900
  if (isMobile.value) appStore.setSidebarCollapsed(true)
}

onMounted(() => {
  syncViewport()
  window.addEventListener('resize', syncViewport)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)
})
</script>

<template>
  <div class="basic-layout">
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
      <AppHeader
        :sidebar-collapsed="sidebarCollapsed"
        :page-title="pageTitle"
        :user-name="userName"
        :current-locale="localeStore.currentLocale"
        :theme-mode="appStore.theme"
        :settings="filteredSettings"
        @toggle-sidebar="appStore.toggleSidebar"
        @setting-select="handleSettingSelect"
        @language-change="handleLanguageChange"
        @theme-change="handleThemeChange"
        @logout="handleLogout"
      />

      <main class="layout-main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.basic-layout {
  width: 100%;
  height: 100dvh;
  min-height: 100dvh;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  background: var(--color-fill-1);
}

.layout-content {
  width: 0;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.layout-main {
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  padding: 20px;
  overflow: auto;
  background: var(--color-fill-1);
}

.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  border: 0;
  background: rgba(29, 33, 41, 0.42);
}

@media (min-width: 1440px) {
  .layout-main {
    padding: 24px;
  }
}

@media (max-width: 1024px) {
  .layout-main {
    padding: 16px;
  }
}

@media (max-width: 600px) {
  .layout-main {
    padding: 12px;
  }
}
</style>
