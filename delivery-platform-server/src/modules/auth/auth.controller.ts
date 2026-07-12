import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { AuthService, type AuthSessionResult } from './auth.service';
import { LoginDto } from './dto/login.dto';
import type { RefreshSessionContext } from './refresh-session.service';
import { JwtPayload } from './strategies/jwt.strategy';

type PublicAuthResult = Omit<AuthSessionResult, 'refreshToken' | 'refreshExpiresAt'>;

@ApiTags('Auth')
@ApiBearerAuth('JWT-auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用户登录并建立可轮换刷新会话' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: '登录成功' })
  @ApiResponse({ status: 401, description: '用户名或密码错误' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicAuthResult> {
    const result = await this.authService.login(loginDto, this.getSessionContext(request));
    this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
    return this.toPublicResult(result);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '轮换 Refresh Token 并签发新的 Access Token' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicAuthResult> {
    try {
      const result = await this.authService.refresh(
        this.getRefreshCookie(request),
        this.getSessionContext(request),
      );
      this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
      return this.toPublicResult(result);
    } catch (error) {
      this.clearRefreshCookie(response);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '退出当前设备' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    const result = await this.authService.logout(
      this.extractBearerToken(request.headers.authorization),
      this.getRefreshCookie(request),
    );
    this.clearRefreshCookie(response);
    return result;
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '退出当前用户的全部设备' })
  async logoutAll(
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    const result = await this.authService.logoutAll(
      user.sub,
      this.extractBearerToken(request.headers.authorization),
    );
    this.clearRefreshCookie(response);
    return result;
  }

  @Get('profile')
  @ApiOperation({ summary: '获取当前用户信息' })
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }

  @Get('session')
  @ApiOperation({ summary: '获取当前会话及默认业务入口' })
  async getSession(@CurrentUser() user: JwtPayload) {
    return this.authService.getSession(user.sub);
  }

  private toPublicResult(result: AuthSessionResult): PublicAuthResult {
    return {
      accessToken: result.accessToken,
      user: result.user,
      defaultRoute: result.defaultRoute,
    };
  }

  private getSessionContext(request: Request): RefreshSessionContext {
    return {
      deviceId: request.get('x-device-id'),
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    };
  }

  private extractBearerToken(authHeader?: string): string {
    if (!authHeader?.startsWith('Bearer ')) return '';
    return authHeader.substring(7);
  }

  private getRefreshCookie(request: Request): string {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return '';

    const cookieName = this.getCookieName();
    for (const item of cookieHeader.split(';')) {
      const separator = item.indexOf('=');
      if (separator < 0) continue;
      const name = item.slice(0, separator).trim();
      if (name !== cookieName) continue;
      const rawValue = item.slice(separator + 1).trim();
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return '';
      }
    }
    return '';
  }

  private setRefreshCookie(response: Response, token: string, expiresAt: Date): void {
    response.cookie(this.getCookieName(), token, {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'lax',
      path: '/api/v1/auth',
      expires: expiresAt,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(this.getCookieName(), {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'lax',
      path: '/api/v1/auth',
    });
  }

  private getCookieName(): string {
    return this.configService.get<string>('auth.refreshCookieName') || 'delivery_refresh_token';
  }

  private isProduction(): boolean {
    return this.configService.get<string>('app.nodeEnv') === 'production';
  }
}
