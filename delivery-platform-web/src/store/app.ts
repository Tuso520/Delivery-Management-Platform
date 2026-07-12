import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = Exclude<ThemeMode, 'system'>

const THEME_STORAGE_KEY = 'delivery-platform:theme'
const DARK_THEME_QUERY = '(prefers-color-scheme: dark)'

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function resolveThemeMode(
  mode: ThemeMode,
  prefersDark: boolean,
): ResolvedTheme {
  return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode
}

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  return isThemeMode(storedTheme) ? storedTheme : 'system'
}

export const useAppStore = defineStore(
  'app',
  () => {
    const sidebarCollapsed = ref(false)
    const theme = ref<ThemeMode>(readStoredTheme())
    const resolvedTheme = ref<ResolvedTheme>('light')
    let themeMediaQuery: MediaQueryList | null = null

    const toggleSidebar = (): void => {
      sidebarCollapsed.value = !sidebarCollapsed.value
    }

    const setSidebarCollapsed = (collapsed: boolean): void => {
      sidebarCollapsed.value = collapsed
    }

    const applyTheme = (): void => {
      if (typeof document === 'undefined') return
      const prefersDark = themeMediaQuery?.matches ?? false
      resolvedTheme.value = resolveThemeMode(theme.value, prefersDark)

      if (resolvedTheme.value === 'dark') {
        document.body.setAttribute('arco-theme', 'dark')
      } else {
        document.body.removeAttribute('arco-theme')
      }
      document.documentElement.dataset.theme = resolvedTheme.value
      document.documentElement.style.colorScheme = resolvedTheme.value
    }

    const handleSystemThemeChange = (): void => {
      if (theme.value === 'system') applyTheme()
    }

    const initializeTheme = (): void => {
      if (typeof window === 'undefined') return
      themeMediaQuery?.removeEventListener('change', handleSystemThemeChange)
      if (typeof window.matchMedia !== 'function') {
        applyTheme()
        return
      }
      themeMediaQuery = window.matchMedia(DARK_THEME_QUERY)
      themeMediaQuery.addEventListener('change', handleSystemThemeChange)
      applyTheme()
    }

    const disposeTheme = (): void => {
      themeMediaQuery?.removeEventListener('change', handleSystemThemeChange)
      themeMediaQuery = null
    }

    const setTheme = (newTheme: ThemeMode): void => {
      theme.value = newTheme
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(THEME_STORAGE_KEY, newTheme)
      }
      applyTheme()
    }

    return {
      sidebarCollapsed,
      theme,
      resolvedTheme,
      toggleSidebar,
      setSidebarCollapsed,
      setTheme,
      initializeTheme,
      disposeTheme,
    }
  },
)
