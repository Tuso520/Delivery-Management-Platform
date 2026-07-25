import { Module } from '@nestjs/common';

import { NotificationModule } from '../notification/notification.module';
import { OperationLogModule } from '../operation-log/operation-log.module';
import { IntegrationModule } from '../platform/integration.module';

import { OutboxDispatcherService } from './outbox-dispatcher.service';

@Module({
  imports: [NotificationModule, IntegrationModule, OperationLogModule],
  providers: [OutboxDispatcherService],
  exports: [OutboxDispatcherService],
})
export class OutboxModule {}
