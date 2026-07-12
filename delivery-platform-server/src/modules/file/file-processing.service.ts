import { createHash } from 'crypto';
import { createRequire } from 'module';
import { hostname } from 'os';
import { basename, extname } from 'path';
import type { Readable } from 'stream';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type sharpFactory from 'sharp';
import { v4 as uuidv4 } from 'uuid';

import { enqueueDomainEvent } from '../../common/events/outbox';
import { PrismaService } from '../../database/prisma.service';

import {
  FileConversionAdapter,
  FileConversionError,
  type ConvertedFile,
  type ExternalConversionType,
} from './file-conversion.adapter';
import { FileStorageService } from './file-storage.service';
import { parseXmindOutline, XmindParseError } from './xmind-parser';

const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif']);
const externalConversionTypes = new Set<ExternalConversionType>([
  'THUMBNAIL',
  'PDF_PREVIEW',
  'CAD_CONVERT',
  'VISIO_CONVERT',
  'VIDEO_TRANSCODE',
]);
const maxImageInputBytes = 100 * 1024 * 1024;
const maxXmindInputBytes = 25 * 1024 * 1024;
const sharp = createRequire(__filename)('sharp') as typeof sharpFactory;
interface FileProcessingConfiguration {
  maxAttempts: number;
  leaseMs: number;
  retryBaseMs: number;
  retryMaxMs: number;
}

interface ClaimedJob {
  id: string;
  attempts: number;
  leaseOwner: string;
}

type ProcessingJob = Prisma.FileProcessingJobGetPayload<{
  include: { inputAsset: true };
}>;

class FileProcessingError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}

class FileProcessingLeaseLostError extends Error {}

