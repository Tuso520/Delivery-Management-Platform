interface HttpErrorLike {
  status?: unknown
  response?: {
    status?: unknown
  }
}

export function getHttpErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined

  const httpError = error as HttpErrorLike
  const status = httpError.status ?? httpError.response?.status
  return typeof status === 'number' ? status : undefined
}

export function isExplicitSessionRejection(error: unknown): boolean {
  const status = getHttpErrorStatus(error)
  return status === 401 || status === 403 || status === 404
}
