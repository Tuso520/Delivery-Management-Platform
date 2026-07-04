import { Module } from '@nestjs/common';

import { ProjectModule } from '../project/project.module';

import { FileStorageService } from './file-storage.service';
import { FileController, ArchiveFileController } from './file.controller';
import { FileService } from './file.service';

@Module({
  imports: [ProjectModule],
  controllers: [FileController, ArchiveFileController],
  providers: [FileService, FileStorageService],
  exports: [FileService, FileStorageService],
})
export class FileModule {}
