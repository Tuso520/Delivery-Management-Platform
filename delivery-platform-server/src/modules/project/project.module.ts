import { Module } from '@nestjs/common';

import { ProjectArchiveModule } from '../project-archive/project-archive.module';
import { ReviewModule } from '../review/review.module';
import { SystemConfigModule } from '../system-config/system-config.module';

import { ProjectAccessModule } from './project-access.module';
import { ProjectConfigurationService } from './project-configuration.service';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';

@Module({
  imports: [
    ProjectAccessModule,
    ProjectArchiveModule,
    ReviewModule,
    SystemConfigModule,
  ],
  controllers: [ProjectController],
  providers: [ProjectService, ProjectConfigurationService],
  exports: [ProjectAccessModule, ProjectService, ProjectConfigurationService],
})
export class ProjectModule {}
