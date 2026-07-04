import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import i18n from '@/locales'

export type LocaleCode = 'zh-CN' | 'en-US'

export const useLocaleStore = defineStore('locale', () => {
  const currentLocale = ref<LocaleCode>(
    localStorage.getItem('lang') === 'en-US' ? 'en-US' : 'zh-CN',
  )

  const isRTL = computed(() => false)

  function setLocale(locale: LocaleCode) {
    currentLocale.value = locale
    localStorage.setItem('lang', locale)
    i18n.global.locale.value = locale
  }

  return { currentLocale, isRTL, setLocale }
})
