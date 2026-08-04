import type { LoginResult } from '@/types/user'

type SessionRefreshHandler = (session: LoginResult) => void

let sessionRefreshHandler: SessionRefreshHandler | null = null

export function setSessionRefreshHandler(handler: SessionRefreshHandler): void {
  sessionRefreshHandler = handler
}

export function publishSessionRefreshed(session: LoginResult): void {
  sessionRefreshHandler?.(session)
}
