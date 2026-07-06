import { Module } from '@nestjs/common';

import { AttachmentModule } from '../attachment/attachment.module';
import { PlatformModule } from '../platform/platform.module';

import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';

@Module({
  imports: [AttachmentModule, PlatformModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
