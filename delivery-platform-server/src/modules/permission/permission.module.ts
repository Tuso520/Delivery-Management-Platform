import { Module } from '@nestjs/common';

import { OperationLogModule } from '../operation-log/operation-log.module';

import { PermissionResolutionService } from './permission-resolution.service';
import { PermissionController } from './permission.controller';
import { PermissionService } from './permission.service';

@Module({
  imports: [OperationLogModule],
  controllers: [PermissionController],
  providers: [PermissionService, PermissionResolutionService],
  exports: [PermissionService, PermissionResolutionService],
})
export class PermissionModule {}
