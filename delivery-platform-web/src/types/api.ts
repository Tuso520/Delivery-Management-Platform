export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  timestamp: string
  traceId: string
}

export const API_TRACE_ID = Symbol('apiTraceId')

export type TraceableApiData = {
  [API_TRACE_ID]?: string
}

export function attachApiTraceId<T>(data: T, traceId?: string): T {
  if (traceId && data !== null && (typeof data === 'object' || typeof data === 'function')) {
    Object.defineProperty(data, API_TRACE_ID, {
      configurable: true,
      enumerable: false,
      value: traceId,
    })
  }
  return data
}

export function getApiTraceId(data: unknown): string | undefined {
  if (data === null || (typeof data !== 'object' && typeof data !== 'function')) return undefined
  return (data as TraceableApiData)[API_TRACE_ID]
}

export interface PaginatedData<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface PaginationParams {
  page: number
  pageSize: number
}
