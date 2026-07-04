import { Module } from '@nestjs/common';

import { CurrencyController, ExchangeRateController } from './currency.controller';
import { CurrencyService } from './currency.service';

@Module({
  controllers: [CurrencyController, ExchangeRateController],
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
