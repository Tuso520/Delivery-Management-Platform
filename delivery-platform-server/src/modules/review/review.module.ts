import { forwardRef, Module } from '@nestjs/common';

import { DataScopeModule } from '../identity/data-scope/data-scope.module';
import { OperationLogModule } from '../operation-log/operation-log.module';
import { ProjectModule } from '../project/project.module';
import { SystemConfigModule } from '../system-config/system-config.module';

import { ReviewBusinessService } from './review-business.service';
import { ReviewConfigurationService } from './review-configuration.service';
import { ReviewTaskController } from './review-task.controller';
import { ReviewTaskService } from './review-task.service';
import { ReviewerEligibilityService } from './reviewer-eligibility.service';

@Module({
  imports: [
    forwardRef(() => ProjectModule),
    DataScopeModule,
    OperationLogModule,
    SystemConfigModule,
  ],
  controllers: [ReviewTaskController],
  providers: [
    ReviewerEligibilityService,
    ReviewBusinessService,
    ReviewConfigurationService,
    ReviewTaskService,
  ],
  exports: [
    ReviewerEligibilityService,
    ReviewBusinessService,
    ReviewConfigurationService,
    ReviewTaskService,
  ],
})
export class ReviewModule {}
