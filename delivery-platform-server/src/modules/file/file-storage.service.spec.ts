import { createHash } from 'crypto';
import { Readable } from 'stream';

import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { FileStorageService } from './file-storage.service';

describe('FileStorageService readiness', () => {
  function createService(bucketExists: jest.Mock): FileStorageService {
    const configService = {
      get: jest.fn().mockReturnValue({
        endpoint: '127.0.0.1',
        port: 9000,
        accessKey: 'local-access',
        secretKey: 'local-secret',
        bucket: 'delivery-files',
        useSSL: false,
      }),
    } as unknown as ConfigService;
    const service = new FileStorageService(configService);
    Object.defineProperty(service, 'client', {
      value: { bucketExists },
    });
    return service;
  }

  it('probes MinIO on every readiness request instead of reusing initialization state', async () => {
    const bucketExists = jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const service = createService(bucketExists);

    await expect(service.getStatus()).resolves.toEqual({
      bucket: 'delivery-files',
      available: true,
    });
    await expect(service.getStatus()).resolves.toEqual({
      bucket: 'delivery-files',
      available: false,
    });
    expect(bucketExists).toHaveBeenCalledTimes(2);
  });

  it('reports unavailable when the MinIO probe fails', async () => {
    const service = createService(jest.fn().mockRejectedValue(new Error('offline')));

    await expect(service.getStatus()).resolves.toEqual({
      bucket: 'delivery-files',
      available: false,
    });
  });

  it('maps an internal signed URL to the same-origin browser storage proxy', () => {
    const service = createService(jest.fn().mockResolvedValue(true));

    expect(
      service.toBrowserPreviewUrl(
        'http://minio:9000/delivery-files/path/file.pdf?X-Amz-Signature=signed',
      ),
    ).toBe('/storage/delivery-files/path/file.pdf?X-Amz-Signature=signed');
  });

  it('streams incoming content while calculating checksum and signature bytes', async () => {
    const service = createService(jest.fn().mockResolvedValue(true));
    const putObject = jest.fn(
      (
        _bucket: string,
        _objectName: string,
        stream: Readable,
        _size: number | undefined,
        _metadata: Record<string, string>,
      ): Promise<void> =>
        new Promise((resolve, reject) => {
          stream.on('data', () => undefined);
          stream.once('end', resolve);
          stream.once('error', reject);
        }),
    );
    Object.defineProperty(service, 'client', {
      value: {
        bucketExists: jest.fn().mockResolvedValue(true),
        putObject,
        removeObject: jest.fn().mockResolvedValue(undefined),
      },
    });
    const content = Buffer.from('streamed upload content');

    const result = await service.uploadIncoming(
      Readable.from([content.subarray(0, 7), content.subarray(7)]),
      'example.txt',
      'text/plain',
      500,
    );

    expect(result).toMatchObject({
      streamedToObjectStorage: true,
      storageBucket: 'delivery-files',
      size: content.length,
      checksum: createHash('sha256').update(content).digest('hex'),
      headBuffer: content.subarray(0, 16),
    });
    expect(result.storageKey).toMatch(/^incoming\/\d{4}-\d{2}-\d{2}\//u);
    expect(putObject).toHaveBeenCalledTimes(1);
  });

  it('keeps the full original name in metadata while bounding a multibyte storage key', async () => {
    const service = createService(jest.fn().mockResolvedValue(true));
    const putObject = jest.fn(
      (
        _bucket: string,
        _objectName: string,
        stream: Readable,
        _size: number | undefined,
        _metadata: Record<string, string>,
      ): Promise<void> =>
        new Promise((resolve, reject) => {
          stream.on('data', () => undefined);
          stream.once('end', resolve);
          stream.once('error', reject);
        }),
    );
    Object.defineProperty(service, 'client', {
      value: {
        bucketExists: jest.fn().mockResolvedValue(true),
        putObject,
        removeObject: jest.fn().mockResolvedValue(undefined),
      },
    });
    const originalName = `${'项目交付标准资料'.repeat(24)}.md`;

    await service.uploadIncoming(
      Readable.from([Buffer.from('# content', 'utf8')]),
      originalName,
      'text/markdown',
      500,
    );

    const objectName = putObject.mock.calls[0]?.[1] as string;
    const objectNameSegment = objectName.split('/').at(-1) ?? '';
    const metadata = putObject.mock.calls[0]?.[4] as Record<string, string>;
    expect(Buffer.byteLength(objectNameSegment, 'utf8')).toBeLessThanOrEqual(240);
    expect(objectNameSegment).toMatch(/\.md$/u);
    expect(metadata['X-Amz-Meta-Original-Name']).toBe(encodeURIComponent(originalName));
  });

  it('preserves an oversize upload as a bad request and removes any partial object', async () => {
    const service = createService(jest.fn().mockResolvedValue(true));
    const removeObject = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(service, 'client', {
      value: {
        bucketExists: jest.fn().mockResolvedValue(true),
        putObject: jest.fn(
          (
            _bucket: string,
            _objectName: string,
            stream: Readable,
          ): Promise<void> =>
            new Promise((resolve, reject) => {
              stream.on('data', () => undefined);
              stream.once('end', resolve);
              stream.once('error', reject);
            }),
        ),
        removeObject,
      },
    });

    await expect(
      service.uploadIncoming(Readable.from([Buffer.alloc(6)]), 'large.bin', 'application/octet-stream', 5),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(removeObject).toHaveBeenCalledTimes(1);
  });
});
