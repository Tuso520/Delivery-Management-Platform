import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { RedisModule } from '../../database/redis.service';
import { SystemConfigModule } from '../system-config/system-config.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshSessionService } from './refresh-session.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    RedisModule,
    SystemConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const secret = configService.get<string>('auth.jwtSecret');
        if (!secret) {
          throw new Error('JWT_SECRET is not configured. Check your .env file.');
        }
        type JwtExpiresIn = NonNullable<JwtModuleOptions['signOptions']>['expiresIn'];
        const expiresIn = (configService.get<string>('auth.jwtExpiresIn') || '15m') as JwtExpiresIn;
        return {
          secret,
          signOptions: {
            expiresIn,
          },
        };
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120,
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshSessionService,
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [AuthService, RefreshSessionService, JwtModule],
})
export class AuthModule {}
