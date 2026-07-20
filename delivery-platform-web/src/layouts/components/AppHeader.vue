<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import figmaAvatar from '@/assets/figma/project-overview/avatar.png'
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

function handleUserCommand(command: DropdownCommand): void {
  if (typeof command === 'string' && command.startsWith('/')) emit('settingSelect', command)
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
      <a-dropdown trigger="click" position="br" @select="handleUserCommand">
        <button class="user-trigger" type="button">
          <a-avatar :size="32" shape="square" class="user-avatar">
            <img :src="figmaAvatar" :alt="userInitial" />
          </a-avatar>
          <span class="user-name">{{ userName }}</span>
        </button>
        <template #content>
          <a-doption v-for="item in settings" :key="item.path" :value="item.path">
            {{ t(item.title) }}
          </a-doption>
          <a-doption value="zh-CN">
            {{ t('shell.locale.zhCN') }}
          </a-doption>
          <a-doption value="en-US">
            English
          </a-doption>
          <a-doption value="light">
            {{ t('shell.theme.light') }}
          </a-doption>
          <a-doption value="dark">
            {{ t('shell.theme.dark') }}
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
  border-radius: 0;
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
}
.user-avatar {
  border-radius: 0;
  background: #5ebd9f;
  color: #fff;
  font-weight: 600;
}
.user-avatar img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.user-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #4e5969;
  cursor: pointer;
}
.user-name {
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  white-space: nowrap;
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
