import { QueryClient } from '@tanstack/vue-query'
import { isAxiosError } from 'axios'

import { ApiRequestError } from '@/api/errors'

const NON_RETRYABLE_HTTP_STATUSES = new Set([400, 401, 403, 404, 409, 422])

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false
  if (error instanceof ApiRequestError && !error.retryable) return false
  if (isAxiosError(error)) {
    const status = error.response?.status
    if (status && NON_RETRYABLE_HTTP_STATUSES.has(status)) return false
  }
  return true
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
})
