import { Prisma } from '@prisma/client';

const TRANSIENT_READ_RETRY_DELAY_MS = 50;

/**
 * Retry one idempotent read when MySQL closes a pooled connection between
 * requests. Writes and transactions must not use this helper because their
 * commit outcome can be unknown after a connection failure.
 */
export async function withTransientPrismaReadRetry<T>(
  operation: () => Promise<T>,
  retryDelayMs = TRANSIENT_READ_RETRY_DELAY_MS,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isClosedConnectionError(error)) throw error;
    if (retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
    return operation();
  }
}

function isClosedConnectionError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P1017';
}
