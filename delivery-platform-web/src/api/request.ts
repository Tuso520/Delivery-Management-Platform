import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import { Message } from '@arco-design/web-vue'
import { getToken, removeToken } from '@/utils/auth'
import router from '@/router'

// 防止多个 401 同时触发多次跳转
let isRefreshing = false

interface RequestOptions extends AxiosRequestConfig {
  silent?: boolean
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
  headers: {
    'Content-Type': 'application/json',
  },
})

function isSilent(config?: AxiosRequestConfig): boolean {
  return Boolean((config as RequestOptions | undefined)?.silent)
}

// Request interceptor: attach Bearer token
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken()
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

// Response interceptor: unwrap data, handle errors
axiosInstance.interceptors.response.use(
  (response) => {
    if (response.config.responseType === 'blob') {
      return response.data
    }
    const { code, message, data } = response.data

    // Check business code
    if (code !== 0 && code !== undefined) {
      if (isSilent(response.config)) {
        return Promise.reject(new Error(message || '请求失败'))
      }
      Message.error(message || '请求失败')
      return Promise.reject(new Error(message || '请求失败'))
    }

    return data
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response

      if (isSilent(error.config)) {
        return Promise.reject(error)
      }

      switch (status) {
        case 401:
          if (!isRefreshing) {
            isRefreshing = true
            removeToken()
            Message.error('登录已过期，请重新登录')
            router.push('/login').then(() => {
              // 导航完成后重置标识，以便下次 401 能正确触发跳转
              setTimeout(() => { isRefreshing = false }, 100)
            })
          }
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
          Message.error(error.message || '网络错误')
      }
    } else if (isSilent(error.config)) {
      return Promise.reject(error)
    } else if (error.code === 'ECONNABORTED') {
      Message.error('请求超时，请稍后重试')
    } else {
      Message.error('网络连接失败，请检查网络')
    }

    return Promise.reject(error)
  },
)

const request = axiosInstance as unknown as RequestClient

export default request
