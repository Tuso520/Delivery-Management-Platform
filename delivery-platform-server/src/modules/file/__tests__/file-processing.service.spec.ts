import { createRequire } from 'module';
import { Readable } from 'stream';

import type { ConfigService } from '@nestjs/config';
import type sharpFactory from 'sharp';

import type { PrismaService } from '../../../database/prisma.service';
import { FileConversionError, type FileConversionAdapter } from '../file-conversion.adapter';
import { FileProcessingService } from '../file-processing.service';
import type { FileStorageService } from '../file-storage.service';

const sharp = createRequire(__filename)('sharp') as typeof sharpFactory;

const workerConfiguration = {
  maxAttempts: 3,
  leaseMs: 300_000,
  retryBaseMs: 5_000,
  retryMaxMs: 900_000,
};

describe('FileProcessingService', () => {
  it('atomically claims a pending image job and persists a generated thumbnail asset', async () => {
    const source = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 22, g: 93, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const transaction = {
      fileAsset: { create: jest.fn().mockResolvedValue({ id: 'output-asset' }) },
      fileProcessingJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
    };
    const updateMany = jest
      .fn()
      .mockImplementation((args: { where?: { id?: string } }) =>
        Promise.resolve({ count: args.where?.id === 'job-1' ? 1 : 0 }),
      );
    const prisma = {
      fileProcessingJob: {
        findMany: jest.fn().mockResolvedValue([{ id: 'job-1', attempts: 0 }]),
        updateMany,
        findFirst: jest.fn().mockResolvedValue(
          processingJob({
            inputAsset: {
              ...inputAsset(),
              originalName: '现场照片.png',
              extension: 'png',
              mimeType: 'image/png',
              size: BigInt(source.length),
            },
          }),
        ),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const storage = {
      getObjectFrom: jest.fn().mockResolvedValue(Readable.from(source)),
      uploadBuffer: jest.fn().mockResolvedValue('processed/output.webp'),
      deleteFrom: jest.fn(),
    } as unknown as FileStorageService;
    const service = createService(prisma, storage);

    await expect(service.processBatch(1)).resolves.toBe(1);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'job-1', status: 'PENDING', attempts: 0 }),
        data: expect.objectContaining({
          status: 'PROCESSING',
          attempts: { increment: 1 },
          leaseOwner: expect.any(String),
          leaseExpiresAt: expect.any(Date),
        }),
      }),
    );
    expect(storage.uploadBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.stringMatching(/^processed\/asset-1\/job-1-attempt-1-.+\.webp$/u),
      'image/webp',
    );
    expect(transaction.fileAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerType: 'PROJECT_ARCHIVE',
        originalName: '现场照片-thumbnail.webp',
        extension: 'webp',
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    });
    expect(transaction.fileProcessingJob.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'job-1',
        status: 'PROCESSING',
        attempts: 1,
        leaseOwner: expect.any(String),
      }),
      data: expect.objectContaining({
        status: 'COMPLETED',
        progress: 100,
        outputAssetId: expect.any(String),
        leaseOwner: null,
        leaseExpiresAt: null,
      }),
    });
    expect(transaction.outboxEvent.create).toHaveBeenCalledTimes(1);
  });

  it('creates a bounded downsampled preview for a large image job', async () => {
    const source = await sharp({
      create: {
        width: 5_000,
        height: 40,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    })
      .png()
      .toBuffer();
    const transaction = {
      fileAsset: { create: jest.fn().mockResolvedValue({ id: 'output-asset' }) },
      fileProcessingJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
    };
    const prisma = {
      fileProcessingJob: {
        findMany: jest.fn().mockResolvedValue([{ id: 'job-1', attempts: 0 }]),
        updateMany: jest
          .fn()
          .mockImplementation((args: { where?: { id?: string } }) =>
            Promise.resolve({ count: args.where?.id === 'job-1' ? 1 : 0 }),
          ),
        findFirst: jest.fn().mockResolvedValue(
          processingJob({
            type: 'LARGE_IMAGE_TILE',
            inputAsset: {
              ...inputAsset(),
              originalName: 'panorama.png',
              size: BigInt(source.length),
            },
          }),
        ),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const uploadBuffer = jest.fn().mockResolvedValue('processed/large.webp');
    const storage = {
      getObjectFrom: jest.fn().mockResolvedValue(Readable.from(source)),
      uploadBuffer,
      deleteFrom: jest.fn(),
    } as unknown as FileStorageService;
    const service = createService(prisma, storage);

    await expect(service.processBatch(1)).resolves.toBe(1);

    const output = uploadBuffer.mock.calls[0]?.[0] as Buffer;
    await expect(sharp(output).metadata()).resolves.toEqual(
      expect.objectContaining({ width: 4096, format: 'webp' }),
    );
    expect(transaction.fileAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ originalName: 'panorama-large-preview.webp' }),
    });
  });

  it('recovers expired leases and leaves exhausted jobs in the dead-letter state', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      fileProcessingJob: {
        updateMany,
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;
    const service = createService(prisma, {} as FileStorageService);

    await expect(service.processBatch()).resolves.toBe(0);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PROCESSING',
          OR: [{ leaseExpiresAt: { lte: expect.any(Date) } }, { leaseExpiresAt: null }],
          attempts: { lt: 3 },
        }),
        data: expect.objectContaining({ status: 'PENDING', leaseOwner: null }),
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING', attempts: { gte: 3 } }),
        data: expect.objectContaining({
          status: 'DEAD',
          errorCode: 'FILE_PROCESSING_MAX_ATTEMPTS_EXCEEDED',
        }),
      }),
    );
  });

  it('fails an unconfigured external conversion immediately with a stable dead-letter code', async () => {
    const updateMany = jest
      .fn()
      .mockImplementation((args: { where?: { id?: string } }) =>
        Promise.resolve({ count: args.where?.id === 'job-1' ? 1 : 0 }),
      );
    const prisma = {
      fileProcessingJob: {
        findMany: jest.fn().mockResolvedValue([{ id: 'job-1', attempts: 0 }]),
        updateMany,
        findFirst: jest.fn().mockResolvedValue(
          processingJob({
            type: 'CAD_CONVERT',
            inputAsset: {
              ...inputAsset(),
              originalName: 'layout.dwg',
              extension: 'dwg',
              mimeType: 'application/acad',
            },
          }),
        ),
      },
    } as unknown as PrismaService;
    const converter = {
      convert: jest
        .fn()
        .mockRejectedValue(new FileConversionError('FILE_CONVERTER_NOT_CONFIGURED', false)),
    } as unknown as FileConversionAdapter;
    const service = createService(prisma, {} as FileStorageService, converter);

    await expect(service.processBatch(1)).resolves.toBe(1);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'job-1', status: 'PROCESSING', attempts: 1 }),
        data: expect.objectContaining({
          status: 'DEAD',
          errorCode: 'FILE_CONVERTER_NOT_CONFIGURED',
          errorMessage: '未配置文件转换服务',
          leaseOwner: null,
        }),
      }),
    );
  });

  it('retries transient processing failures with bounded exponential backoff', async () => {
    const updateMany = jest
      .fn()
      .mockImplementation((args: { where?: { id?: string } }) =>
        Promise.resolve({ count: args.where?.id === 'job-1' ? 1 : 0 }),
      );
    const prisma = {
      fileProcessingJob: {
        findMany: jest.fn().mockResolvedValue([{ id: 'job-1', attempts: 0 }]),
        updateMany,
        findFirst: jest.fn().mockResolvedValue(processingJob()),
      },
    } as unknown as PrismaService;
    const storage = {
      getObjectFrom: jest.fn().mockRejectedValue(new Error('temporary storage outage')),
    } as unknown as FileStorageService;
    const service = createService(prisma, storage);
    const before = Date.now();

    await expect(service.processBatch(1)).resolves.toBe(1);

    const failureCall = updateMany.mock.calls.find(
      ([args]: [{ data?: { errorCode?: string } }]) =>
        args.data?.errorCode === 'FILE_PROCESSING_RUNTIME_FAILED',
    )?.[0] as { data: { status: string; availableAt: Date; errorMessage: string } } | undefined;
    expect(failureCall?.data).toEqual(
      expect.objectContaining({
        status: 'PENDING',
        availableAt: expect.any(Date),
        errorMessage: expect.not.stringContaining('temporary storage outage'),
      }),
    );
    expect(failureCall?.data.availableAt.getTime()).toBeGreaterThanOrEqual(before + 4_000);
  });
});

