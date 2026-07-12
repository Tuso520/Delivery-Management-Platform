import { Module } from '@nestjs/common';

import { SystemConfigController, SystemSettingsController } from './system-config.controller';
import { SystemConfigService } from './system-config.service';

@Module({
  controllers: [SystemConfigController, SystemSettingsController],
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
