import { Module } from '@nestjs/common';

import { PlatformModule } from '../platform/platform.module';

import { OkrController } from './okr.controller';
import { OkrService } from './okr.service';

@Module({
  imports: [PlatformModule],
  controllers: [OkrController],
  providers: [OkrService],
  exports: [OkrService],
})
export class OkrModule {}
