<script setup lang="ts">
import { computed, reactive, shallowRef, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Message } from '@arco-design/web-vue'
import type { FormInstance } from '@arco-design/web-vue'
import {
  IconEye,
  IconEyeInvisible,
  IconLock,
  IconRight,
  IconUser,
} from '@arco-design/web-vue/es/icon'
import type { FormRules } from '@/types/arco'
import { useAuth } from '@/composables/useAuth'
import { usePublicSystemConfigQuery } from '@/composables/queries/useAdministrationQueries'
import { getFirstAccessiblePath } from '@/router/access'
import { useLocaleStore } from '@/store/locale'
import type { LocaleCode } from '@/store/locale'
import type { LoginForm } from '@/types/user'

const router = useRouter()
const route = useRoute()
const { login, userInfo } = useAuth()
const localeStore = useLocaleStore()
const { t } = useI18n()
const publicConfigQuery = usePublicSystemConfigQuery()

const formRef = useTemplateRef<FormInstance>('loginFormRef')
const loading = shallowRef(false)
const passwordVisible = shallowRef(false)
const platformName = computed(
  () => publicConfigQuery.data.value?.['platform.name'] || t('app.title'),
)
const loginSlogan = computed(
  () => publicConfigQuery.data.value?.['platform.login_slogan'] || t('login.slogan'),
)

const loginForm = reactive<LoginForm>({
  username: '',
  password: '',
})

const copy = computed(() => {
  return {
    eyebrow: t('login.eyebrow'),
    brandTitle: loginSlogan.value,
    brandMeta: t('login.brandMeta'),
    welcome: t('login.welcome'),
    introduction: t('login.introduction'),
    username: t('login.username'),
    password: t('login.password'),
    usernameRequired: t('login.usernameRequired'),
    usernameLength: t('login.usernameLength'),
    passwordRequired: t('login.passwordRequired'),
    passwordLength: t('login.passwordLength'),
    submit: t('login.loginBtn'),
    success: t('login.loginSuccess'),
    failure: t('login.loginFailed'),
    security: t('login.security'),
    showPassword: t('login.showPassword'),
    hidePassword: t('login.hidePassword'),
  }
})

const rules = computed<FormRules>(() => ({
  username: [
    { required: true, message: copy.value.usernameRequired, trigger: 'blur' },
    { min: 2, max: 50, message: copy.value.usernameLength, trigger: 'blur' },
  ],
  password: [
    { required: true, message: copy.value.passwordRequired, trigger: 'blur' },
    { min: 6, max: 100, message: copy.value.passwordLength, trigger: 'blur' },
  ],
}))

function setLocale(locale: LocaleCode): void {
  localeStore.setLocale(locale)
}

function resolveRedirect(path: string | undefined, fallbackPath: string): string {
  if (!path || !path.startsWith('/') || path.startsWith('//') || /[\\\r\n]/.test(path)) {
    return fallbackPath
  }
  const resolved = router.resolve(path)
  return resolved.name && resolved.name !== 'NotFound' ? path : fallbackPath
}

