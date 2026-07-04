import { Module } from '@nestjs/common';

import { LanguageController, TranslationController } from './language.controller';
import { LanguageService } from './language.service';

@Module({
  controllers: [LanguageController, TranslationController],
  providers: [LanguageService],
  exports: [LanguageService],
})
export class LanguageModule {}
