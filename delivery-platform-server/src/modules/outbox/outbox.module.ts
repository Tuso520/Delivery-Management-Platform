import { Module } from '@nestjs/common';

import { NotificationModule } from '../notification/notification.module';
import { IntegrationModule } from '../platform/integration.module';

import { OutboxDispatcherService } from './outbox-dispatcher.service';

@Module({
  imports: [NotificationModule, IntegrationModule],
  providers: [OutboxDispatcherService],
  exports: [OutboxDispatcherService],
})
export class OutboxModule {}
