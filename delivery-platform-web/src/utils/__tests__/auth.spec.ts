import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearLegacyAuthStorage,
  getToken,
  removeToken,
  setToken,
} from '../auth'

describe('in-memory authentication state', () => {
  beforeEach(() => {
    removeToken()
    localStorage.clear()
  })

  it('keeps the access token in memory without writing localStorage', () => {
    setToken('access-token')

    expect(getToken()).toBe('access-token')
    expect(localStorage.getItem('delivery_token')).toBeNull()
  })

  it('clears legacy token and user caches during startup migration', () => {
    localStorage.setItem('delivery_token', 'legacy-token')
    localStorage.setItem('delivery_user_info', '{"username":"legacy"}')
    localStorage.setItem('delivery_refresh_token', 'legacy-refresh-token')
    localStorage.setItem('lang', 'zh-CN')

    clearLegacyAuthStorage()

    expect(localStorage.getItem('delivery_token')).toBeNull()
    expect(localStorage.getItem('delivery_user_info')).toBeNull()
    expect(localStorage.getItem('delivery_refresh_token')).toBeNull()
    expect(localStorage.getItem('lang')).toBe('zh-CN')
  })

  it('removes the in-memory token when the session ends', () => {
    setToken('access-token')

    removeToken()

    expect(getToken()).toBeNull()
  })
})
