import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import '@arco-design/web-vue/dist/arco.css'
import App from './App.vue'
import { setSessionExpirationHandler } from './api/session-expiration'
import router from './router'
import i18n from './locales'
import { installArcoComponents } from './platform/ui/install-arco-components'
import { queryClient } from './query/client'
import { useAppStore } from './store/app'
import { useUserStore } from './store/user'
import { clearLegacyAuthStorage } from './utils/auth'
import './styles/global.scss'
import './router/permission'

clearLegacyAuthStorage()

const app = createApp(App)

const pinia = createPinia()

app.use(pinia)
setSessionExpirationHandler(async () => {
  useUserStore(pinia).resetState()
  if (router.currentRoute.value.path !== '/login') {
    await router.replace('/login')
  }
})
useAppStore(pinia).initializeTheme()
app.use(VueQueryPlugin, { queryClient })
installArcoComponents(app)
app.use(router)
app.use(i18n)

app.mount('#app')
