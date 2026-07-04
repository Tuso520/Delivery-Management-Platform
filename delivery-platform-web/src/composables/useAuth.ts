import { computed } from 'vue'
import { useUserStore } from '@/store/user'
import type { LoginForm } from '@/types/user'

export function useAuth() {
  const userStore = useUserStore()

  const isLoggedIn = computed(() => userStore.isLoggedIn)
  const userInfo = computed(() => userStore.userInfo)

  const login = async (loginForm: LoginForm): Promise<void> => {
    await userStore.login(loginForm)
  }

  const logout = async (): Promise<void> => {
    await userStore.logout()
  }

  const refreshProfile = async (): Promise<void> => {
    await userStore.fetchProfile()
  }

  return {
    isLoggedIn,
    userInfo,
    login,
    logout,
    refreshProfile,
  }
}
