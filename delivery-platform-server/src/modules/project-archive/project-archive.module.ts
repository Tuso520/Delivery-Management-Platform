import { Module } from '@nestjs/common';

import { ProjectModule } from '../project/project.module';

import { ProjectArchiveController } from './project-archive.controller';
import { ProjectArchiveService } from './project-archive.service';

@Module({
  imports: [ProjectModule],
  controllers: [ProjectArchiveController],
  providers: [ProjectArchiveService],
  exports: [ProjectArchiveService],
})
export class ProjectArchiveModule {}
