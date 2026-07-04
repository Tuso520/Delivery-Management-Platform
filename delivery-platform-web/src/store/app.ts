import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeMode = 'light' | 'dark'
export type Language = 'zh-CN' | 'en-US' | 'th-TH' | 'vi-VN'

export const useAppStore = defineStore(
  'app',
  () => {
    const sidebarCollapsed = ref(false)
    const theme = ref<ThemeMode>('light')
    const language = ref<Language>((localStorage.getItem('lang') as Language) || 'zh-CN')

    const toggleSidebar = (): void => {
      sidebarCollapsed.value = !sidebarCollapsed.value
    }

    const setSidebarCollapsed = (collapsed: boolean): void => {
      sidebarCollapsed.value = collapsed
    }

    const setTheme = (newTheme: ThemeMode): void => {
      theme.value = newTheme
    }

    const toggleTheme = (): void => {
      theme.value = theme.value === 'light' ? 'dark' : 'light'
    }

    const setLanguage = (lang: Language): void => {
      language.value = lang
      localStorage.setItem('lang', lang)
    }

    return {
      sidebarCollapsed,
      theme,
      language,
      toggleSidebar,
      setSidebarCollapsed,
      setTheme,
      toggleTheme,
      setLanguage,
    }
  },
)
