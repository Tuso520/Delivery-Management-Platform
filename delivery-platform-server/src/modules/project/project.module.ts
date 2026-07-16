import { forwardRef, Module } from '@nestjs/common';

import { DataScopeModule } from '../identity/data-scope/data-scope.module';
import { ProjectArchiveModule } from '../project-archive/project-archive.module';
import { ReviewModule } from '../review/review.module';
import { SystemConfigModule } from '../system-config/system-config.module';

import { ProjectAccessService } from './project-access.service';
import { ProjectConfigurationService } from './project-configuration.service';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';

@Module({
  imports: [
    DataScopeModule,
    forwardRef(() => ProjectArchiveModule),
    forwardRef(() => ReviewModule),
    SystemConfigModule,
  ],
  controllers: [ProjectController],
  providers: [ProjectService, ProjectAccessService, ProjectConfigurationService],
  exports: [ProjectService, ProjectAccessService, ProjectConfigurationService],
})
export class ProjectModule {}
