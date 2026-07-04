import { Module } from '@nestjs/common';

import { PlatformModule } from '../platform/platform.module';
import { ProjectModule } from '../project/project.module';

import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  imports: [PlatformModule, ProjectModule],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
