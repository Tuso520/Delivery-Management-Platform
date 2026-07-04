import { Module } from '@nestjs/common';

import { ArchiveTemplateController } from './archive-template.controller';
import { ArchiveTemplateService } from './archive-template.service';

@Module({
  controllers: [ArchiveTemplateController],
  providers: [ArchiveTemplateService],
  exports: [ArchiveTemplateService],
})
export class ArchiveTemplateModule {}
