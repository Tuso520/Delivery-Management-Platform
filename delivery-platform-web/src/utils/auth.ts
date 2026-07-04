import type { UserInfo } from '@/types/user'

const TOKEN_KEY = 'delivery_token'
const USER_INFO_KEY = 'delivery_user_info'
const USER_INFO_CACHE_VERSION = 2

interface UserInfoCache {
  version: number
  user: UserInfo
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isUserInfo(value: unknown): value is UserInfo {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<UserInfo>
  return typeof candidate.id === 'string'
    && typeof candidate.username === 'string'
    && typeof candidate.realName === 'string'
    && typeof candidate.email === 'string'
    && isStringArray(candidate.roles)
    && isStringArray(candidate.permissions)
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_INFO_KEY)
}

export function getUserInfo(): UserInfo | null {
  const raw = localStorage.getItem(USER_INFO_KEY)
  if (!raw) return null

  try {
    const cache = JSON.parse(raw) as Partial<UserInfoCache>
    if (
      cache.version !== USER_INFO_CACHE_VERSION
      || !isUserInfo(cache.user)
    ) {
      localStorage.removeItem(USER_INFO_KEY)
      return null
    }

    return cache.user
  } catch {
    localStorage.removeItem(USER_INFO_KEY)
    return null
  }
}

export function setUserInfo(userInfo: UserInfo): void {
  const cache: UserInfoCache = {
    version: USER_INFO_CACHE_VERSION,
    user: userInfo,
  }
  localStorage.setItem(USER_INFO_KEY, JSON.stringify(cache))
}

export function removeUserInfo(): void {
  localStorage.removeItem(USER_INFO_KEY)
}
