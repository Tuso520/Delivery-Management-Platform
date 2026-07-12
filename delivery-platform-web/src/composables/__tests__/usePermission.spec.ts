import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePermission } from '@/composables/usePermission'
import { usePermissionStore } from '@/store/permission'
import { useUserStore } from '@/store/user'

// Mock the router dependency
vi.mock('@/router', () => ({
  default: {
    push: vi.fn(),
  },
}))

describe('usePermission', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const userStore = useUserStore()
    // Set up user with permissions and roles
    userStore.$patch({
      token: 'test-token',
      userInfo: {
        id: 'user-1',
        username: 'admin',
        realName: '管理员',
        email: 'admin@test.com',
        roles: ['SUPER_ADMIN', 'PROJECT_MANAGER'],
        permissions: ['project:view', 'project:create', 'user:view'],
      },
    })
  })

  describe('hasPermission', () => {
    it('should return true when user has the permission or is a super administrator', () => {
      const { hasPermission } = usePermission()
      expect(hasPermission('project:view')).toBe(true)
      expect(hasPermission('project:create')).toBe(true)
      expect(hasPermission('project:delete')).toBe(true)
    })

    it('should return false when user does not have the permission', () => {
      const userStore = useUserStore()
      userStore.$patch({
        userInfo: {
          id: 'user-3',
          username: 'manager',
          realName: '项目经理',
          email: 'manager@test.com',
          roles: ['PROJECT_MANAGER'],
          permissions: ['project:view'],
        },
      })

      const { hasPermission } = usePermission()
      expect(hasPermission('project:delete')).toBe(false)
      expect(hasPermission('file:download')).toBe(false)
    })

    it('should return false for empty string permission', () => {
      const { hasPermission } = usePermission()
      expect(hasPermission('')).toBe(false)
    })

    it('should reflect permission store state changes', () => {
      const userStore = useUserStore()
      userStore.$patch({
        userInfo: {
          id: 'user-3',
          username: 'manager',
          realName: '项目经理',
          email: 'manager@test.com',
          roles: ['PROJECT_MANAGER'],
          permissions: ['project:view'],
        },
      })

      const { hasPermission } = usePermission()
      const permissionStore = usePermissionStore()

      expect(hasPermission('user:delete')).toBe(false)

      // Simulate user getting new permissions
      if (userStore.userInfo) {
        userStore.userInfo.permissions = [...userStore.userInfo.permissions, 'user:delete']
      }

      expect(permissionStore.hasPermission('user:delete')).toBe(true)
    })
  })

  describe('hasAnyPermission', () => {
    it('should return true when user has at least one of the permissions', () => {
      const { hasAnyPermission } = usePermission()
      expect(hasAnyPermission(['project:view', 'project:delete'])).toBe(true)
      expect(hasAnyPermission(['file:download', 'user:view'])).toBe(true)
    })

    it('should return false when user has none of the permissions', () => {
      const userStore = useUserStore()
      userStore.$patch({
        userInfo: {
          id: 'user-3',
          username: 'manager',
          realName: '项目经理',
          email: 'manager@test.com',
          roles: ['PROJECT_MANAGER'],
          permissions: ['project:view'],
        },
      })

      const { hasAnyPermission } = usePermission()
      expect(hasAnyPermission(['file:download', 'system:config'])).toBe(false)
    })

    it('should return false for empty array', () => {
      const { hasAnyPermission } = usePermission()
      expect(hasAnyPermission([])).toBe(false)
    })
  })

  describe('hasAllPermissions', () => {
    it('should return true when user has all permissions', () => {
      const { hasAllPermissions } = usePermission()
      expect(hasAllPermissions(['project:view', 'project:create'])).toBe(true)
    })

    it('should return false when user is missing any permission', () => {
      const userStore = useUserStore()
      userStore.$patch({
        userInfo: {
          id: 'user-3',
          username: 'manager',
          realName: '项目经理',
          email: 'manager@test.com',
          roles: ['PROJECT_MANAGER'],
          permissions: ['project:view'],
        },
      })

      const { hasAllPermissions } = usePermission()
      expect(hasAllPermissions(['project:view', 'project:delete'])).toBe(false)
    })

    it('should return true for empty array', () => {
      const { hasAllPermissions } = usePermission()
      expect(hasAllPermissions([])).toBe(true)
    })
  })

  describe('user without permissions', () => {
    it('should return false for all permission checks when user has no permissions', () => {
      const userStore = useUserStore()
      userStore.$patch({
        userInfo: {
          id: 'user-2',
          username: 'viewer',
          realName: '查看者',
          email: 'viewer@test.com',
          roles: [],
          permissions: [],
        },
      })

      const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermission()

      expect(hasPermission('project:view')).toBe(false)
      expect(hasAnyPermission(['project:view'])).toBe(false)
      expect(hasAllPermissions(['project:view'])).toBe(false)
    })
  })
})
