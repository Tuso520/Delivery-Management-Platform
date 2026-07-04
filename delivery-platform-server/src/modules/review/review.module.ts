import { Module } from '@nestjs/common';

import { ReviewController, FileReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  controllers: [ReviewController, FileReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
