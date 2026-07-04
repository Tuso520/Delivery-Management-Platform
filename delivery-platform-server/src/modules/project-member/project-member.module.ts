import { Module } from '@nestjs/common';

import { OperationLogModule } from '../operation-log/operation-log.module';
import { ProjectModule } from '../project/project.module';

import { ProjectMemberController } from './project-member.controller';
import { ProjectMemberService } from './project-member.service';

@Module({
  imports: [ProjectModule, OperationLogModule],
  controllers: [ProjectMemberController],
  providers: [ProjectMemberService],
  exports: [ProjectMemberService],
})
export class ProjectMemberModule {}
