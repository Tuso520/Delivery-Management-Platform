import { Module } from '@nestjs/common';

import { OperationLogService } from './operation-log.service';

@Module({
  providers: [OperationLogService],
  exports: [OperationLogService],
})
export class OperationLogModule {}
