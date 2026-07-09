import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'

import { authApi } from '@/api/auth'
import { useFilePreview } from '@/composables/useFilePreview'
import { setToken, removeToken, setUserInfo, getUserInfo, getToken } from '@/utils/auth'
import type { LoginForm, UserInfo } from '@/types/user'
import router from '@/router'

export const useUserStore = defineStore('user', () => {
  const userInfo = ref<UserInfo | null>(getUserInfo())
  const token = ref<string | null>(getToken())
  const profileInitialized = shallowRef(false)

  const isLoggedIn = computed(() => !!token.value)

  const login = async (loginForm: LoginForm): Promise<void> => {
    try {
      const result = await authApi.login(loginForm)
      // Interceptor already unwrapped { code, message, data } → data
      const { accessToken } = result
      token.value = accessToken
      setToken(accessToken)

      // Fetch user profile after login
      await fetchProfile()
    } catch (error) {
      resetState()
      throw error
    }
  }

  const fetchProfile = async (): Promise<void> => {
    const profile = await authApi.getProfile()
    const userId = profile.id ?? profile.sub
    if (!userId) {
      throw new Error('用户资料缺少用户标识')
    }
    if (!Array.isArray(profile.roles) || !Array.isArray(profile.permissions)) {
      throw new Error('用户资料角色或权限格式错误')
    }
    if (
      !profile.roles.every((role) => typeof role === 'string') ||
      !profile.permissions.every((permission) => typeof permission === 'string')
    ) {
      throw new Error('用户资料角色或权限格式错误')
    }
    // Interceptor already unwrapped → profile is the UserProfile directly
    const user: UserInfo = {
      id: userId,
      username: profile.username,
      realName: profile.realName,
      email: profile.email ?? '',
      avatar: profile.avatar,
      roles: profile.roles,
      permissions: profile.permissions,
    }
    userInfo.value = user
    profileInitialized.value = true
    setUserInfo(user)
  }

  const ensureProfile = async (): Promise<void> => {
    if (!profileInitialized.value) {
      await fetchProfile()
    }
  }

  const logout = async (): Promise<void> => {
    try {
      await authApi.logout()
    } catch {
      // Ignore logout API errors
    } finally {
      resetState()
      router.push('/login')
    }
  }

  const resetState = (): void => {
    token.value = null
    userInfo.value = null
    profileInitialized.value = false
    removeToken()
    useFilePreview().closePreview()
  }

  return {
    userInfo,
    token,
    isLoggedIn,
    profileInitialized,
    login,
    fetchProfile,
    ensureProfile,
    logout,
    resetState,
  }
})
