import { Module } from '@nestjs/common';

import { PlatformModule } from '../platform/platform.module';

import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';

@Module({
  imports: [PlatformModule],
  controllers: [TemplateController],
  providers: [TemplateService],
  exports: [TemplateService],
})
export class TemplateModule {}
