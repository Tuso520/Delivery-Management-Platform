import router from './index'
import { getFirstAccessiblePath } from './access'
import { useUserStore } from '@/store/user'
import { Message } from '@arco-design/web-vue'

router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()
  const hasSession = await userStore.ensureSession()

  if (to.path === '/login') {
    if (hasSession) {
      const landingPath = getFirstAccessiblePath(
        userStore.userInfo?.permissions ?? [],
        userStore.userInfo?.roles ?? [],
      )
      next(landingPath ?? '/forbidden')
    } else {
      next()
    }
    return
  }

  if (!hasSession) {
    next({ path: '/login', query: { redirect: to.fullPath } })
    return
  }

  // Redirected legacy setting routes retain their original, narrower permission
  // boundary even though they render the unified settings center.
  const permissionMeta = to.redirectedFrom?.meta.permissions ?? to.meta?.permissions
  if (permissionMeta) {
    const requiredPerms = permissionMeta as string[]
    const isSuperAdmin = userStore.userInfo?.roles.includes('SUPER_ADMIN') ?? false
    const hasPerm = isSuperAdmin ||
      requiredPerms.some(p => userStore.userInfo?.permissions?.includes(p))
    if (!hasPerm) {
      if (from.path !== '/login') Message.error('没有权限访问此页面')
      const fallbackPath = getFirstAccessiblePath(
        userStore.userInfo?.permissions ?? [],
        userStore.userInfo?.roles ?? [],
      )
      if (fallbackPath && fallbackPath !== to.path) {
        next(fallbackPath)
      } else {
        next('/forbidden')
      }
      return
    }
  }

  next()
})
