import { forwardRef, Module } from '@nestjs/common';

import { ProjectModule } from '../project/project.module';

import { ProjectArchiveSnapshotService } from './project-archive-snapshot.service';
import { ProjectArchiveTargetService } from './project-archive-target.service';
import { ProjectArchiveTargetController } from './project-archive.controller';

@Module({
  imports: [forwardRef(() => ProjectModule)],
  controllers: [ProjectArchiveTargetController],
  providers: [ProjectArchiveSnapshotService, ProjectArchiveTargetService],
  exports: [ProjectArchiveSnapshotService, ProjectArchiveTargetService],
})
export class ProjectArchiveModule {}
