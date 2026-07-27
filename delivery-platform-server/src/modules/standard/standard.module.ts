import { Module } from '@nestjs/common';

import { FieldConfigurationModule } from '../field-configuration/field-configuration.module';
import { ReviewModule } from '../review/review.module';

import { StandardController } from './standard.controller';
import { StandardService } from './standard.service';

@Module({
  imports: [FieldConfigurationModule, ReviewModule],
  controllers: [StandardController],
  providers: [StandardService],
  exports: [StandardService],
})
export class StandardModule {}
