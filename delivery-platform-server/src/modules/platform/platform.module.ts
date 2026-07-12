import { Module } from '@nestjs/common';

import { OperationLogModule } from '../operation-log/operation-log.module';
import { ReviewModule } from '../review/review.module';

import { ApprovalTemplateController } from './approval-template.controller';
import { ApprovalTemplateService } from './approval-template.service';
import { IntegrationModule } from './integration.module';
import {
  DepartmentController,
  DictionaryController,
  ReferenceController,
} from './reference.controller';
import { ReferenceService } from './reference.service';

@Module({
  imports: [OperationLogModule, ReviewModule, IntegrationModule],
  controllers: [
    DictionaryController,
    ReferenceController,
    DepartmentController,
    ApprovalTemplateController,
  ],
  providers: [ReferenceService, ApprovalTemplateService],
  exports: [IntegrationModule],
})
export class PlatformModule {}
