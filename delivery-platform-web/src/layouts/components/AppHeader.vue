<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  IconCheck,
  IconDesktop,
  IconDown,
  IconLanguage,
  IconMenuFold,
  IconMenuUnfold,
  IconMoon,
  IconSettings,
  IconSun,
} from '@arco-design/web-vue/es/icon'
import type { LocaleCode } from '@/store/locale'
import type { ThemeMode } from '@/store/app'
import type { MenuItem } from '@/store/permission'
import { resolveMenuIcon } from '@/utils/menu-icons'

type DropdownCommand = string | number | Record<string, unknown> | undefined

const props = defineProps<{
  sidebarCollapsed: boolean
  pageTitle: string
  userName: string
  currentLocale: LocaleCode
  themeMode: ThemeMode
  settings: MenuItem[]
}>()

const emit = defineEmits<{
  toggleSidebar: []
  settingSelect: [path: string]
  languageChange: [locale: LocaleCode]
  themeChange: [theme: ThemeMode]
  logout: []
}>()

const { t } = useI18n()
const userInitial = computed(() => props.userName.slice(0, 1) || 'U')
const currentLocaleLabel = computed(() =>
  props.currentLocale === 'en-US' ? 'EN' : t('shell.locale.zhCN'),
)
const currentThemeIcon = computed<Component>(
  () =>
    ({
      light: IconSun,
      dark: IconMoon,
      system: IconDesktop,
    })[props.themeMode],
)

const locales = computed<Array<{ code: LocaleCode; label: string }>>(() => [
  { code: 'zh-CN', label: t('shell.locale.zhCN') },
  { code: 'en-US', label: t('shell.locale.enUS') },
])

const themes: Array<{
  value: ThemeMode
  icon: Component
  labelKey: string
}> = [
  { value: 'light', icon: IconSun, labelKey: 'shell.theme.light' },
  { value: 'dark', icon: IconMoon, labelKey: 'shell.theme.dark' },
  { value: 'system', icon: IconDesktop, labelKey: 'shell.theme.system' },
]

function resolveMenuTitle(item: MenuItem): string {
  return t(item.title)
}

function resolveThemeTitle(theme: (typeof themes)[number]): string {
  return t(theme.labelKey)
}

function handleSettingSelect(command: DropdownCommand): void {
  if (typeof command === 'string') emit('settingSelect', command)
}

function handleLanguageChange(command: DropdownCommand): void {
  if (command === 'zh-CN' || command === 'en-US') {
    emit('languageChange', command)
  }
}

function handleThemeChange(command: DropdownCommand): void {
  if (command === 'light' || command === 'dark' || command === 'system') {
    emit('themeChange', command)
  }
}

function handleUserCommand(command: DropdownCommand): void {
  if (command === 'logout') emit('logout')
}
</script>

<template>
  <header class="layout-header">
    <div class="header-left">
      <a-button class="header-icon-button" type="text" @click="emit('toggleSidebar')">
        <template #icon>
          <IconMenuUnfold v-if="sidebarCollapsed" />
          <IconMenuFold v-else />
        </template>
        <span class="sr-only">{{ t('shell.toggleSidebar') }}</span>
      </a-button>
      <h1 class="page-title">
        {{ pageTitle }}
      </h1>
    </div>

    <div class="header-right">
      <a-dropdown trigger="click" position="br" @select="handleSettingSelect">
        <a-button type="text" class="header-icon-button">
          <template #icon>
            <IconSettings />
          </template>
          <span class="sr-only">{{ t('shell.openSettings') }}</span>
        </a-button>
        <template #content>
          <a-doption v-for="item in settings" :key="item.path" :value="item.path">
            <component :is="resolveMenuIcon(item.icon)" class="option-icon" />
            {{ resolveMenuTitle(item) }}
          </a-doption>
          <a-doption v-if="settings.length === 0" disabled>
            {{ t('shell.noAccessibleSettings') }}
          </a-doption>
        </template>
      </a-dropdown>

      <a-dropdown trigger="click" position="br" @select="handleLanguageChange">
        <a-button type="text" class="header-action">
          <template #icon>
            <IconLanguage />
          </template>
          <span class="header-action-text">{{ currentLocaleLabel }}</span>
        </a-button>
        <template #content>
          <a-doption v-for="locale in locales" :key="locale.code" :value="locale.code">
            {{ locale.label }}
          </a-doption>
        </template>
      </a-dropdown>

      <a-dropdown trigger="click" position="br" @select="handleThemeChange">
        <a-button type="text" class="header-icon-button">
          <template #icon>
            <component :is="currentThemeIcon" />
          </template>
          <span class="sr-only">{{ t('shell.theme.switch') }}</span>
        </a-button>
        <template #content>
          <a-doption v-for="theme in themes" :key="theme.value" :value="theme.value">
            <component :is="theme.icon" class="option-icon" />
            {{ resolveThemeTitle(theme) }}
            <component :is="IconCheck" v-if="themeMode === theme.value" class="selected-icon" />
          </a-doption>
        </template>
      </a-dropdown>

      <a-dropdown trigger="click" position="br" @select="handleUserCommand">
        <a-button type="text" class="user-action">
          <a-avatar :size="24" class="user-avatar">
            {{ userInitial }}
          </a-avatar>
          <span class="user-name">{{ userName }}</span>
          <IconDown class="arrow-icon" />
        </a-button>
        <template #content>
          <a-doption value="logout">
            {{ t('app.logout') }}
          </a-doption>
        </template>
      </a-dropdown>
    </div>
  </header>
</template>

<style scoped lang="scss">
.layout-header {
  width: 100%;
  height: 48px;
  min-height: 48px;
  flex: 0 0 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px 0 12px;
  background: var(--color-bg-2);
  border-bottom: 1px solid var(--color-border-2);
}

.header-left,
.header-right {
  min-width: 0;
  display: flex;
  align-items: center;
}

.header-left {
  gap: 8px;
}

.header-right {
  flex: 0 0 auto;
  gap: 2px;
}

.header-icon-button,
.header-action,
.user-action {
  min-width: 32px;
  height: 32px;
  color: var(--color-text-2);
}

.page-title {
  margin: 0;
  overflow: hidden;
  color: var(--color-text-1);
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-action :deep(.arco-btn-content) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.user-avatar {
  background: rgb(var(--primary-1));
  color: rgb(var(--primary-6));
  font-size: 12px;
  font-weight: 700;
}

.user-name {
  max-width: 112px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arrow-icon,
.option-icon,
.selected-icon {
  width: 14px;
  height: 14px;
}

.option-icon {
  margin-right: 8px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.selected-icon {
  margin-left: 12px;
  color: rgb(var(--primary-6));
}

@media (max-width: 900px) {
  .layout-header {
    padding: 0 8px;
  }

  .header-action-text,
  .user-name,
  .arrow-icon {
    display: none;
  }
}
</style>
