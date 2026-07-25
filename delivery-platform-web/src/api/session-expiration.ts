type SessionExpirationHandler = () => void | Promise<void>

let sessionExpirationHandler: SessionExpirationHandler | undefined

export function setSessionExpirationHandler(handler: SessionExpirationHandler): void {
  sessionExpirationHandler = handler
}

export async function notifySessionExpired(): Promise<void> {
  await sessionExpirationHandler?.()
}
