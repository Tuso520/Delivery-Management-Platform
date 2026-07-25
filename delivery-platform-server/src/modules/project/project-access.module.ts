import { Module } from '@nestjs/common';

import { DataScopeModule } from '../identity/data-scope/data-scope.module';

import { ProjectAccessService } from './project-access.service';

@Module({
  imports: [DataScopeModule],
  providers: [ProjectAccessService],
  exports: [ProjectAccessService],
})
export class ProjectAccessModule {}
