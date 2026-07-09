import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requestUse: vi.fn(),
  responseUse: vi.fn(),
  removeToken: vi.fn(),
  resetState: vi.fn(),
  replace: vi.fn(() => Promise.resolve()),
  messageError: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: mocks.requestUse },
        response: { use: mocks.responseUse },
      },
    })),
  },
}))

vi.mock('@arco-design/web-vue', () => ({
  Message: { error: mocks.messageError },
}))

vi.mock('@/utils/auth', () => ({
  getToken: vi.fn(() => 'expired-token'),
  removeToken: mocks.removeToken,
}))

vi.mock('@/router', () => ({
  default: { replace: mocks.replace },
}))

vi.mock('@/store/user', () => ({
  useUserStore: () => ({ resetState: mocks.resetState }),
}))

await import('@/api/request')

type RejectionHandler = (error: {
  response: { status: number; data: unknown }
  config?: { silent?: boolean }
}) => Promise<never>

const rejectionHandler = mocks.responseUse.mock.calls[0]?.[1] as RejectionHandler

describe('request authentication failure handling', () => {
  beforeEach(() => {
    mocks.removeToken.mockClear()
    mocks.resetState.mockClear()
    mocks.replace.mockClear()
    mocks.messageError.mockClear()
  })

  it('clears both persisted and Pinia authentication state before opening login', async () => {
    const error = { response: { status: 401, data: {} }, config: {} }

    await expect(rejectionHandler(error)).rejects.toBe(error)

    expect(mocks.removeToken).toHaveBeenCalled()
    expect(mocks.resetState).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith('/login')
    expect(mocks.messageError).toHaveBeenCalledWith('登录已过期，请重新登录')
  })

  it('does not reset an existing session for a silent login rejection', async () => {
    const error = {
      response: { status: 401, data: {} },
      config: { silent: true },
    }

    await expect(rejectionHandler(error)).rejects.toBe(error)

    expect(mocks.removeToken).not.toHaveBeenCalled()
    expect(mocks.resetState).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.messageError).not.toHaveBeenCalled()
  })
})
