import type { Request } from 'express';
import type { StorageEngine } from 'multer';

import { FILE_UPLOAD_MAX_BYTES } from '../../config/file-processing.config';

import { FileStorageService } from './file-storage.service';

type MulterCallback = (error?: Error | null, info?: Partial<Express.Multer.File>) => void;

export class MinioMulterStorage implements StorageEngine {
  constructor(private readonly storage: FileStorageService) {}

  _handleFile(
    _request: Request,
    file: Express.Multer.File,
    callback: MulterCallback,
  ): void {
    this.storage
      .uploadIncoming(
        file.stream,
        file.originalname,
        file.mimetype,
        FILE_UPLOAD_MAX_BYTES,
      )
      .then((uploaded) => callback(null, uploaded))
      .catch((error: Error) => callback(error));
  }

  _removeFile(
    _request: Request,
    file: Express.Multer.File,
    callback: (error: Error | null) => void,
  ): void {
    this.storage
      .cleanupUnclaimedUpload(file)
      .then(() => callback(null))
      .catch((error: Error) => callback(error));
  }
}
