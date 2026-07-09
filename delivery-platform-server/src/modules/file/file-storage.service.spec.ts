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
});
