import { Module } from '@nestjs/common';

import { FileModule } from '../file/file.module';
import { OperationLogModule } from '../operation-log/operation-log.module';
import { ProjectModule } from '../project/project.module';

import { AttachmentController } from './attachment.controller';
import { AttachmentService } from './attachment.service';

@Module({
  imports: [FileModule, OperationLogModule, ProjectModule],
  controllers: [AttachmentController],
  providers: [AttachmentService],
  exports: [AttachmentService],
})
export class AttachmentModule {}
