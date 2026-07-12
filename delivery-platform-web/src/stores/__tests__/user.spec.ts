import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { authApi } from '@/api/auth'
import { useFilePreview } from '@/composables/useFilePreview'
import router from '@/router'
import { useUserStore } from '@/store/user'
import type { LoginResult, UserProfile } from '@/types/user'
import { removeToken, setToken } from '@/utils/auth'

vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    getProfile: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
  },
}))

vi.mock('@/router', () => ({
  default: {
    push: vi.fn(() => Promise.resolve()),
  },
}))

const profile: UserProfile = {
  sub: 'user-1',
  username: 'admin',
  realName: '管理员',
  email: 'admin@test.com',
  roles: ['SUPER_ADMIN'],
  permissions: ['user:view', 'project:view'],
}

function sessionResult(overrides: Partial<LoginResult> = {}): LoginResult {
  return {
    accessToken: 'test-token-123',
    user: profile,
    defaultRoute: '/dashboard',
    ...overrides,
  }
}

describe('useUserStore', () => {
  beforeEach(() => {
    removeToken()
    localStorage.clear()
    setActivePinia(createPinia())
    useFilePreview().closePreview()
    vi.clearAllMocks()
  })

  it('creates an in-memory session from the login response', async () => {
    vi.mocked(authApi.login).mockResolvedValue(sessionResult())

    const store = useUserStore()
    await store.login({ username: 'admin', password: 'password123' })

    expect(store.token).toBe('test-token-123')
    expect(store.userInfo?.id).toBe('user-1')
    expect(store.userInfo?.roles).toEqual(['SUPER_ADMIN'])
    expect(store.isLoggedIn).toBe(true)
    expect(localStorage.getItem('delivery_token')).toBeNull()
    expect(localStorage.getItem('delivery_user_info')).toBeNull()
    expect(authApi.getProfile).not.toHaveBeenCalled()
  })

  it('normalizes an id returned directly by the backend', async () => {
    vi.mocked(authApi.login).mockResolvedValue(sessionResult({
      user: { ...profile, id: 'direct-user-id', sub: undefined },
    }))

    const store = useUserStore()
    await store.login({ username: 'admin', password: 'password123' })

    expect(store.userInfo?.id).toBe('direct-user-id')
  })

  it('rejects malformed role data and clears the partial session', async () => {
    vi.mocked(authApi.login).mockResolvedValue(sessionResult({
      user: {
        ...profile,
        roles: 'SUPER_ADMIN',
      } as unknown as UserProfile,
    }))

    const store = useUserStore()

    await expect(store.login({ username: 'admin', password: 'password123' })).rejects.toThrow(
      '用户资料角色或权限格式错误',
    )
    expect(store.userInfo).toBeNull()
    expect(store.token).toBeNull()
  })

  it('restores a page-load session once for concurrent callers', async () => {
    let resolveRefresh!: (result: LoginResult) => void
    vi.mocked(authApi.refreshToken).mockImplementation(
      () => new Promise<LoginResult>((resolve) => {
        resolveRefresh = resolve
      }),
    )

    const store = useUserStore()
    const first = store.restoreSession()
    const second = store.ensureSession()
    resolveRefresh(sessionResult({ accessToken: 'restored-token' }))

    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(true)
    expect(authApi.refreshToken).toHaveBeenCalledOnce()
    expect(authApi.refreshToken).toHaveBeenCalledWith()
    expect(store.token).toBe('restored-token')
    expect(store.isLoggedIn).toBe(true)
  })

  it('marks the browser anonymous when refresh-cookie restoration fails', async () => {
    vi.mocked(authApi.refreshToken).mockRejectedValue(new Error('unauthorized'))

    const store = useUserStore()

    await expect(store.ensureSession()).resolves.toBe(false)
    await expect(store.ensureSession()).resolves.toBe(false)
    expect(authApi.refreshToken).toHaveBeenCalledOnce()
    expect(store.sessionInitialized).toBe(true)
    expect(store.isLoggedIn).toBe(false)
  })

  it('hydrates the profile when an in-memory token already exists', async () => {
    setToken('existing-token')
    vi.mocked(authApi.getProfile).mockResolvedValue(profile)

    const store = useUserStore()

    await expect(store.ensureSession()).resolves.toBe(true)
    expect(authApi.refreshToken).not.toHaveBeenCalled()
    expect(authApi.getProfile).toHaveBeenCalledOnce()
    expect(store.userInfo?.id).toBe('user-1')
  })

  it('clears state and redirects even when the logout request fails', async () => {
    vi.mocked(authApi.login).mockResolvedValue(sessionResult())
    vi.mocked(authApi.logout).mockRejectedValue(new Error('network'))

    const store = useUserStore()
    await store.login({ username: 'admin', password: 'password123' })
    await store.logout()

    expect(store.token).toBeNull()
    expect(store.userInfo).toBeNull()
    expect(store.isLoggedIn).toBe(false)
    expect(router.push).toHaveBeenCalledWith('/login')
  })

  it('closes an open file preview when the session is reset', async () => {
    vi.mocked(authApi.login).mockResolvedValue(sessionResult())

    const store = useUserStore()
    await store.login({ username: 'admin', password: 'password123' })
    const filePreview = useFilePreview()
    filePreview.openPreview({ id: 'file-1' })

    store.resetState()

    expect(filePreview.visible.value).toBe(false)
    expect(store.token).toBeNull()
    expect(store.userInfo).toBeNull()
  })
})
