import { Module } from '@nestjs/common';

import { OperationLogModule } from '../operation-log/operation-log.module';
import { ProjectModule } from '../project/project.module';

import { ProjectPaymentController } from './project-payment.controller';
import { ProjectPaymentService } from './project-payment.service';

@Module({
  imports: [ProjectModule, OperationLogModule],
  controllers: [ProjectPaymentController],
  providers: [ProjectPaymentService],
  exports: [ProjectPaymentService],
})
export class ProjectPaymentModule {}
