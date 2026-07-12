import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OperationAuditInterceptor } from './common/interceptors/operation-audit.interceptor';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import databaseConfig from './config/database.config';
import documentConfig from './config/document.config';
import fileProcessingConfig from './config/file-processing.config';
import redisConfig from './config/redis.config';
import storageConfig from './config/storage.config';
import { PrismaModule } from './database/prisma.service';
import { RedisModule } from './database/redis.service';
import { ArchiveTemplateModule } from './modules/archive-template/archive-template.module';
import { AuthModule } from './modules/auth/auth.module';
import { CountryModule } from './modules/country/country.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { FileModule } from './modules/file/file.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { LanguageModule } from './modules/language/language.module';
import { NotificationModule } from './modules/notification/notification.module';
import { OperationLogModule } from './modules/operation-log/operation-log.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { PermissionModule } from './modules/permission/permission.module';
import { PlatformModule } from './modules/platform/platform.module';
import { ProjectModule } from './modules/project/project.module';
import { ProjectArchiveModule } from './modules/project-archive/project-archive.module';
import { ProjectMemberModule } from './modules/project-member/project-member.module';
import { ProjectPaymentModule } from './modules/project-payment/project-payment.module';
import { ReviewModule } from './modules/review/review.module';
import { RoleModule } from './modules/role/role.module';
import { StandardModule } from './modules/standard/standard.module';
import { SystemConfigModule } from './modules/system-config/system-config.module';
import { ToolModule } from './modules/tool/tool.module';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        authConfig,
        storageConfig,
        documentConfig,
        fileProcessingConfig,
        redisConfig,
      ],
      envFilePath: '.env',
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    UserModule,
    RoleModule,
    StandardModule,
    PermissionModule,
    ProjectModule,
    ProjectMemberModule,
    ProjectPaymentModule,
    ArchiveTemplateModule,
    ProjectArchiveModule,
    FileModule,
    ReviewModule,
    CountryModule,
    CurrencyModule,
    LanguageModule,
    DashboardModule,
    NotificationModule,
    OutboxModule,
    OperationLogModule,
    SystemConfigModule,
    KnowledgeModule,
    ToolModule,
    PlatformModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: OperationAuditInterceptor,
    },
  ],
})
export class AppModule {}
