import { Module } from '@nestjs/common';

import { ProjectAccessService } from './project-access.service';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';

@Module({
  controllers: [ProjectController],
  providers: [ProjectService, ProjectAccessService],
  exports: [ProjectService, ProjectAccessService],
})
export class ProjectModule {}
