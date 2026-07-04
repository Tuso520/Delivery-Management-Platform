import { Module } from '@nestjs/common';

import { FileModule } from '../file/file.module';
import { NotificationModule } from '../notification/notification.module';
import { OperationLogModule } from '../operation-log/operation-log.module';

import { ApprovalBusinessService } from './approval-business.service';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import {
  DepartmentController,
  DictionaryController,
  ReferenceController,
} from './reference.controller';
import { ReferenceService } from './reference.service';
import { RetrospectiveController } from './retrospective.controller';
import { RetrospectiveService } from './retrospective.service';
import { SystemOperationsController } from './system-operations.controller';
import { SystemOperationsService } from './system-operations.service';
import { WorkforceController } from './workforce.controller';
import { WorkforceService } from './workforce.service';

@Module({
  imports: [FileModule, NotificationModule, OperationLogModule],
  controllers: [
    DictionaryController,
    ReferenceController,
    DepartmentController,
    ApprovalController,
    WorkforceController,
    RetrospectiveController,
    SystemOperationsController,
  ],
  providers: [
    ReferenceService,
    ApprovalBusinessService,
    ApprovalService,
    WorkforceService,
    RetrospectiveService,
    SystemOperationsService,
  ],
  exports: [ApprovalService],
})
export class PlatformModule {}