@Injectable()
export class FileProcessingService {
  private readonly logger = new Logger(FileProcessingService.name);
  private readonly workerId = `${hostname().slice(0, 48)}-${process.pid}-${uuidv4().slice(0, 8)}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly config: ConfigService,
    private readonly converter: FileConversionAdapter,
  ) {}

  async processBatch(limit = 10, shouldStop: () => boolean = () => false): Promise<number> {
    const batchSize = Math.max(1, Math.min(limit, 50));
    const configuration = this.configuration();
    const now = new Date();
    await this.recoverExpiredClaims(now, configuration.maxAttempts);

    const candidates = await this.prisma.fileProcessingJob.findMany({
      where: {
        status: 'PENDING',
        availableAt: { lte: now },
        attempts: { lt: configuration.maxAttempts },
      },
      select: { id: true, attempts: true },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
      take: batchSize,
    });

    let claimedCount = 0;
    for (const candidate of candidates) {
      if (shouldStop()) break;
      const claimTime = new Date();
      const claimed = await this.prisma.fileProcessingJob.updateMany({
        where: {
          id: candidate.id,
          status: 'PENDING',
          availableAt: { lte: claimTime },
          attempts: candidate.attempts,
        },
        data: {
          status: 'PROCESSING',
          progress: 5,
          attempts: { increment: 1 },
          leaseOwner: this.workerId,
          leaseExpiresAt: new Date(claimTime.getTime() + configuration.leaseMs),
          errorCode: null,
          errorMessage: null,
          startedAt: claimTime,
          completedAt: null,
        },
      });
      if (claimed.count !== 1) continue;

      claimedCount += 1;
      await this.processClaim(
        { id: candidate.id, attempts: candidate.attempts + 1, leaseOwner: this.workerId },
        configuration,
      );
    }
    return claimedCount;
  }

  private async recoverExpiredClaims(now: Date, maxAttempts: number): Promise<void> {
    await this.prisma.fileProcessingJob.updateMany({
      where: { status: 'PENDING', attempts: { gte: maxAttempts } },
      data: {
        status: 'DEAD',
        errorCode: 'FILE_PROCESSING_MAX_ATTEMPTS_EXCEEDED',
        errorMessage: this.safeErrorMessage('FILE_PROCESSING_MAX_ATTEMPTS_EXCEEDED'),
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    await this.prisma.fileProcessingJob.updateMany({
      where: {
        status: 'PROCESSING',
        OR: [{ leaseExpiresAt: { lte: now } }, { leaseExpiresAt: null }],
        attempts: { gte: maxAttempts },
      },
      data: {
        status: 'DEAD',
        errorCode: 'FILE_PROCESSING_LEASE_EXPIRED_MAX_ATTEMPTS',
        errorMessage: this.safeErrorMessage('FILE_PROCESSING_LEASE_EXPIRED_MAX_ATTEMPTS'),
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    await this.prisma.fileProcessingJob.updateMany({
      where: {
        status: 'PROCESSING',
        OR: [{ leaseExpiresAt: { lte: now } }, { leaseExpiresAt: null }],
        attempts: { lt: maxAttempts },
      },
      data: {
        status: 'PENDING',
        progress: 0,
        availableAt: now,
        errorCode: 'FILE_PROCESSING_LEASE_EXPIRED',
        errorMessage: this.safeErrorMessage('FILE_PROCESSING_LEASE_EXPIRED'),
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  }

  private async processClaim(
    claim: ClaimedJob,
    configuration: FileProcessingConfiguration,
  ): Promise<void> {
    const job = await this.prisma.fileProcessingJob.findFirst({
      where: {
        id: claim.id,
        status: 'PROCESSING',
        attempts: claim.attempts,
        leaseOwner: claim.leaseOwner,
      },
      include: { inputAsset: true },
    });
    if (!job) return;

    const heartbeat = this.startHeartbeat(claim, configuration.leaseMs);
    let outputStorageKey: string | null = null;
    try {
      const output = await this.generateOutput(job);
      await this.renewLease(claim, configuration.leaseMs, 65);

      outputStorageKey = this.outputStorageKey(job, claim.attempts, output.extension);
      await this.storage.uploadBuffer(output.data, outputStorageKey, output.mimeType);
      const outputAssetId = uuidv4();
      const completedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.fileAsset.create({
          data: {
            id: outputAssetId,
            ownerType: job.inputAsset.ownerType,
            ownerId: job.inputAsset.ownerId,
            originalName: output.originalName,
            extension: output.extension,
            mimeType: output.mimeType,
            size: BigInt(output.data.length),
            storageProvider: job.inputAsset.storageProvider,
            storageBucket: job.inputAsset.storageBucket,
            storageKey: outputStorageKey!,
            checksum: createHash('sha256').update(output.data).digest('hex'),
            status: 'AVAILABLE',
            createdBy: job.inputAsset.createdBy,
          },
        });
        const completed = await tx.fileProcessingJob.updateMany({
          where: {
            id: claim.id,
            status: 'PROCESSING',
            attempts: claim.attempts,
            leaseOwner: claim.leaseOwner,
          },
          data: {
            status: 'COMPLETED',
            progress: 100,
            outputAssetId,
            errorCode: null,
            errorMessage: null,
            completedAt,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        if (completed.count !== 1) throw new FileProcessingLeaseLostError();
        await enqueueDomainEvent(tx, {
          eventType: 'FileProcessingCompleted',
          aggregateType: 'file_asset',
          aggregateId: job.inputAsset.id,
          deduplicationKey: `FileProcessingCompleted:${job.id}`,
          payload: {
            jobId: job.id,
            type: job.type,
            inputAssetId: job.inputAsset.id,
            outputAssetId,
          },
        });
      });
    } catch (error) {
      if (outputStorageKey) {
        await this.storage
          .deleteFrom(job.inputAsset.storageBucket, outputStorageKey)
          .catch(() => undefined);
      }
      await this.recordFailure(claim, job.type, error, configuration);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async generateOutput(job: ProcessingJob): Promise<ConvertedFile> {
    const extension = job.inputAsset.extension?.toLowerCase() ?? '';
    if (job.type === 'THUMBNAIL' && imageExtensions.has(extension)) {
      return this.generateImage(job, 'thumbnail');
    }
    if (job.type === 'LARGE_IMAGE_TILE') {
      if (!imageExtensions.has(extension)) {
        throw new FileProcessingError('LARGE_IMAGE_SOURCE_UNSUPPORTED', false);
      }
      return this.generateImage(job, 'large-preview');
    }
    if (job.type === 'XMIND_PARSE') {
      if (extension !== 'xmind') throw new FileProcessingError('XMIND_SOURCE_UNSUPPORTED', false);
      return this.generateXmindOutline(job);
    }
    if (externalConversionTypes.has(job.type as ExternalConversionType)) {
      return this.converter.convert(job.id, job.type as ExternalConversionType, job.inputAsset);
    }
    throw new FileProcessingError('FILE_PROCESSING_TYPE_UNSUPPORTED', false);
  }

  private async generateImage(
    job: ProcessingJob,
    mode: 'thumbnail' | 'large-preview',
  ): Promise<ConvertedFile> {
    const source = await this.readSource(job, maxImageInputBytes);
    const isThumbnail = mode === 'thumbnail';
    const data = await sharp(source, { animated: false, limitInputPixels: 120_000_000 })
      .rotate()
      .resize({
        width: isThumbnail ? 480 : 4096,
        height: isThumbnail ? 480 : 4096,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: isThumbnail ? 82 : 86 })
      .toBuffer();
    return {
      data,
      extension: 'webp',
      mimeType: 'image/webp',
      originalName: this.derivedName(job.inputAsset.originalName, mode, 'webp'),
    };
  }

  private async generateXmindOutline(job: ProcessingJob): Promise<ConvertedFile> {
    const source = await this.readSource(job, maxXmindInputBytes);
    const sheets = await parseXmindOutline(source);
    const data = Buffer.from(JSON.stringify({ version: 1, sheets }), 'utf8');
    return {
      data,
      extension: 'json',
      mimeType: 'application/json',
      originalName: this.derivedName(job.inputAsset.originalName, 'outline', 'json'),
    };
  }

  private async readSource(job: ProcessingJob, maxBytes: number): Promise<Buffer> {
    if (job.inputAsset.size > BigInt(maxBytes)) {
      throw new FileProcessingError('FILE_PROCESSING_INPUT_TOO_LARGE', false);
    }
    const stream = await this.storage.getObjectFrom(
      job.inputAsset.storageBucket,
      job.inputAsset.storageKey,
    );
    return this.streamToBuffer(stream, maxBytes);
  }

  private async streamToBuffer(stream: Readable, maxBytes: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      total += buffer.length;
      if (total > maxBytes) {
        throw new FileProcessingError('FILE_PROCESSING_INPUT_TOO_LARGE', false);
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks, total);
  }

  private startHeartbeat(claim: ClaimedJob, leaseMs: number): NodeJS.Timeout {
    const interval = setInterval(
      () => {
        void this.renewLease(claim, leaseMs).catch(() => undefined);
      },
      Math.max(10_000, Math.floor(leaseMs / 3)),
    );
    interval.unref();
    return interval;
  }

  private async renewLease(claim: ClaimedJob, leaseMs: number, progress?: number): Promise<void> {
    const renewed = await this.prisma.fileProcessingJob.updateMany({
      where: {
        id: claim.id,
        status: 'PROCESSING',
        attempts: claim.attempts,
        leaseOwner: claim.leaseOwner,
      },
      data: {
        leaseExpiresAt: new Date(Date.now() + leaseMs),
        ...(progress === undefined ? {} : { progress }),
      },
    });
    if (renewed.count !== 1) throw new FileProcessingLeaseLostError();
  }

  private async recordFailure(
    claim: ClaimedJob,
    jobType: string,
    error: unknown,
    configuration: FileProcessingConfiguration,
  ): Promise<void> {
    const failure = this.normalizeFailure(error);
    if (failure.code === 'FILE_PROCESSING_LEASE_LOST') return;
    const isDead = !failure.retryable || claim.attempts >= configuration.maxAttempts;
    const retryDelay = Math.min(
      configuration.retryBaseMs * 2 ** Math.max(0, claim.attempts - 1),
      configuration.retryMaxMs,
    );
    await this.prisma.fileProcessingJob.updateMany({
      where: {
        id: claim.id,
        status: 'PROCESSING',
        attempts: claim.attempts,
        leaseOwner: claim.leaseOwner,
      },
      data: {
        status: isDead ? 'DEAD' : 'PENDING',
        progress: 0,
        availableAt: isDead ? undefined : new Date(Date.now() + retryDelay),
        errorCode: failure.code,
        errorMessage: this.safeErrorMessage(failure.code),
        completedAt: isDead ? new Date() : null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    this.logger.warn(
      `File processing job ${claim.id} (${jobType}) failed with ${failure.code} on attempt ${claim.attempts}`,
    );
  }

  private normalizeFailure(error: unknown): { code: string; retryable: boolean } {
    if (error instanceof FileProcessingLeaseLostError) {
      return { code: 'FILE_PROCESSING_LEASE_LOST', retryable: true };
    }
    if (error instanceof FileProcessingError || error instanceof FileConversionError) {
      return { code: error.code, retryable: error.retryable };
    }
    if (error instanceof XmindParseError) return { code: error.code, retryable: false };
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return { code: 'FILE_PROCESSING_PERSISTENCE_FAILED', retryable: true };
    }
    return { code: 'FILE_PROCESSING_RUNTIME_FAILED', retryable: true };
  }

  private safeErrorMessage(code: string): string {
    if (code === 'FILE_CONVERTER_NOT_CONFIGURED') return '未配置文件转换服务';
    if (code.startsWith('XMIND_')) return 'XMind 文件无法安全解析';
    if (code.includes('INPUT_TOO_LARGE')) return '文件超出后台处理大小限制';
    if (code.includes('TYPE_UNSUPPORTED') || code.includes('SOURCE_UNSUPPORTED')) {
      return '当前文件类型不支持此处理任务';
    }
    if (code.includes('MAX_ATTEMPTS') || code.includes('LEASE_EXPIRED')) {
      return '文件处理多次失败，已停止自动重试';
    }
    return '文件处理失败，请联系管理员查看 Worker 日志';
  }

  private outputStorageKey(job: ProcessingJob, attempt: number, extension: string): string {
    return `processed/${job.inputAsset.id}/${job.id}-attempt-${attempt}-${uuidv4().slice(0, 8)}.${extension}`;
  }

  private derivedName(originalName: string, suffix: string, extension: string): string {
    const sourceExtension = extname(originalName);
    return `${basename(originalName, sourceExtension) || 'file'}-${suffix}.${extension}`;
  }

  private configuration(): FileProcessingConfiguration {
    const value = this.config.get<Partial<FileProcessingConfiguration>>('fileProcessing') ?? {};
    return {
      maxAttempts: value.maxAttempts ?? 3,
      leaseMs: value.leaseMs ?? 300_000,
      retryBaseMs: value.retryBaseMs ?? 5_000,
      retryMaxMs: value.retryMaxMs ?? 15 * 60_000,
    };
  }
}
