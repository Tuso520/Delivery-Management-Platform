import router, { accessItems } from './index'
import { getFirstAccessiblePath } from './access'
import { useUserStore } from '@/store/user'
import { canAccess } from '@/platform/permission/access-policy'
import type { PermissionCode } from '@/platform/permission/access-control.generated'
import Message from '@arco-design/web-vue/es/message'

router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()

  if (to.path === '/session-recovery') {
    next()
    return
  }

  let hasSession: boolean
  try {
    hasSession = await userStore.ensureSession()
  } catch {
    Message.error('暂时无法恢复登录状态，请检查网络后重试')
    next({ path: '/session-recovery', query: { redirect: to.fullPath } })
    return
  }

  if (to.path === '/login' || to.path === '/login/feishu/callback') {
    if (hasSession) {
      const landingPath = getFirstAccessiblePath(
        accessItems,
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

  // Route-level permission check
  if (to.meta?.permissions) {
    const requiredPerms = to.meta.permissions as PermissionCode[]
    const hasPerm = canAccess(
      {
        permissions: userStore.userInfo?.permissions ?? [],
        roles: userStore.userInfo?.roles ?? [],
      },
      { any: requiredPerms },
    )
    if (!hasPerm) {
      if (from.path !== '/login') Message.error('没有权限访问此页面')
      const fallbackPath = getFirstAccessiblePath(
        accessItems,
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
