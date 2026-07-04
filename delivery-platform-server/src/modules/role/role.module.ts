import { Module } from '@nestjs/common';

import { OperationLogModule } from '../operation-log/operation-log.module';

import { RoleController } from './role.controller';
import { RoleService } from './role.service';

@Module({
  imports: [OperationLogModule],
  controllers: [RoleController],
  providers: [RoleService],
  exports: [RoleService],
})
export class RoleModule {}
