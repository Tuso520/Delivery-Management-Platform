import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  refreshSessionRequest: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: {
    post: mocks.post,
    get: vi.fn(),
  },
  refreshSessionRequest: mocks.refreshSessionRequest,
}))

import { authApi } from '@/api/auth'

describe('authApi', () => {
  beforeEach(() => {
    mocks.post.mockReset()
    mocks.refreshSessionRequest.mockReset()
  })

  it('refreshes from the HttpOnly cookie without a request body', () => {
    authApi.refreshToken()

    expect(mocks.refreshSessionRequest).toHaveBeenCalledOnce()
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
