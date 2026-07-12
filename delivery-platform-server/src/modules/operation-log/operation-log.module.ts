import { Module } from '@nestjs/common';

import { AuditLogController } from './operation-log.controller';
import { OperationLogService } from './operation-log.service';

@Module({
  controllers: [AuditLogController],
  providers: [OperationLogService],
  exports: [OperationLogService],
})
export class OperationLogModule {}
