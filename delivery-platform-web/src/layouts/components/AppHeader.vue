<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LocaleCode } from '@/store/locale'

interface BreadcrumbItem {
  path: string
  title: string
}

const props = defineProps<{
  sidebarCollapsed: boolean
  pageTitle: string
  pageDescription: string
  breadcrumbs: BreadcrumbItem[]
  userName: string
  currentLocale: LocaleCode
}>()

const emit = defineEmits<{
  toggleSidebar: []
  languageChange: [locale: LocaleCode]
  logout: []
}>()

const userInitial = computed(() => props.userName.slice(0, 1) || 'U')
const currentLocaleLabel = computed(() =>
  props.currentLocale === 'en-US' ? 'EN' : '中文',
)
const { t } = useI18n()

const locales: Array<{ code: LocaleCode; label: string }> = [
  { code: 'zh-CN', label: '中文' },
  { code: 'en-US', label: 'English' },
]

function handleLanguageChange(command: string | number | Record<string, unknown> | undefined): void {
  if (command === 'zh-CN' || command === 'en-US') {
    emit('languageChange', command)
  }
}

function handleUserCommand(command: string | number | Record<string, unknown> | undefined): void {
  if (command === 'logout') {
    emit('logout')
  }
}
</script>

<template>
  <header class="layout-header">
    <div class="header-left">
      <a-button
        class="sidebar-toggle"
        type="secondary"
        aria-label="切换侧边栏"
        @click="emit('toggleSidebar')"
      >
        <template #icon>
          <component :is="sidebarCollapsed ? 'Expand' : 'Fold'" />
        </template>
      </a-button>
      <div class="page-title-block">
        <h1 class="page-title">{{ pageTitle }}</h1>
        <div class="page-meta">
          <span>{{ pageDescription }}</span>
          <a-breadcrumb v-if="breadcrumbs.length > 1">
            <a-breadcrumb-item v-for="item in breadcrumbs" :key="item.path">
              {{ item.title }}
            </a-breadcrumb-item>
          </a-breadcrumb>
        </div>
      </div>
    </div>

    <div class="header-right">
      <a-dropdown trigger="click" @select="handleLanguageChange">
        <a-button type="text" class="header-action">
          <template #icon><component :is="'ChatDotSquare'" /></template>
          <span class="header-action-text">{{ currentLocaleLabel }}</span>
        </a-button>
        <template #content>
          <a-doption
            v-for="locale in locales"
            :key="locale.code"
            :value="locale.code"
          >
            {{ locale.label }}
          </a-doption>
        </template>
      </a-dropdown>

      <a-dropdown trigger="click" @select="handleUserCommand">
        <a-button type="text" class="user-action">
          <a-avatar :size="26" class="user-avatar">{{ userInitial }}</a-avatar>
          <span class="user-name">{{ userName }}</span>
          <component :is="'ArrowDown'" class="arrow-icon" />
        </a-button>
        <template #content>
          <a-doption value="logout">{{ t('app.logout') }}</a-doption>
        </template>
      </a-dropdown>
    </div>
  </header>
</template>

<style scoped lang="scss">
.layout-header {
  width: 100%;
  min-height: 72px;
  height: 72px;
  flex: 0 0 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  background: var(--color-bg-2);
  border-bottom: 1px solid var(--color-border-2);
  padding: 0 28px;
}

.header-left {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 14px;
}

.sidebar-toggle {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
}

.page-title-block {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.page-title {
  margin: 0;
  color: var(--color-text-1);
  font-size: 19px;
  font-weight: 650;
  line-height: 1.18;
  letter-spacing: 0;
  white-space: nowrap;
}

.page-meta {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 12px;
  color: var(--color-text-3);
  font-size: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 10px;
}

.header-action,
.user-action {
  min-height: 36px;
  color: var(--color-text-2);
}

.user-action :deep(.arco-btn-content) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.user-avatar {
  background: rgb(var(--primary-1));
  color: rgb(var(--primary-6));
  font-size: 13px;
  font-weight: 700;
}

.user-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arrow-icon {
  width: 14px;
  height: 14px;
}

@media (max-width: 900px) {
  .layout-header {
    min-height: 64px;
    height: auto;
    padding: 12px 16px;
  }

  .page-meta {
    display: none;
  }

  .header-action-text,
  .user-name {
    display: none;
  }
}
</style>
