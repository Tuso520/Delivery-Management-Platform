import { Module } from '@nestjs/common';

import { DataScopeService } from './data-scope.service';

@Module({
  providers: [DataScopeService],
  exports: [DataScopeService],
})
export class DataScopeModule {}
