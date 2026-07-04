import { Module } from '@nestjs/common';

import { OperationLogModule } from '../operation-log/operation-log.module';

import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [OperationLogModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
