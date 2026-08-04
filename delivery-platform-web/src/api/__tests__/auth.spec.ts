import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  refreshSessionRequest: vi.fn(),
}))

vi.mock('@/api/request', () => ({
  default: {
    post: mocks.post,
    get: mocks.get,
  },
  refreshSessionRequest: mocks.refreshSessionRequest,
}))

import { authApi } from '@/api/auth'

describe('authApi', () => {
  beforeEach(() => {
    mocks.post.mockReset()
    mocks.get.mockReset()
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

  it('starts Feishu OAuth without attaching it to the refresh interceptor', () => {
    authApi.beginFeishuLogin('/project')

    expect(mocks.get).toHaveBeenCalledWith('/auth/feishu/start', {
      params: { redirect: '/project' },
      silent: true,
      skipAuthRefresh: true,
    })
  })

  it('completes Feishu OAuth with a one-time ticket', () => {
    authApi.completeFeishuLogin('ticket-1')

    expect(mocks.post).toHaveBeenCalledWith(
      '/auth/feishu/complete',
      { ticket: 'ticket-1' },
      { silent: true, skipAuthRefresh: true },
    )
  })
})
