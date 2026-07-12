/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    titleEn?: string
    icon?: string
    roles?: string[]
    permissions?: string[]
    navigationGroup?: 'main' | 'settings'
    menu?: boolean
    order?: number
    hidden?: boolean
    keepAlive?: boolean
  }
}

export {}
