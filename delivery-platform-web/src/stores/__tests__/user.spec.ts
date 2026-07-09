import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUserStore } from '@/store/user'
import { authApi } from '@/api/auth'
import { useFilePreview } from '@/composables/useFilePreview'
import router from '@/router'

// Mock the API module
vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    getProfile: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
  },
}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()
Object.defineProperty(global, 'localStorage', { value: localStorageMock })

// Mock router
vi.mock('@/router', () => ({
  default: {
    push: vi.fn(),
  },
}))

describe('useUserStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
    useFilePreview().closePreview()
    vi.clearAllMocks()
  })

  describe('login', () => {
    it('normalizes the backend sub field as the frontend user id', async () => {
      vi.mocked(authApi.login).mockResolvedValue({ accessToken: 'token' })
      vi.mocked(authApi.getProfile).mockResolvedValue({
        sub: 'user-from-sub',
        username: 'admin',
        realName: '管理员',
        email: 'admin@test.com',
        roles: ['SUPER_ADMIN'],
        permissions: ['dashboard:view'],
      } as unknown as Awaited<ReturnType<typeof authApi.getProfile>>)

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'pass' })

      expect(store.userInfo?.id).toBe('user-from-sub')
    })

    it('should store token and fetch profile on successful login', async () => {
      const mockLoginResult = { accessToken: 'test-token-123' }
      const mockProfile = {
        id: 'user-1',
        username: 'admin',
        realName: '管理员',
        email: 'admin@test.com',
        roles: ['SUPER_ADMIN'],
        permissions: ['user:view', 'project:view'],
      }

      vi.mocked(authApi.login).mockResolvedValue(mockLoginResult)
      vi.mocked(authApi.getProfile).mockResolvedValue(mockProfile)

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'password123' })

      expect(store.token).toBe('test-token-123')
      expect(store.userInfo).toBeDefined()
      expect(store.userInfo?.id).toBe('user-1')
      expect(store.userInfo?.username).toBe('admin')
      expect(store.userInfo?.roles).toEqual(['SUPER_ADMIN'])
      expect(store.userInfo?.permissions).toEqual(['user:view', 'project:view'])
      expect(localStorageMock.setItem).toHaveBeenCalledWith('delivery_token', 'test-token-123')
    })

    it('should call login and fetchProfile in sequence', async () => {
      vi.mocked(authApi.login).mockResolvedValue({ accessToken: 'token' })
      vi.mocked(authApi.getProfile).mockResolvedValue({
        id: 'user-1',
        username: 'admin',
        realName: '管理员',
        email: 'admin@test.com',
        roles: [],
        permissions: [],
      })

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'pass' })

      expect(authApi.login).toHaveBeenCalledTimes(1)
      expect(authApi.getProfile).toHaveBeenCalledTimes(1)
    })

    it('rejects malformed role data from the profile API', async () => {
      vi.mocked(authApi.login).mockResolvedValue({ accessToken: 'token' })
      vi.mocked(authApi.getProfile).mockResolvedValue({
        id: 'user-1',
        username: 'admin',
        realName: '管理员',
        email: 'admin@test.com',
        roles: 'SUPER_ADMIN',
        permissions: [],
      } as unknown as Awaited<ReturnType<typeof authApi.getProfile>>)

      const store = useUserStore()

      await expect(store.login({ username: 'admin', password: 'pass' })).rejects.toThrow(
        '用户资料角色或权限格式错误',
      )
      expect(store.userInfo).toBeNull()
      expect(store.token).toBeNull()
    })
  })

  describe('isLoggedIn', () => {
    it('should return true when token exists', async () => {
      vi.mocked(authApi.login).mockResolvedValue({ accessToken: 'token' })
      vi.mocked(authApi.getProfile).mockResolvedValue({
        id: 'user-1',
        username: 'admin',
        realName: '管理员',
        email: 'admin@test.com',
        roles: [],
        permissions: [],
      })

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'pass' })

      expect(store.isLoggedIn).toBe(true)
    })

    it('should return false when token is null', () => {
      const store = useUserStore()
      expect(store.isLoggedIn).toBe(false)
    })

    it('should return false after logout clears token', async () => {
      vi.mocked(authApi.login).mockResolvedValue({ accessToken: 'token' })
      vi.mocked(authApi.getProfile).mockResolvedValue({
        id: 'user-1',
        username: 'admin',
        realName: '管理员',
        email: 'admin@test.com',
        roles: [],
        permissions: [],
      })
      vi.mocked(authApi.logout).mockResolvedValue(undefined)

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'pass' })
      await store.logout()

      expect(store.isLoggedIn).toBe(false)
    })
  })

  describe('logout', () => {
    it('should clear state and redirect to login', async () => {
      vi.mocked(authApi.login).mockResolvedValue({ accessToken: 'token' })
      vi.mocked(authApi.getProfile).mockResolvedValue({
        id: 'user-1',
        username: 'admin',
        realName: '管理员',
        email: 'admin@test.com',
        roles: [],
        permissions: [],
      })
      vi.mocked(authApi.logout).mockResolvedValue(undefined)

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'pass' })
      await store.logout()

      expect(store.token).toBeNull()
      expect(store.userInfo).toBeNull()
      expect(router.push).toHaveBeenCalledWith('/login')
    })

    it('should still clear state even if logout API fails', async () => {
      vi.mocked(authApi.login).mockResolvedValue({ accessToken: 'token' })
      vi.mocked(authApi.getProfile).mockResolvedValue({
        id: 'user-1',
        username: 'admin',
        realName: '管理员',
        email: 'admin@test.com',
        roles: [],
        permissions: [],
      })
      vi.mocked(authApi.logout).mockRejectedValue(new Error('Network error'))

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'pass' })
      await store.logout()

      expect(store.token).toBeNull()
      expect(store.userInfo).toBeNull()
      expect(router.push).toHaveBeenCalledWith('/login')
    })
  })

  describe('resetState', () => {
    it('should clear token, userInfo and an open file preview', async () => {
      vi.mocked(authApi.login).mockResolvedValue({ accessToken: 'token' })
      vi.mocked(authApi.getProfile).mockResolvedValue({
        id: 'user-1',
        username: 'admin',
        realName: '管理员',
        email: 'admin@test.com',
        roles: [],
        permissions: [],
      })

      const store = useUserStore()
      await store.login({ username: 'admin', password: 'pass' })
      const filePreview = useFilePreview()
      filePreview.openPreview({ id: 'file-1', source: 'file' })
      store.resetState()

      expect(store.token).toBeNull()
      expect(store.userInfo).toBeNull()
      expect(filePreview.visible.value).toBe(false)
    })
  })
})
