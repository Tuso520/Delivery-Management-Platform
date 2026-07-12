import { Module } from '@nestjs/common';

import { ReviewModule } from '../review/review.module';

import { StandardController } from './standard.controller';
import { StandardService } from './standard.service';

@Module({
  imports: [ReviewModule],
  controllers: [StandardController],
  providers: [StandardService],
  exports: [StandardService],
})
export class StandardModule {}
