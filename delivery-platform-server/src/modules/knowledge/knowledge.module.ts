import { Module } from '@nestjs/common';

import { ReviewModule } from '../review/review.module';
import { SystemConfigModule } from '../system-config/system-config.module';

import { KnowledgeItemController } from './knowledge-item.controller';
import { KnowledgeItemService } from './knowledge-item.service';

@Module({
  imports: [ReviewModule, SystemConfigModule],
  controllers: [KnowledgeItemController],
  providers: [KnowledgeItemService],
  exports: [KnowledgeItemService],
})
export class KnowledgeModule {}
