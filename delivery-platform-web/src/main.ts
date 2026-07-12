import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import ArcoVue from '@arco-design/web-vue'
import '@arco-design/web-vue/dist/arco.css'
import App from './App.vue'
import router from './router'
import i18n from './locales'
import { queryClient } from './query/client'
import { useAppStore } from './store/app'
import { clearLegacyAuthStorage } from './utils/auth'
import './styles/global.scss'
import './router/permission'

clearLegacyAuthStorage()

const app = createApp(App)

const pinia = createPinia()

app.use(pinia)
useAppStore(pinia).initializeTheme()
app.use(VueQueryPlugin, { queryClient })
app.use(ArcoVue)
app.use(router)
app.use(i18n)

app.mount('#app')
