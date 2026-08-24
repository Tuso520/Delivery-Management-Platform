const TRANSIENT_UPLOAD_STATUSES = new Set([502, 503, 504])
const TRANSIENT_UPLOAD_CODES = new Set(['ECONNABORTED', 'ERR_NETWORK'])

interface UploadErrorShape {
  code?: unknown
  response?: { status?: unknown }
}

export interface UploadRetryOptions {
  delaysMs?: readonly number[]
}

export function isTransientUploadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as UploadErrorShape
  const status = candidate.response?.status
  if (typeof status === 'number' && TRANSIENT_UPLOAD_STATUSES.has(status)) return true
  return typeof candidate.code === 'string' && TRANSIENT_UPLOAD_CODES.has(candidate.code)
}

export async function retryTransientUpload<T>(
  upload: () => Promise<T>,
  options: UploadRetryOptions = {},
): Promise<T> {
  const delaysMs = options.delaysMs ?? [300, 1_000]

  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    try {
      return await upload()
    } catch (error) {
      if (!isTransientUploadError(error) || attempt >= delaysMs.length) throw error
      const delayMs = delaysMs[attempt] ?? 0
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs))
    }
  }

  throw new Error('上传重试状态异常')
}
