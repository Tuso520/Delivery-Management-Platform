<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

type DropdownCommand = string | number | Record<string, unknown> | undefined

const props = defineProps<{
  userName: string
  avatarUrl?: string
}>()

const emit = defineEmits<{
  toggleSidebar: []
  logout: []
}>()

const { t } = useI18n()
const userInitial = computed(() => props.userName.slice(0, 1) || 'U')
const avatarLoadFailed = ref(false)
const showAvatarImage = computed(() => Boolean(props.avatarUrl && !avatarLoadFailed.value))

watch(
  () => props.avatarUrl,
  () => {
    avatarLoadFailed.value = false
  },
)

function handleUserCommand(command: DropdownCommand): void {
  if (command === 'logout') emit('logout')
}
</script>

<template>
  <header class="layout-header">
    <a-button
      class="brand"
      type="text"
      v-bind="{ 'aria-label': t('shell.toggleSidebar') }"
      @click="emit('toggleSidebar')"
    >
      <span class="brand-mark">D</span>
      <span class="brand-title">{{ t('shell.productTitle') }}</span>
    </a-button>

    <div class="header-right">
      <a-dropdown trigger="click" position="br" @select="handleUserCommand">
        <a-button class="user-trigger" type="text">
          <a-avatar :size="32" shape="circle" class="user-avatar">
            <img
              v-if="showAvatarImage"
              :src="avatarUrl"
              :alt="userName"
              @error="avatarLoadFailed = true"
            />
            <span v-else class="user-avatar-fallback">{{ userInitial }}</span>
          </a-avatar>
          <span class="user-name">{{ userName }}</span>
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
  border-radius: 50%;
  background: #165dff;
  color: #fff;
  font-weight: 600;
  overflow: hidden;
}
.user-avatar img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.user-avatar-fallback {
  display: inline-flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
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
