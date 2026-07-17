import { Module } from '@nestjs/common';

import { FieldConfigurationController, FieldOptionsController } from './field-configuration.controller';
import { FieldConfigurationService } from './field-configuration.service';

@Module({
  controllers: [FieldConfigurationController, FieldOptionsController],
  providers: [FieldConfigurationService],
  exports: [FieldConfigurationService],
})
export class FieldConfigurationModule {}
