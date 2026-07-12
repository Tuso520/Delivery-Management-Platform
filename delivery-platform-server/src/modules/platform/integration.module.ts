import { Module } from '@nestjs/common';

import { OperationLogModule } from '../operation-log/operation-log.module';

import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';

@Module({
  imports: [OperationLogModule],
  controllers: [IntegrationController],
  providers: [IntegrationService],
  exports: [IntegrationService],
})
export class IntegrationModule {}
