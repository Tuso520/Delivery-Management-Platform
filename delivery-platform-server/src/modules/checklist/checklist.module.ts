import { Module } from '@nestjs/common';

import { PlatformModule } from '../platform/platform.module';
import { ProjectModule } from '../project/project.module';

import { ChecklistStatisticsService } from './checklist-statistics.service';
import { ChecklistController } from './checklist.controller';
import { ChecklistService } from './checklist.service';

@Module({
  imports: [PlatformModule, ProjectModule],
  controllers: [ChecklistController],
  providers: [ChecklistService, ChecklistStatisticsService],
  exports: [ChecklistService],
})
export class ChecklistModule {}
