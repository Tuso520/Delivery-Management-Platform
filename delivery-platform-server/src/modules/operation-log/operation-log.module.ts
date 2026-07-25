import { Global, Module } from '@nestjs/common';

import { AuditRecoveryService } from './audit-recovery.service';
import { OperationLogService } from './operation-log.service';

@Global()
@Module({
  providers: [OperationLogService, AuditRecoveryService],
  exports: [OperationLogService, AuditRecoveryService],
})
export class OperationLogModule {}
