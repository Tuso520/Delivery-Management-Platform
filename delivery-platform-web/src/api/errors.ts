import { isAxiosError } from 'axios'

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly businessCode?: string,
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export function hasHttpStatus(error: unknown, status: number): boolean {
  if (error instanceof ApiRequestError) return error.status === status
  return isAxiosError(error) && error.response?.status === status
}
