const LEGACY_AUTH_STORAGE_KEYS = [
  'delivery_token',
  'delivery_user_info',
  'delivery_refresh_token',
] as const

let accessToken: string | null = null

export function getToken(): string | null {
  return accessToken
}

export function setToken(token: string): void {
  accessToken = token
}

export function removeToken(): void {
  accessToken = null
  clearLegacyAuthStorage()
}

export function clearLegacyAuthStorage(): void {
  if (typeof localStorage === 'undefined') return

  for (const key of LEGACY_AUTH_STORAGE_KEYS) {
    localStorage.removeItem(key)
  }
}
