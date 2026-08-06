import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getApiTraceId } from '@/types/api'

const mocks = vi.hoisted(() => {
  const requestUse = vi.fn()
  const responseUse = vi.fn()
  const post = vi.fn()
  const request = vi.fn()
  const instance = {
    interceptors: {
      request: { use: requestUse },
      response: { use: responseUse },
    },
    post,
    request,
  }

  return {
    requestUse,
    responseUse,
    post,
    request,
    instance,
    create: vi.fn(() => instance),
    currentToken: 'expired-token' as string | null,
    getToken: vi.fn(),
    setToken: vi.fn(),
    removeToken: vi.fn(),
    resetState: vi.fn(),
    replace: vi.fn((_path: string) => Promise.resolve()),
    messageError: vi.fn(),
    refreshHandler: vi.fn(),
    currentRoute: { value: { path: '/dashboard' } },
  }
})

vi.mock('axios', () => ({
  default: { create: mocks.create },
}))

vi.mock('@arco-design/web-vue/es/message', () => ({
  default: { error: mocks.messageError },
}))

vi.mock('@/utils/auth', () => ({
  getToken: mocks.getToken,
  setToken: mocks.setToken,
  removeToken: mocks.removeToken,
}))

vi.mock('@/router', () => ({
  default: {
    currentRoute: mocks.currentRoute,
    replace: mocks.replace,
  },
}))

vi.mock('@/store/user', () => ({
  useUserStore: () => ({ resetState: mocks.resetState }),
}))

await import('@/api/request')
const { setSessionExpirationHandler } = await import('@/api/session-expiration')
const { setSessionRefreshHandler } = await import('@/api/session-refresh')
setSessionExpirationHandler(async () => {
  mocks.resetState()
  if (mocks.currentRoute.value.path !== '/login') {
    await mocks.replace('/login')
  }
})
setSessionRefreshHandler(mocks.refreshHandler)

type RequestHandler = (config: {
  headers: Record<string, string>
}) => { headers: Record<string, string> }

interface RejectionConfig {
  url: string
  headers: Record<string, string>
  silent?: boolean
  skipAuthRefresh?: boolean
  _retry?: boolean
}

interface RequestError {
  response: { status: number; data: unknown }
  config: RejectionConfig
  code?: string
  message?: string
}

type RejectionHandler = (error: RequestError) => Promise<unknown>

type FulfillmentHandler = (response: {
  config: { responseType?: string }
  data: { code: number; message: string; data: unknown; traceId?: string }
  headers: Record<string, string>
}) => unknown

const requestHandler = mocks.requestUse.mock.calls[0]?.[0] as RequestHandler
const fulfillmentHandler = mocks.responseUse.mock.calls[0]?.[0] as FulfillmentHandler
const rejectionHandler = mocks.responseUse.mock.calls[0]?.[1] as RejectionHandler

function unauthorized(url: string): RequestError {
  return {
    response: { status: 401, data: {} },
    config: { url, headers: {} },
  }
}

const refreshedSession = {
  accessToken: 'fresh-token',
  user: {
    sub: 'user-1',
    username: 'admin',
    realName: '管理员',
    email: null,
    roles: ['SUPER_ADMIN'],
    permissions: [],
  },
  defaultRoute: '/dashboard',
}