function createService(
  prisma: PrismaService,
  storage: FileStorageService,
  converter: FileConversionAdapter = { convert: jest.fn() } as unknown as FileConversionAdapter,
): FileProcessingService {
  const config = {
    get: jest.fn().mockReturnValue(workerConfiguration),
  } as unknown as ConfigService;
  return new FileProcessingService(prisma, storage, config, converter);
}

function processingJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    fileAssetId: 'asset-1',
    type: 'THUMBNAIL',
    status: 'PROCESSING',
    progress: 5,
    attempts: 1,
    availableAt: new Date(),
    leaseOwner: 'worker',
    leaseExpiresAt: new Date(Date.now() + 300_000),
    outputAssetId: null,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date(),
    startedAt: new Date(),
    completedAt: null,
    updatedAt: new Date(),
    inputAsset: inputAsset(),
    ...overrides,
  };
}

function inputAsset() {
  return {
    id: 'asset-1',
    ownerType: 'PROJECT_ARCHIVE',
    ownerId: 'archive-item-1',
    originalName: 'photo.png',
    extension: 'png',
    mimeType: 'image/png',
    size: BigInt(256),
    storageProvider: 'minio',
    storageBucket: 'delivery-platform',
    storageKey: 'source/photo.png',
    checksum: null,
    status: 'AVAILABLE',
    createdBy: 'user-1',
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
