import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import { authApi } from '@/api/auth'
import { isExplicitSessionRejection } from '@/api/session-error'
import { setSessionRefreshHandler } from '@/api/session-refresh'
import { useFilePreview } from '@/platform/file-preview/useFilePreview'
import { queryClient } from '@/query/client'
import router from '@/router'
import type { LoginForm, LoginResult, UserInfo, UserProfile } from '@/types/user'
import { getToken, removeToken, setToken } from '@/utils/auth'
import { suppressFeishuAutoLogin } from '@/utils/feishu-client'

function normalizeUser(profile: UserProfile): UserInfo {
  const userId = profile.id ?? profile.sub
  if (!userId) {
    throw new Error('用户资料缺少用户标识')
  }
  if (!Array.isArray(profile.roles) || !Array.isArray(profile.permissions)) {
    throw new Error('用户资料角色或权限格式错误')
  }
  if (
    !profile.roles.every((role) => typeof role === 'string')
    || !profile.permissions.every((permission) => typeof permission === 'string')
  ) {
    throw new Error('用户资料角色或权限格式错误')
  }

  return {
    id: userId,
    username: profile.username,
    realName: profile.realName,
    email: profile.email ?? '',
    avatar: profile.avatar?.trim() || undefined,
    roles: profile.roles,
    permissions: profile.permissions,
  }
}

export const useUserStore = defineStore('user', () => {
  const userInfo = ref<UserInfo | null>(null)
  const token = ref<string | null>(getToken())
  const profileInitialized = shallowRef(false)
  const sessionInitialized = shallowRef(false)
  let sessionRestorePromise: Promise<boolean> | null = null

  const isLoggedIn = computed(
    () => Boolean(token.value && userInfo.value && profileInitialized.value),
  )

  const applySession = (result: LoginResult): void => {
    if (!result.accessToken) {
      throw new Error('登录响应缺少访问令牌')
    }

    const user = normalizeUser(result.user)
    setToken(result.accessToken)
    token.value = result.accessToken
    userInfo.value = user
    profileInitialized.value = true
    sessionInitialized.value = true
  }

  const resetState = (): void => {
    token.value = null
    userInfo.value = null
    profileInitialized.value = false
    sessionInitialized.value = true
    removeToken()
    queryClient.clear()
    useFilePreview().closePreview()
  }

  setSessionRefreshHandler(applySession)

  const login = async (loginForm: LoginForm): Promise<void> => {
    try {
      applySession(await authApi.login(loginForm))
    } catch (error) {
      resetState()
      throw error
    }
  }

  const completeFeishuLogin = async (ticket: string): Promise<string> => {
    try {
      const result = await authApi.completeFeishuLogin(ticket)
      applySession(result)
      return result.defaultRoute
    } catch (error) {
      resetState()
      throw error
    }
  }

  const fetchProfile = async (): Promise<void> => {
    userInfo.value = normalizeUser(await authApi.getProfile())
    token.value = getToken()
    profileInitialized.value = true
    sessionInitialized.value = true
  }

  const restoreSession = (): Promise<boolean> => {
    if (isLoggedIn.value) {
      sessionInitialized.value = true
      return Promise.resolve(true)
    }
    if (sessionRestorePromise) {
      return sessionRestorePromise
    }

    sessionRestorePromise = (async () => {
      try {
        applySession(await authApi.refreshToken())
        return true
      } catch (error) {
        if (isExplicitSessionRejection(error)) {
          resetState()
          return false
        }
        sessionInitialized.value = false
        throw error
      }
    })().finally(() => {
      sessionRestorePromise = null
    })

    return sessionRestorePromise
  }

  const ensureSession = async (): Promise<boolean> => {
    if (isLoggedIn.value) return true
    if (sessionRestorePromise) return sessionRestorePromise

    if (token.value) {
      try {
        await fetchProfile()
        return isLoggedIn.value
      } catch (error) {
        if (isExplicitSessionRejection(error)) {
          resetState()
          return false
        }
        throw error
      }
    }

    if (sessionInitialized.value) return false
    return restoreSession()
  }

  const logout = async (): Promise<void> => {
    suppressFeishuAutoLogin()
    try {
      await authApi.logout()
    } catch {
      // 本地会话仍必须清理。
    } finally {
      resetState()
      await router.push('/login')
    }
  }

  return {
    userInfo,
    token,
    isLoggedIn,
    profileInitialized,
    sessionInitialized,
    login,
    completeFeishuLogin,
    fetchProfile,
    restoreSession,
    ensureSession,
    logout,
    resetState,
  }
})