describe('request authentication', () => {
  beforeEach(() => {
    mocks.currentToken = 'expired-token'
    mocks.getToken.mockImplementation(() => mocks.currentToken)
    mocks.setToken.mockImplementation((token: string) => {
      mocks.currentToken = token
    })
    mocks.post.mockReset()
    mocks.request.mockReset()
    mocks.removeToken.mockClear()
    mocks.resetState.mockClear()
    mocks.replace.mockClear()
    mocks.messageError.mockClear()
    mocks.refreshHandler.mockClear()
    mocks.setToken.mockClear()
    mocks.currentRoute.value.path = '/dashboard'
  })

  it('enables cookies for every API request', () => {
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: '/api/v1',
      withCredentials: true,
    }))
  })

  it('attaches the in-memory access token', () => {
    const config = requestHandler({ headers: {} })

    expect(config.headers.Authorization).toBe('Bearer expired-token')
  })

  it('preserves the response trace on unwrapped data and business errors', async () => {
    const data = { id: 'project-1' }
    const result = fulfillmentHandler({
      config: {},
      data: { code: 0, message: 'success', data, traceId: 'trace-success' },
      headers: {},
    })
    expect(result).toBe(data)
    expect(getApiTraceId(result)).toBe('trace-success')

    await expect(
      fulfillmentHandler({
        config: {},
        data: { code: 4001, message: '业务失败', data: null, traceId: 'trace-failure' },
        headers: {},
      }),
    ).rejects.toEqual(expect.objectContaining({ traceId: 'trace-failure' }))
  })

  it('uses one refresh request for concurrent 401 responses and retries both calls', async () => {
    let resolveRefresh!: (value: typeof refreshedSession) => void
    mocks.post.mockImplementation(
      () => new Promise((resolve) => {
        resolveRefresh = resolve
      }),
    )
    mocks.request.mockImplementation((config: RejectionConfig) => Promise.resolve(config.url))

    const firstError = unauthorized('/projects')
    const secondError = unauthorized('/files')
    const first = rejectionHandler(firstError)
    const second = rejectionHandler(secondError)
    resolveRefresh(refreshedSession)

    await expect(first).resolves.toBe('/projects')
    await expect(second).resolves.toBe('/files')
    expect(mocks.post).toHaveBeenCalledOnce()
    expect(mocks.post).toHaveBeenCalledWith('/auth/refresh', undefined, {
      silent: true,
      skipAuthRefresh: true,
    })
    expect(mocks.setToken).toHaveBeenCalledWith('fresh-token')
    expect(mocks.refreshHandler).toHaveBeenCalledOnce()
    expect(mocks.refreshHandler).toHaveBeenCalledWith(refreshedSession)
    expect(firstError.config.headers.Authorization).toBe('Bearer fresh-token')
    expect(secondError.config.headers.Authorization).toBe('Bearer fresh-token')
    expect(mocks.request).toHaveBeenCalledTimes(2)
  })

  it('clears the session once when the shared refresh attempt fails', async () => {
    mocks.post.mockRejectedValue({ response: { status: 401 } })
    const firstError = unauthorized('/projects')
    const secondError = unauthorized('/files')

    const results = await Promise.allSettled([
      rejectionHandler(firstError),
      rejectionHandler(secondError),
    ])

    expect(results[0]).toMatchObject({ status: 'rejected', reason: firstError })
    expect(results[1]).toMatchObject({ status: 'rejected', reason: secondError })
    expect(mocks.post).toHaveBeenCalledOnce()
    expect(mocks.removeToken).toHaveBeenCalledOnce()
    expect(mocks.resetState).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith('/login')
    expect(mocks.messageError).toHaveBeenCalledWith('登录已过期，请重新登录')
  })

  it('keeps the session when the shared refresh attempt fails transiently', async () => {
    mocks.post.mockRejectedValue({ response: { status: 503 } })
    const firstError = unauthorized('/projects')
    const secondError = unauthorized('/files')

    const results = await Promise.allSettled([
      rejectionHandler(firstError),
      rejectionHandler(secondError),
    ])

    expect(results[0]).toMatchObject({ status: 'rejected', reason: firstError })
    expect(results[1]).toMatchObject({ status: 'rejected', reason: secondError })
    expect(mocks.post).toHaveBeenCalledOnce()
    expect(mocks.removeToken).not.toHaveBeenCalled()
    expect(mocks.resetState).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.messageError).toHaveBeenCalledOnce()
    expect(mocks.messageError).toHaveBeenCalledWith('会话刷新暂时失败，请检查网络后重试')
  })

  it('does not refresh or reset a rejected login request', async () => {
    const error = unauthorized('/auth/login')
    error.config.silent = true
    error.config.skipAuthRefresh = true

    await expect(rejectionHandler(error)).rejects.toBe(error)

    expect(mocks.post).not.toHaveBeenCalled()
    expect(mocks.removeToken).not.toHaveBeenCalled()
    expect(mocks.resetState).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.messageError).not.toHaveBeenCalled()
  })
})
