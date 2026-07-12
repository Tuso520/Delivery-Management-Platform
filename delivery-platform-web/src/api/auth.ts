import request from './request'
import type { LoginForm, LoginResult, UserProfile } from '@/types/user'

export const authApi = {
  /**
   * 用户登录
   * Note: Axios 拦截器已从 {code, message, data} 中解包，直接返回 data 部分
   */
  login(data: LoginForm) {
    return request.post<LoginResult>('/auth/login', data, {
      silent: true,
      skipAuthRefresh: true,
    })
  },

  logout() {
    return request.post<void>('/auth/logout')
  },

  getProfile() {
    return request.get<UserProfile>('/auth/profile')
  },

  refreshToken() {
    return request.post<LoginResult>('/auth/refresh', undefined, {
      silent: true,
      skipAuthRefresh: true,
    })
  },
}