async function handleLogin(): Promise<void> {
  const form = formRef.value
  if (!form) return

  const errors = await form.validate().catch(() => true)
  if (errors) return

  loading.value = true
  try {
    await login(loginForm)
    Message.success(copy.value.success)
    const fallbackPath = getFirstAccessiblePath(
      userInfo.value?.permissions ?? [],
      userInfo.value?.roles ?? [],
    ) ?? '/forbidden'
    await router.push(resolveRedirect(route.query.redirect as string | undefined, fallbackPath))
  } catch {
    Message.error(copy.value.failure)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="brand-panel" :aria-label="t('app.title')">
      <div class="brand-top">
        <img src="@/assets/logo.svg" alt="" class="brand-logo" />
        <div class="brand-name">
          <strong>{{ platformName }}</strong>
          <span>{{ t('app.title') }}</span>
        </div>
      </div>

      <div class="brand-statement">
        <span class="brand-eyebrow">{{ copy.eyebrow }}</span>
        <h1>{{ copy.brandTitle }}</h1>
        <p>{{ copy.brandMeta }}</p>
      </div>

      <div class="brand-footer">
        <span>DC / 2026</span>
        <span>APAC / MENA</span>
      </div>
      <span class="brand-watermark" aria-hidden="true">D</span>
    </section>

    <section class="login-workspace">
      <div class="language-switch" :aria-label="t('login.languageAria')">
        <button
          type="button"
          :class="{ active: localeStore.currentLocale === 'zh-CN' }"
          @click="setLocale('zh-CN')"
        >
          {{ t('shell.locale.zhCN') }}
        </button>
        <button
          type="button"
          :class="{ active: localeStore.currentLocale === 'en-US' }"
          @click="setLocale('en-US')"
        >
          EN
        </button>
      </div>

      <div class="login-panel">
        <header class="login-header">
          <span class="login-kicker">{{ t('login.accountAccess') }}</span>
          <h2>{{ copy.welcome }}</h2>
          <p>{{ copy.introduction }}</p>
        </header>

        <a-form
          ref="loginFormRef"
          :model="loginForm"
          :rules="rules"
          class="login-form"
          layout="vertical"
          @submit-success="handleLogin"
        >
          <a-form-item :label="copy.username" field="username">
            <a-input
              v-model="loginForm.username"
              :placeholder="copy.username"
              size="large"
              :input-attrs="{ autocomplete: 'username' }"
              allow-clear
            >
              <template #prefix>
                <IconUser />
              </template>
            </a-input>
          </a-form-item>

          <a-form-item :label="copy.password" field="password">
            <a-input
              v-model="loginForm.password"
              :type="passwordVisible ? 'text' : 'password'"
              :placeholder="copy.password"
              size="large"
              :input-attrs="{ autocomplete: 'current-password' }"
            >
              <template #prefix>
                <IconLock />
              </template>
              <template #suffix>
                <button
                  type="button"
                  class="password-visibility"
                  :aria-label="passwordVisible ? copy.hidePassword : copy.showPassword"
                  @click="passwordVisible = !passwordVisible"
                >
                  <IconEyeInvisible v-if="passwordVisible" />
                  <IconEye v-else />
                </button>
              </template>
            </a-input>
          </a-form-item>

          <a-button
            type="primary"
            size="large"
            class="login-button"
            :loading="loading"
            html-type="submit"
          >
            <span>{{ copy.submit }}</span>
            <IconRight />
          </a-button>
        </a-form>

        <footer class="login-footer">
          <IconLock />
          <span>{{ copy.security }}</span>
        </footer>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss">
.password-visibility {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  color: var(--color-text-3);
  background: transparent;
  cursor: pointer;
}

.login-page {
  width: 100%;
  min-height: 100dvh;
  display: grid;
  grid-template-columns: minmax(360px, 0.9fr) minmax(520px, 1.1fr);
  background: #f7f8fa;
}

.brand-panel {
  position: relative;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: clamp(28px, 4vw, 58px);
  background: #f2f6ff;
  color: #1d2129;
  overflow: hidden;
}

.brand-panel::before,
.brand-panel::after {
  position: absolute;
  z-index: 0;
  content: '';
  background: rgba(22, 93, 255, 0.08);
}

.brand-panel::before {
  top: 0;
  right: 22%;
  width: 1px;
  height: 100%;
}

.brand-panel::after {
  right: 0;
  bottom: 24%;
  width: 100%;
  height: 1px;
}

.brand-top,
.brand-statement,
.brand-footer {
  position: relative;
  z-index: 2;
}

.brand-top {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-logo {
  width: 42px;
  height: 42px;
}

.brand-name {
  display: flex;
  flex-direction: column;
}

.brand-name strong {
  font-size: 17px;
  font-weight: 650;
}

.brand-name span {
  margin-top: 2px;
  color: #86909c;
  font-size: 11px;
}

.brand-statement {
  max-width: 520px;
  margin: 80px 0;
}

.brand-eyebrow,
.login-kicker {
  color: #165dff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.brand-statement h1 {
  margin-top: 18px;
  color: #1d2129;
  font-size: clamp(38px, 4.2vw, 66px);
  font-weight: 580;
  line-height: 1.12;
  letter-spacing: 0;
  text-wrap: balance;
}

.brand-statement p {
  margin-top: 22px;
  color: #4e5969;
  font-size: 14px;
}

.brand-footer {
  display: flex;
  justify-content: space-between;
  color: #86909c;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
}

.brand-watermark {
  position: absolute;
  right: -32px;
  bottom: -110px;
  z-index: 1;
  color: rgba(22, 93, 255, 0.045);
  font-size: 390px;
  font-weight: 700;
  line-height: 1;
  user-select: none;
}

.login-workspace {
  position: relative;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 72px 48px;
}

.language-switch {
  position: absolute;
  top: 28px;
  right: 32px;
  display: inline-flex;
  padding: 3px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  background: #fff;
}

.language-switch button {
  min-width: 46px;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #86909c;
  font-size: 12px;
  cursor: pointer;
}

.language-switch button.active {
  background: #e8f3ff;
  color: #165dff;
  font-weight: 650;
}

.login-panel {
  width: min(100%, 430px);
}

.login-header {
  margin-bottom: 34px;
}

.login-header h2 {
  margin-top: 12px;
  color: #1d2129;
  font-size: 30px;
  font-weight: 620;
  line-height: 1.2;
}

.login-header p {
  margin-top: 9px;
  color: #86909c;
  font-size: 14px;
}

.login-form :deep(.arco-form-item) {
  margin-bottom: 22px;
}

.login-form :deep(.arco-form-item__label) {
  padding-bottom: 7px;
  color: #4e5969;
  font-size: 13px;
  font-weight: 600;
}

.login-form :deep(.arco-input__wrapper) {
  min-height: 48px;
  padding: 0 14px;
  background: #fff;
}

.login-button {
  width: 100%;
  min-height: 48px;
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  padding: 0 18px;
  font-size: 14px;
}

.login-footer {
  margin-top: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: #86909c;
  font-size: 12px;
}

@media (max-width: 900px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .brand-panel {
    min-height: auto;
    padding: 24px;
  }

  .brand-statement {
    margin: 54px 0 48px;
  }

  .brand-statement h1 {
    max-width: 640px;
    font-size: clamp(34px, 8vw, 48px);
  }

  .login-workspace {
    min-height: auto;
    padding: 84px 24px 48px;
  }

  .language-switch {
    top: 24px;
    right: 24px;
  }
}

@media (max-width: 520px) {
  .brand-statement {
    margin: 44px 0 40px;
  }

  .brand-statement h1 {
    font-size: 34px;
  }

  .brand-footer span:last-child {
    display: none;
  }
}
</style>
