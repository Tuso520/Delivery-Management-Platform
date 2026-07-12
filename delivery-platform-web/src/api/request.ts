import axios from 'axios'
import type {
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios'
import { Message } from '@arco-design/web-vue'

import { ApiRequestError } from '@/api/errors'
import router from '@/router'
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

async function resetUnauthorizedSession(): Promise<void> {
  removeToken()
  const { useUserStore } = await import('@/store/user')
  useUserStore().resetState()
}

async function expireSession(): Promise<void> {
  if (!sessionExpirationPromise) {
    sessionExpirationPromise = (async () => {
      await resetUnauthorizedSession()
      Message.error('登录已过期，请重新登录')
      if (router.currentRoute.value.path !== '/login') {
        await router.replace('/login')
      }
    })().finally(() => {
      sessionExpirationPromise = null
    })
  }

  await sessionExpirationPromise
}

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = axiosInstance
      .post<unknown, LoginResult>('/auth/refresh', undefined, {
        silent: true,
        skipAuthRefresh: true,
      } as RequestOptions)
      .then((result) => {
        if (!result?.accessToken) {
          throw new Error('刷新会话未返回访问令牌')
        }
        setToken(result.accessToken)
        return result.accessToken
      })
      .catch(async (error: unknown) => {
        await expireSession()
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
    const { code, message, data } = response.data

    if (code !== 0 && code !== undefined) {
      if (!isSilent(response.config)) {
        Message.error(message || '请求失败')
      }
      return Promise.reject(
        new ApiRequestError(message || '请求失败', undefined, String(code), false),
      )
    }

    return data
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
      return Promise.reject(error)
    }

    switch (status) {
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

    return Promise.reject(error)
  },
)

const request = axiosInstance as unknown as RequestClient

export default request
