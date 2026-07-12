import { Module } from '@nestjs/common';

import { OperationLogModule } from '../operation-log/operation-log.module';
import { ReviewModule } from '../review/review.module';

import { ArchiveTemplateVersionController } from './archive-template-version.controller';
import { ArchiveTemplateVersionService } from './archive-template-version.service';
import { ArchiveTemplateController } from './archive-template.controller';
import { ArchiveTemplateService } from './archive-template.service';

@Module({
  imports: [OperationLogModule, ReviewModule],
  controllers: [ArchiveTemplateController, ArchiveTemplateVersionController],
  providers: [ArchiveTemplateService, ArchiveTemplateVersionService],
  exports: [ArchiveTemplateService, ArchiveTemplateVersionService],
})
export class ArchiveTemplateModule {}
