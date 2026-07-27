import { Module } from '@nestjs/common';

import { FieldConfigurationModule } from '../field-configuration/field-configuration.module';
import { OperationLogModule } from '../operation-log/operation-log.module';
import { ReviewModule } from '../review/review.module';

import { ApprovalTemplateController } from './approval-template.controller';
import { ApprovalTemplateService } from './approval-template.service';
import { IntegrationModule } from './integration.module';
import { OperationalRecoveryController } from './operational-recovery.controller';
import { OperationalRecoveryService } from './operational-recovery.service';
import {
  DepartmentController,
  DictionaryController,
  ReferenceController,
} from './reference.controller';
import { ReferenceService } from './reference.service';

@Module({
  imports: [FieldConfigurationModule, OperationLogModule, ReviewModule, IntegrationModule],
  controllers: [
    DictionaryController,
    ReferenceController,
    DepartmentController,
    ApprovalTemplateController,
    OperationalRecoveryController,
  ],
  providers: [ReferenceService, ApprovalTemplateService, OperationalRecoveryService],
  exports: [IntegrationModule],
})
export class PlatformModule {}
