import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';

import { FILE_UPLOAD_MAX_BYTES } from '../../config/file-processing.config';
import { FieldConfigurationModule } from '../field-configuration/field-configuration.module';
import { OperationLogModule } from '../operation-log/operation-log.module';
import { ProjectAccessModule } from '../project/project-access.module';
import { ReviewModule } from '../review/review.module';
import { SystemConfigModule } from '../system-config/system-config.module';

import { FileConversionAdapter } from './file-conversion.adapter';
import { FileProcessingService } from './file-processing.service';
import { FileStorageModule } from './file-storage.module';
import { FileStorageService } from './file-storage.service';
import { FileController, ProjectArchiveFileController } from './file.controller';
import { MinioMulterStorage } from './minio-multer.storage';
import { UnifiedFileService } from './unified-file.service';

@Module({
  imports: [
    ProjectAccessModule,
    FieldConfigurationModule,
    ReviewModule,
    OperationLogModule,
    SystemConfigModule,
    FileStorageModule,
    MulterModule.registerAsync({
      imports: [FileStorageModule],
      inject: [FileStorageService],
      useFactory: (storage: FileStorageService) => ({
        storage: new MinioMulterStorage(storage),
        limits: { fileSize: FILE_UPLOAD_MAX_BYTES },
      }),
    }),
  ],
  controllers: [FileController, ProjectArchiveFileController],
  providers: [FileConversionAdapter, FileProcessingService, UnifiedFileService],
  exports: [FileStorageModule, FileProcessingService, UnifiedFileService],
})
export class FileModule {}
