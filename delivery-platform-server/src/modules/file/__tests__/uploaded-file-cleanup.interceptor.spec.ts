import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, throwError } from 'rxjs';

import type { FileStorageService } from '../file-storage.service';
import { UploadedFileCleanupInterceptor } from '../uploaded-file-cleanup.interceptor';

describe('UploadedFileCleanupInterceptor', () => {
  it('removes an unclaimed streamed object when DTO validation rejects the request', async () => {
    const file = { originalname: 'invalid.pdf' } as Express.Multer.File;
    const storage = {
      cleanupUnclaimedUpload: jest.fn().mockResolvedValue(undefined),
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ file }) }),
    } as unknown as ExecutionContext;
    const validationError = new Error('revisionLevel 必须为 MINOR 或 MAJOR');
    const next = {
      handle: () => throwError(() => validationError),
    } as CallHandler;
    const interceptor = new UploadedFileCleanupInterceptor(
      storage as unknown as FileStorageService,
    );

    await expect(lastValueFrom(interceptor.intercept(context, next))).rejects.toBe(validationError);
    expect(storage.cleanupUnclaimedUpload).toHaveBeenCalledWith(file);
  });
});
