import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: {
    post: mocks.post,
    get: vi.fn(),
  },
}))

import { authApi } from '@/api/auth'

describe('authApi', () => {
  beforeEach(() => {
    mocks.post.mockReset()
  })

  it('refreshes from the HttpOnly cookie without a request body', () => {
    authApi.refreshToken()

    expect(mocks.post).toHaveBeenCalledWith('/auth/refresh', undefined, {
      silent: true,
      skipAuthRefresh: true,
    })
  })

  it('does not try to refresh an invalid login request', () => {
    const credentials = { username: 'admin', password: 'password123' }

    authApi.login(credentials)

    expect(mocks.post).toHaveBeenCalledWith('/auth/login', credentials, {
      silent: true,
      skipAuthRefresh: true,
    })
  })
})
