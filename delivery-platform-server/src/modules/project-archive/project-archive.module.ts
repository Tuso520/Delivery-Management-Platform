import { Module } from '@nestjs/common';

import { ProjectAccessModule } from '../project/project-access.module';

import { ProjectArchiveSnapshotService } from './project-archive-snapshot.service';
import { ProjectArchiveTargetService } from './project-archive-target.service';
import { ProjectArchiveTargetController } from './project-archive.controller';

@Module({
  imports: [ProjectAccessModule],
  controllers: [ProjectArchiveTargetController],
  providers: [ProjectArchiveSnapshotService, ProjectArchiveTargetService],
  exports: [ProjectArchiveSnapshotService, ProjectArchiveTargetService],
})
export class ProjectArchiveModule {}
