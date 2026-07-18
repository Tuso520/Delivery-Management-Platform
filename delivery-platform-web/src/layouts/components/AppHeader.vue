<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  IconLanguage,
  IconMoon,
  IconNotification,
  IconSettings,
  IconSun,
} from '@arco-design/web-vue/es/icon'
import type { LocaleCode } from '@/store/locale'
import type { ThemeMode } from '@/store/app'
import type { MenuItem } from '@/store/permission'

type DropdownCommand = string | number | Record<string, unknown> | undefined

const props = defineProps<{
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

function handleSettingSelect(command: DropdownCommand): void {
  if (typeof command === 'string') emit('settingSelect', command)
}

function handleUserCommand(command: DropdownCommand): void {
  if (command === 'zh-CN' || command === 'en-US') emit('languageChange', command)
  if (command === 'light' || command === 'dark' || command === 'system')
    emit('themeChange', command)
  if (command === 'logout') emit('logout')
}
</script>

<template>
  <header class="layout-header">
    <button
      class="brand"
      type="button"
      :aria-label="t('shell.toggleSidebar')"
      @click="emit('toggleSidebar')"
    >
      <span class="brand-mark">D</span>
      <span class="brand-title">{{ t('shell.productTitle') }}</span>
    </button>

    <div class="header-right">
      <a-button type="text" shape="circle" class="header-circle-button">
        <template #icon>
          <IconNotification />
        </template>
        <span class="sr-only">{{ t('shell.notifications') }}</span>
      </a-button>

      <a-dropdown trigger="click" position="br" @select="handleSettingSelect">
        <a-button type="text" shape="circle" class="header-circle-button">
          <template #icon>
            <IconSettings />
          </template>
          <span class="sr-only">{{ t('shell.openSettings') }}</span>
        </a-button>
        <template #content>
          <a-doption v-for="item in settings" :key="item.path" :value="item.path">
            {{ t(item.title) }}
          </a-doption>
          <a-doption v-if="settings.length === 0" disabled>
            {{ t('shell.noAccessibleSettings') }}
          </a-doption>
        </template>
      </a-dropdown>

      <a-dropdown trigger="click" position="br" @select="handleUserCommand">
        <a-avatar :size="32" class="user-avatar">
          {{ userInitial }}
        </a-avatar>
        <template #content>
          <a-doption value="zh-CN">
            <IconLanguage /> {{ t('shell.locale.zhCN') }}
          </a-doption>
          <a-doption value="en-US">
            <IconLanguage /> English
          </a-doption>
          <a-doption value="light">
            <IconSun /> {{ t('shell.theme.light') }}
          </a-doption>
          <a-doption value="dark">
            <IconMoon /> {{ t('shell.theme.dark') }}
          </a-doption>
          <a-doption value="system">
            {{ t('shell.theme.system') }}
          </a-doption>
          <a-doption value="logout">
            {{ t('app.logout') }}
          </a-doption>
        </template>
      </a-dropdown>
    </div>
  </header>
</template>

<style scoped>
.layout-header {
  width: 100%;
  height: 60px;
  min-height: 60px;
  flex: 0 0 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--color-bg-2);
  border-bottom: 1px solid #e5e6eb;
}

.brand {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #1d2129;
  cursor: pointer;
}

.brand-mark {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #165dff;
  color: #fff;
  font-family: Inter, sans-serif;
  font-size: 16px;
  font-weight: 800;
}

.brand-title {
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
  white-space: nowrap;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}
.header-circle-button {
  width: 36px;
  height: 36px;
  background: #f2f3f5;
  color: #4e5969;
}
.user-avatar {
  background: #5ebd9f;
  color: #fff;
  cursor: pointer;
  font-weight: 600;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

@media (max-width: 600px) {
  .layout-header {
    padding: 0 12px;
  }
  .brand-title {
    font-size: 16px;
  }
  .header-right {
    gap: 8px;
  }
}
</style>
