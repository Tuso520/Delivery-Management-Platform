import { registerAs } from '@nestjs/config';

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(parsed, max)) : fallback;
}

export function resolveFileUploadHardLimitBytes(
  value = process.env.FILE_UPLOAD_HARD_LIMIT_MB,
): number {
  const parsedMegabytes = Number.parseInt(value ?? '', 10);
  const megabytes =
    Number.isInteger(parsedMegabytes) && parsedMegabytes >= 1 && parsedMegabytes <= 1024
      ? parsedMegabytes
      : 1024;
  return megabytes * 1024 * 1024;
}

export default registerAs('fileProcessing', () => ({
  uploadHardLimitBytes: resolveFileUploadHardLimitBytes(),
  maxAttempts: boundedInteger(process.env.FILE_PROCESSING_MAX_ATTEMPTS, 3, 1, 10),
  leaseMs: boundedInteger(process.env.FILE_PROCESSING_LEASE_MS, 300_000, 30_000, 3_600_000),
  retryBaseMs: boundedInteger(process.env.FILE_PROCESSING_RETRY_BASE_MS, 5_000, 1_000, 60_000),
  retryMaxMs: boundedInteger(
    process.env.FILE_PROCESSING_RETRY_MAX_MS,
    15 * 60_000,
    10_000,
    3_600_000,
  ),
  converterUrl: process.env.FILE_CONVERTER_URL?.trim() ?? '',
  converterToken: process.env.FILE_CONVERTER_TOKEN?.trim() ?? '',
  converterTimeoutMs: boundedInteger(
    process.env.FILE_CONVERTER_TIMEOUT_MS,
    120_000,
    5_000,
    900_000,
  ),
  converterMaxOutputBytes: boundedInteger(
    process.env.FILE_CONVERTER_MAX_OUTPUT_BYTES,
    200 * 1024 * 1024,
    1024 * 1024,
    1024 * 1024 * 1024,
  ),
}));
