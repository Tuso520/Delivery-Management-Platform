<script setup lang="ts">
import { computed, onMounted, reactive, shallowRef, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import type { FormInstance } from '@arco-design/web-vue'
import type { FormRules } from '@/types/arco'
import { useAuth } from '@/composables/useAuth'
import { useLocaleStore } from '@/store/locale'
import type { LocaleCode } from '@/store/locale'
import type { LoginForm } from '@/types/user'
import { systemConfigApi } from '@/api/system'

const router = useRouter()
const route = useRoute()
const { login } = useAuth()
const localeStore = useLocaleStore()

const formRef = useTemplateRef<FormInstance>('loginFormRef')
const loading = shallowRef(false)
const platformName = shallowRef('交付管理平台')
const loginSlogan = shallowRef('让交付工作保持高效、清晰、有序。')

const loginForm = reactive<LoginForm>({
  username: '',
  password: '',
})

const copy = computed(() => {
  const english = localeStore.currentLocale === 'en-US'
  return english
    ? {
        eyebrow: 'GLOBAL DELIVERY WORKSPACE',
        brandTitle: 'Delivery management, kept in one clear system.',
        brandMeta: 'Projects / Standards / Knowledge',
        welcome: 'Welcome back',
        introduction: 'Sign in with your organization account.',
        username: 'Username',
        password: 'Password',
        usernameRequired: 'Enter your username',
        usernameLength: 'Username must contain 2 to 50 characters',
        passwordRequired: 'Enter your password',
        passwordLength: 'Password must contain 6 to 100 characters',
        submit: 'Sign in',
        success: 'Signed in',
        failure: 'Sign-in failed. Check your username and password.',
        security: 'Protected organization access',
      }
    : {
        eyebrow: 'GLOBAL DELIVERY WORKSPACE',
        brandTitle: loginSlogan.value,
        brandMeta: '项目 / 标准 / 知识',
        welcome: '欢迎回来',
        introduction: '使用组织账号登录交付管理平台。',
        username: '用户名',
        password: '密码',
        usernameRequired: '请输入用户名',
        usernameLength: '用户名长度为 2 到 50 个字符',
        passwordRequired: '请输入密码',
        passwordLength: '密码长度为 6 到 100 个字符',
        submit: '登录',
        success: '登录成功',
        failure: '登录失败，请检查用户名和密码',
        security: '企业账号安全访问',
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

onMounted(async () => {
  try {
    const config = await systemConfigApi.getPublic()
    platformName.value = config['platform.name'] || platformName.value
    loginSlogan.value = config['platform.login_slogan'] || loginSlogan.value
  } catch {
    // 登录不依赖公开配置接口。
  }
})

function resolveRedirect(path?: string): string {
  if (!path || !path.startsWith('/') || path.startsWith('//') || /[\\\r\n]/.test(path)) {
    return '/dashboard'
  }
  const resolved = router.resolve(path)
  return resolved.name && resolved.name !== 'NotFound' ? path : '/dashboard'
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
    await router.push(resolveRedirect(route.query.redirect as string | undefined))
  } catch {
    Message.error(copy.value.failure)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="brand-panel" aria-label="交付管理平台">
      <div class="brand-top">
        <img src="@/assets/logo.svg" alt="" class="brand-logo" />
        <div class="brand-name">
          <strong>{{ platformName }}</strong>
          <span>Delivery Management Platform</span>
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
      <div class="language-switch" aria-label="Language">
        <button
          type="button"
          :class="{ active: localeStore.currentLocale === 'zh-CN' }"
          @click="setLocale('zh-CN')"
        >
          中文
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
          <span class="login-kicker">ACCOUNT ACCESS</span>
          <h2>{{ copy.welcome }}</h2>
          <p>{{ copy.introduction }}</p>
        </header>

        <a-form
          ref="loginFormRef"
          :model="loginForm"
          :rules="rules"
          class="login-form"
          label-position="top"
          @keyup.enter="handleLogin"
        >
          <a-form-item :label="copy.username" prop="username">
            <a-input
              v-model="loginForm.username"
              :placeholder="copy.username"
              :prefix-icon="'User'"
              size="large"
              autocomplete="username"
              clearable
            />
          </a-form-item>

          <a-form-item :label="copy.password" prop="password">
            <a-input
              v-model="loginForm.password"
              type="password"
              :placeholder="copy.password"
              :prefix-icon="'Lock'"
              size="large"
              autocomplete="current-password"
              show-password
            />
          </a-form-item>

          <a-button
            type="primary"
            size="large"
            class="login-button"
            :loading="loading"
            @click="handleLogin"
          >
            <span>{{ copy.submit }}</span>
            <a-icon><Right /></a-icon>
          </a-button>
        </a-form>

        <footer class="login-footer">
          <a-icon><Lock /></a-icon>
          <span>{{ copy.security }}</span>
        </footer>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss">
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
