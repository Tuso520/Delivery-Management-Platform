import router from './index'
import { menuItems } from './index'
import { useUserStore } from '@/store/user'
import { findFirstAccessibleMenuPath } from '@/store/permission'
import { Message } from '@arco-design/web-vue'

const whiteList = ['/login']

function getFallbackPath(
  permissions: string[],
  roles: string[],
): string | null {
  return findFirstAccessibleMenuPath(menuItems, permissions, roles)
}

router.beforeEach(async (to, _from, next) => {
  const userStore = useUserStore()

  if (userStore.isLoggedIn) {
    if (to.path === '/login') {
      next({ path: '/dashboard' })
    } else {
      try {
        await userStore.ensureProfile()
        // Route-level permission check
        if (to.meta?.permissions) {
          const requiredPerms = to.meta.permissions as string[]
          const isSuperAdmin = userStore.userInfo?.roles.includes('SUPER_ADMIN') ?? false
          const hasPerm = isSuperAdmin ||
            requiredPerms.some(p => userStore.userInfo?.permissions?.includes(p))
          if (!hasPerm) {
            Message.error('没有权限访问此页面')
            const fallbackPath = getFallbackPath(
              userStore.userInfo?.permissions ?? [],
              userStore.userInfo?.roles ?? [],
            )
            if (fallbackPath && fallbackPath !== to.path) {
              next(fallbackPath)
            } else {
              userStore.resetState()
              next('/login')
            }
            return
          }
        }
        next()
      } catch {
        userStore.resetState()
        Message.error('获取用户信息失败，请重新登录')
        next('/login')
      }
    }
  } else {
    if (whiteList.includes(to.path)) {
      next()
    } else {
      next('/login')
    }
  }
})
