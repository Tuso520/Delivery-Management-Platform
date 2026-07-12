import { Module } from '@nestjs/common';

import { OperationLogModule } from '../operation-log/operation-log.module';
import { ProjectModule } from '../project/project.module';
import { ReviewModule } from '../review/review.module';
import { SystemConfigModule } from '../system-config/system-config.module';

import { FileConversionAdapter } from './file-conversion.adapter';
import { FileProcessingService } from './file-processing.service';
import { FileStorageService } from './file-storage.service';
import { FileController, ProjectArchiveFileController } from './file.controller';
import { UnifiedFileService } from './unified-file.service';

@Module({
  imports: [ProjectModule, ReviewModule, OperationLogModule, SystemConfigModule],
  controllers: [FileController, ProjectArchiveFileController],
  providers: [FileStorageService, FileConversionAdapter, FileProcessingService, UnifiedFileService],
  exports: [FileStorageService, FileProcessingService, UnifiedFileService],
})
export class FileModule {}
