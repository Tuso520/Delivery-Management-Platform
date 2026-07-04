import { Module } from '@nestjs/common';

import { ProjectModule } from '../project/project.module';

import { ProjectProcessController } from './project-process.controller';
import { ProjectProcessService } from './project-process.service';

@Module({
  imports: [ProjectModule],
  controllers: [ProjectProcessController],
  providers: [ProjectProcessService],
  exports: [ProjectProcessService],
})
export class ProjectProcessModule {}
