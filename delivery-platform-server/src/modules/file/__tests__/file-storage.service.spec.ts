import type { ConfigService } from '@nestjs/config';

const mockMinioClient = jest.fn();

jest.mock('minio', () => ({
  Client: function Client(options: unknown) {
    mockMinioClient(options);
  },
}));

import { FileStorageService } from '../file-storage.service';

describe('FileStorageService', () => {
  beforeEach(() => {
    mockMinioClient.mockClear();
  });

  it('configures bounded MinIO retries for transient 503 responses', () => {
    const config = {
      get: jest.fn().mockReturnValue({
        endpoint: 'minio',
        port: 9000,
        accessKey: 'access-key',
        secretKey: 'secret-key',
        bucket: 'delivery-platform',
        useSSL: false,
      }),
    } as unknown as ConfigService;

    new FileStorageService(config);

    expect(mockMinioClient).toHaveBeenCalledWith(
      expect.objectContaining({
        retryOptions: {
          maximumRetryCount: 3,
          baseDelayMs: 250,
          maximumDelayMs: 2_000,
        },
      }),
    );
  });
});
