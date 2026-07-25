import { Readable } from 'stream';

import { FILE_UPLOAD_MAX_BYTES } from '../../../config/file-processing.config';
import type { FileStorageService } from '../file-storage.service';
import { MinioMulterStorage } from '../minio-multer.storage';

describe('MinioMulterStorage', () => {
  it('streams the multipart body to object storage with the fixed 500 MiB ceiling', async () => {
    const uploaded = {
      streamedToObjectStorage: true as const,
      storageBucket: 'delivery-platform',
      storageKey: 'incoming/file.pdf',
      checksum: 'checksum',
      headBuffer: Buffer.from('%PDF-'),
      size: 12,
    };
    const storage = {
      uploadIncoming: jest.fn().mockResolvedValue(uploaded),
      cleanupUnclaimedUpload: jest.fn(),
    } as unknown as FileStorageService;
    const engine = new MinioMulterStorage(storage);
    const file = {
      stream: Readable.from(Buffer.from('%PDF-1.7')),
      originalname: 'drawing.pdf',
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    await new Promise<void>((resolve, reject) => {
      engine._handleFile({} as never, file, (error, info) => {
        if (error) {
          reject(error);
          return;
        }
        expect(info).toEqual(uploaded);
        resolve();
      });
    });

    expect(storage.uploadIncoming).toHaveBeenCalledWith(
      file.stream,
      'drawing.pdf',
      'application/pdf',
      FILE_UPLOAD_MAX_BYTES,
    );
  });
});
