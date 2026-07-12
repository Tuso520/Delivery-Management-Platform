import type { ConfigService } from '@nestjs/config';

import {
  FileConversionAdapter,
  type ConversionInputAsset,
} from '../file-conversion.adapter';
import type { FileStorageService } from '../file-storage.service';

const input: ConversionInputAsset = {
  id: 'asset-1',
  originalName: 'layout.dwg',
  extension: 'dwg',
  mimeType: 'application/acad',
  storageBucket: 'delivery-platform',
  storageKey: 'source/layout.dwg',
};

describe('FileConversionAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('fails fast when no audited external converter is configured', async () => {
    const storage = { getPresignedUrlFrom: jest.fn() } as unknown as FileStorageService;
    const adapter = new FileConversionAdapter(config({ converterUrl: '' }), storage);

    await expect(
      adapter.convert('job-1', 'CAD_CONVERT', input),
    ).rejects.toMatchObject({
      code: 'FILE_CONVERTER_NOT_CONFIGURED',
      retryable: false,
    });
    expect(storage.getPresignedUrlFrom).not.toHaveBeenCalled();
  });

  it('accepts only the declared binary output contract', async () => {
    const storage = {
      getPresignedUrlFrom: jest.fn().mockResolvedValue('https://files.test/source'),
    } as unknown as FileStorageService;
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(Buffer.from('%PDF-converted'), {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
    );
    const adapter = new FileConversionAdapter(
      config({ converterUrl: 'https://converter.test/jobs', converterToken: 'test-token' }),
      storage,
    );

    await expect(adapter.convert('job-1', 'CAD_CONVERT', input)).resolves.toEqual({
      data: Buffer.from('%PDF-converted'),
      extension: 'pdf',
      mimeType: 'application/pdf',
      originalName: 'layout-cad-preview.pdf',
    });
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://converter.test/jobs'),
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({ authorization: 'Bearer test-token' }),
      }),
    );
  });

  it('classifies server-side converter failures as retryable without exposing a response body', async () => {
    const storage = {
      getPresignedUrlFrom: jest.fn().mockResolvedValue('https://files.test/source'),
    } as unknown as FileStorageService;
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('internal converter stack trace', { status: 503 }));
    const adapter = new FileConversionAdapter(
      config({ converterUrl: 'https://converter.test/jobs' }),
      storage,
    );

    await expect(adapter.convert('job-1', 'CAD_CONVERT', input)).rejects.toEqual(
      expect.objectContaining({ code: 'FILE_CONVERTER_UNAVAILABLE', retryable: true }),
    );
  });
});

function config(overrides: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn().mockReturnValue({
      converterUrl: '',
      converterToken: '',
      converterTimeoutMs: 5_000,
      converterMaxOutputBytes: 1024 * 1024,
      ...overrides,
    }),
  } as unknown as ConfigService;
}
