const uploadKeys = new WeakMap<File, Map<string, string>>()

function createUploadKey(): string {
  return globalThis.crypto.randomUUID()
}

function getUploadKey(file: File, operation: string): string {
  let operations = uploadKeys.get(file)
  if (!operations) {
    operations = new Map<string, string>()
    uploadKeys.set(file, operations)
  }

  const existing = operations.get(operation)
  if (existing) return existing

  const created = createUploadKey()
  operations.set(operation, created)
  return created
}

function releaseUploadKey(file: File, operation: string): void {
  const operations = uploadKeys.get(file)
  if (!operations) return

  operations.delete(operation)
  if (operations.size === 0) uploadKeys.delete(file)
}

export async function runIdempotentUpload<T>(
  file: File,
  operation: string,
  upload: (idempotencyKey: string) => Promise<T>,
): Promise<T> {
  const result = await upload(getUploadKey(file, operation))
  releaseUploadKey(file, operation)
  return result
}
