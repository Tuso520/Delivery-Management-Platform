import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import Message from '@arco-design/web-vue/es/message'

import { ApiRequestError } from '@/api/errors'
import { isExplicitSessionRejection } from '@/api/session-error'
import { notifySessionExpired } from '@/api/session-expiration'
import { publishSessionRefreshed } from '@/api/session-refresh'
import { attachApiTraceId } from '@/types/api'
import type { LoginResult } from '@/types/user'
import { getToken, removeToken, setToken } from '@/utils/auth'

export interface RequestOptions extends AxiosRequestConfig {
  silent?: boolean
  skipAuthRefresh?: boolean
}

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  silent?: boolean
  skipAuthRefresh?: boolean
  _retry?: boolean
}

interface HttpErrorPayload {
  code?: string | number
  message?: string | string[]
  traceId?: string
}

interface RequestClient {
  get<T>(url: string, config?: RequestOptions): Promise<T>
  post<T>(url: string, data?: unknown, config?: RequestOptions): Promise<T>
  put<T>(url: string, data?: unknown, config?: RequestOptions): Promise<T>
  patch<T>(url: string, data?: unknown, config?: RequestOptions): Promise<T>
  delete<T>(url: string, config?: RequestOptions): Promise<T>
}

const axiosInstance: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

let refreshPromise: Promise<string> | null = null
let sessionExpirationPromise: Promise<void> | null = null

function requestOptions(config?: AxiosRequestConfig): RequestOptions | undefined {
  return config as RequestOptions | undefined
}

function isSilent(config?: AxiosRequestConfig): boolean {
  return Boolean(requestOptions(config)?.silent)
}

function skipsAuthRefresh(config?: AxiosRequestConfig): boolean {
  return Boolean(requestOptions(config)?.skipAuthRefresh)
}

function normalizeHttpError(error: unknown): Error {
  if (error instanceof ApiRequestError) return error
  if (!error || typeof error !== 'object') return new ApiRequestError('请求失败')

  const candidate = error as {
    code?: string
    message?: string
    response?: {
      status?: number
      data?: HttpErrorPayload
      headers?: Record<string, string | undefined>
    }
  }
  const status = candidate.response?.status
  const payload = candidate.response?.data
  const payloadMessage = Array.isArray(payload?.message) ? payload.message[0] : payload?.message
  const message = payloadMessage || candidate.message || '请求失败'
  const traceId =
    payload?.traceId ??
    candidate.response?.headers?.['x-request-id'] ??
    candidate.response?.headers?.['x-trace-id']
  const retryable =
    candidate.code === 'ECONNABORTED' ||
    status === 408 ||
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504

  return new ApiRequestError(
    message,
    status,
    payload?.code === undefined ? undefined : String(payload.code),
    retryable,
    traceId,
  )
}

async function resetUnauthorizedSession(): Promise<void> {
  removeToken()
  await notifySessionExpired()
}

async function expireSession(): Promise<void> {
  if (!sessionExpirationPromise) {
    sessionExpirationPromise = (async () => {
      await resetUnauthorizedSession()
      Message.error('登录已过期，请重新登录')
    })().finally(() => {
      sessionExpirationPromise = null
    })
  }

  await sessionExpirationPromise
}

export function refreshSessionRequest(): Promise<LoginResult> {
  return axiosInstance.post<unknown, LoginResult>('/auth/refresh', undefined, {
    silent: true,
    skipAuthRefresh: true,
  } as RequestOptions)
}

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = refreshSessionRequest()
      .then((result) => {
        if (!result?.accessToken) {
          throw new Error('刷新会话未返回访问令牌')
        }
        setToken(result.accessToken)
        publishSessionRefreshed(result)
        return result.accessToken
      })
      .catch(async (error: unknown) => {
        if (isExplicitSessionRejection(error)) {
          await expireSession()
        } else {
          Message.error('会话刷新暂时失败，请检查网络后重试')
        }
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      // Let the browser provide the multipart boundary. A fixed content type
      // makes Multer reject otherwise valid archive uploads before parsing.
      config.headers.delete('Content-Type')
    }
    const token = getToken()
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

axiosInstance.interceptors.response.use(
  (response) => {
    if (response.config.responseType === 'blob') {
      return response.data
    }
    const { code, message, data, traceId } = response.data
    const responseTraceId =
      traceId ?? response.headers['x-request-id'] ?? response.headers['x-trace-id']

    if (code !== 0 && code !== undefined) {
      if (!isSilent(response.config)) {
        Message.error(message || '请求失败')
      }
      return Promise.reject(
        new ApiRequestError(message || '请求失败', undefined, String(code), false, responseTraceId),
      )
    }

    return attachApiTraceId(data, responseTraceId)
  },
  async (error) => {
    const status = error.response?.status as number | undefined
    const data = error.response?.data
    const originalConfig = error.config as RetryableRequestConfig | undefined

    if (status === 401 && originalConfig && !skipsAuthRefresh(originalConfig)) {
      if (!originalConfig._retry) {
        originalConfig._retry = true
        try {
          const token = await refreshAccessToken()
          originalConfig.headers.Authorization = `Bearer ${token}`
          return axiosInstance.request(originalConfig)
        } catch {
          return Promise.reject(error)
        }
      }

      await expireSession()
      return Promise.reject(error)
    }

    if (isSilent(originalConfig)) {
      return Promise.reject(normalizeHttpError(error))
    }

    switch (status) {
      case 400:
        Message.error(data?.message || '请求参数错误')
        break
      case 401:
        await expireSession()
        break
      case 403:
        Message.error('没有权限执行此操作')
        break
      case 404:
        Message.error('请求的资源不存在')
        break
      case 422:
        Message.error(data?.message || '请求参数校验失败')
        break
      case 429:
        Message.error('请求过于频繁，请稍后重试')
        break
      case 500:
        Message.error('服务器内部错误')
        break
      default:
        if (error.code === 'ECONNABORTED') {
          Message.error('请求超时，请稍后重试')
        } else if (error.response) {
          Message.error(error.message || '网络错误')
        } else {
          Message.error('网络连接失败，请检查网络')
        }
    }

    return Promise.reject(normalizeHttpError(error))
  },
)

const request = axiosInstance as unknown as RequestClient

export default request
