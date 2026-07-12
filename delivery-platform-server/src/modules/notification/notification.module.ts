import { Module } from '@nestjs/common';

import { NotificationRuleController } from './notification-rule.controller';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  controllers: [NotificationController, NotificationRuleController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
