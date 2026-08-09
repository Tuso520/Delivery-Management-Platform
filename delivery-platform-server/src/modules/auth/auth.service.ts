import { createHash, randomBytes } from 'node:crypto';

import {
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import { withTransientPrismaReadRetry } from '../../database/prisma-transient-read';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { PermissionResolutionService } from '../permission/permission-resolution.service';
import { IntegrationService } from '../platform/integration.service';
import { SystemConfigService } from '../system-config/system-config.service';

import { LoginDto } from './dto/login.dto';
import { RefreshSessionService, type RefreshSessionContext } from './refresh-session.service';
import { JwtPayload } from './strategies/jwt.strategy';

export type AuthUser = Omit<JwtPayload, 'iat' | 'exp' | 'jti'>;

export interface AuthSessionResult {
  accessToken: string;
  user: AuthUser;
  defaultRoute: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly refreshSessions: RefreshSessionService,
    @Optional() private readonly systemConfig: SystemConfigService | undefined,
    private readonly permissionResolver: PermissionResolutionService,
    @Optional() private readonly integrationService?: IntegrationService,
  ) {}

  async validateUser(username: string, password: string): Promise<AuthUser> {
    const user = await withTransientPrismaReadRetry(() => this.prisma.user.findFirst({
      where: { username, deletedAt: null },
      select: {
        id: true,
        username: true,
        password: true,
        realName: true,
        email: true,
        avatarUrl: true,
        status: true,
        permissionVersion: true,
        userRoles: {
          where: { role: { status: 'Active' } },
          select: {
            role: {
              select: {
                roleCode: true,
                rolePermissions: {
                  where: { permission: { deprecatedAt: null } },
                  select: {
                    permission: { select: { permissionCode: true } },
                  },
                },
              },
            },
          },
        },
      },
    }));

    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    if (user.status !== 'Active') {
      throw new UnauthorizedException('账户已被禁用或锁定');
    }
    if (!(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const { roles, permissions } = await this.resolveRolesAndPermissions(user.id);
    return {
      sub: user.id,
      username: user.username,
      realName: user.realName,
      email: user.email,
      avatar: user.avatarUrl,
      roles,
      permissions,
      permissionVersion: user.permissionVersion,
    };
  }

  async login(loginDto: LoginDto, context: RefreshSessionContext = {}): Promise<AuthSessionResult> {
    const security = this.systemConfig ? (await this.systemConfig.getSettings()).security : null;
    const attemptKey = this.loginAttemptKey(loginDto.username, context.ipAddress);
    if (
      security &&
      (await this.redisService.getSecurityCounter(attemptKey)) >= security.loginMaxAttempts
    ) {
      throw this.tooManyLoginAttempts();
    }
    let user: AuthUser;
    try {
      user = await this.validateUser(loginDto.username, loginDto.password);
    } catch (error) {
      if (security && error instanceof UnauthorizedException) {
        const failures = await this.redisService.incrementSecurityCounter(attemptKey, 15 * 60);
        if (failures >= security.loginMaxAttempts) {
          throw this.tooManyLoginAttempts();
        }
      }
      throw error;
    }
    if (security) {
      await this.redisService.clearSecurityCounter(attemptKey);
    }
    const refresh = await this.refreshSessions.issue(user.sub, context);

    await this.prisma.user.update({
      where: { id: user.sub },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken: this.signAccessToken(user),
      user,
      defaultRoute: '/dashboard',
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

  async beginFeishuLogin(redirectPath = '/dashboard'): Promise<{ authorizationUrl: string }> {
    const integration = this.requireFeishuIntegration();
    const settings = await integration.getFeishuOAuthSettings();
    const state = randomBytes(32).toString('base64url');
    await this.redisService.storeOneTimeJson(
      'feishu-state',
      this.hashOpaqueValue(state),
      {
        integrationConfigId: settings.integrationConfigId,
        redirectPath: this.normalizeInternalPath(redirectPath),
        redirectUri: settings.redirectUri,
      },
      5 * 60,
    );
    const authorizationUrl = new URL(
      'https://accounts.feishu.cn/open-apis/authen/v1/authorize',
    );
    authorizationUrl.searchParams.set('app_id', settings.appId);
    authorizationUrl.searchParams.set('redirect_uri', settings.redirectUri);
    authorizationUrl.searchParams.set('state', state);
    return { authorizationUrl: authorizationUrl.toString() };
  }

  async handleFeishuCallback(input: {
    state: string;
    code?: string;
    error?: string;
  }): Promise<string> {
    const stateData = await this.redisService.consumeOneTimeJson(
      'feishu-state',
      this.hashOpaqueValue(input.state),
    );
    if (!stateData) throw new UnauthorizedException('飞书登录状态无效或已使用');
    if (input.error || !input.code) throw new UnauthorizedException('飞书授权未完成');

    const integrationConfigId = this.requiredStateString(stateData, 'integrationConfigId');
    const redirectUri = this.requiredStateString(stateData, 'redirectUri');
    const redirectPath = this.normalizeInternalPath(
      this.requiredStateString(stateData, 'redirectPath'),
    );
    const external = await this.requireFeishuIntegration().exchangeFeishuOAuthCode(
      integrationConfigId,
      input.code,
    );
    const identityFilters = [
      external.openId ? { openId: external.openId } : null,
      external.unionId ? { unionId: external.unionId } : null,
      external.tenantUserId ? { tenantUserId: external.tenantUserId } : null,
    ].filter((value): value is NonNullable<typeof value> => Boolean(value));
    const identities = await this.prisma.externalIdentity.findMany({
      where: {
        integrationConfigId,
        provider: 'FEISHU',
        isActive: true,
        OR: identityFilters,
      },
      select: {
        id: true,
        userId: true,
        user: { select: { status: true, deletedAt: true } },
      },
    });
    const userIds = [...new Set(identities.map(({ userId }) => userId))];
    if (userIds.length !== 1 || identities.length === 0) {
      throw new UnauthorizedException('飞书账号尚未绑定唯一系统用户');
    }
    if (identities.some(({ user }) => user.deletedAt || user.status !== 'Active')) {
      throw new UnauthorizedException('系统账号已停用或离职');
    }
    const userId = userIds[0];
    await this.prisma.externalIdentity.updateMany({
      where: { id: { in: identities.map(({ id }) => id) } },
      data: { lastSeenAt: new Date() },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: external.avatarUrl ?? null },
    });

    const ticket = randomBytes(32).toString('base64url');
    await this.redisService.storeOneTimeJson(
      'feishu-ticket',
      this.hashOpaqueValue(ticket),
      { userId, redirectPath },
      60,
    );
    const callback = new URL('/', redirectUri);
    callback.hash = `/login/feishu/callback?ticket=${encodeURIComponent(ticket)}`;
    return callback.toString();
  }

  async completeFeishuLogin(
    ticket: string,
    context: RefreshSessionContext = {},
  ): Promise<AuthSessionResult> {
    const ticketData = await this.redisService.consumeOneTimeJson(
      'feishu-ticket',
      this.hashOpaqueValue(ticket),
    );
    if (!ticketData) throw new UnauthorizedException('飞书登录票据无效或已使用');
    const userId = this.requiredStateString(ticketData, 'userId');
    const user = await this.getProfile(userId);
    const refresh = await this.refreshSessions.issue(userId, context);
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
    return {
      accessToken: this.signAccessToken(user),
      user,
      defaultRoute: this.normalizeInternalPath(
        this.requiredStateString(ticketData, 'redirectPath'),
      ),
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

  async refresh(
    refreshToken: string,
    context: RefreshSessionContext = {},
  ): Promise<AuthSessionResult> {
    const rotated = await this.refreshSessions.rotate(refreshToken, context);
    let user: AuthUser;
    try {
      user = await this.getProfile(rotated.userId);
    } catch (error) {
      // Rotation is intentionally one-time. If the user became inactive or was
      // removed between issuing and refreshing, revoke the just-created child
      // session so a failed refresh cannot leave a usable credential behind.
      await this.refreshSessions.revoke(rotated.token);
      throw error;
    }

    return {
      accessToken: this.signAccessToken(user),
      user,
      defaultRoute: '/dashboard',
      refreshToken: rotated.token,
      refreshExpiresAt: rotated.expiresAt,
    };
  }

  async logout(accessToken: string, refreshToken: string): Promise<{ message: string }> {
    await Promise.all([
      this.blacklistAccessToken(accessToken),
      this.refreshSessions.revoke(refreshToken),
    ]);
    return { message: '登出成功' };
  }

  async logoutAll(userId: string, accessToken: string): Promise<{ message: string }> {
    await Promise.all([
      this.blacklistAccessToken(accessToken),
      this.refreshSessions.revokeAll(userId),
    ]);
    return { message: '所有设备已退出登录' };
  }

  async getProfile(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, status: 'Active' },
      select: {
        id: true,
        username: true,
        realName: true,
        email: true,
        avatarUrl: true,
        permissionVersion: true,
        userRoles: {
          where: { role: { status: 'Active' } },
          select: {
            role: {
              select: {
                roleCode: true,
                rolePermissions: {
                  where: { permission: { deprecatedAt: null } },
                  select: {
                    permission: { select: { permissionCode: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const { roles, permissions } = await this.resolveRolesAndPermissions(user.id);
    return {
      sub: user.id,
      username: user.username,
      realName: user.realName,
      email: user.email,
      avatar: user.avatarUrl,
      roles,
      permissions,
      permissionVersion: user.permissionVersion,
    };
  }

  async getSession(userId: string): Promise<{
    user: AuthUser;
    defaultRoute: string;
  }> {
    return {
      user: await this.getProfile(userId),
      defaultRoute: '/dashboard',
    };
  }

  private signAccessToken(user: AuthUser): string {
    return this.jwtService.sign({ ...user, jti: uuidv4() });
  }

  private async resolveRolesAndPermissions(
    userId: string,
  ): Promise<{ roles: string[]; permissions: string[] }> {
    return this.permissionResolver.resolveForUser(userId);
  }

  private loginAttemptKey(username: string, ipAddress?: string): string {
    return `login:${createHash('sha256')
      .update(`${username.trim().toLowerCase()}\0${ipAddress?.trim() || 'unknown'}`)
      .digest('hex')}`;
  }

  private requireFeishuIntegration(): IntegrationService {
    if (!this.integrationService) {
      throw new HttpException('飞书登录服务不可用', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return this.integrationService;
  }

  private hashOpaqueValue(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private requiredStateString(value: Record<string, unknown>, key: string): string {
    const candidate = value[key];
    if (typeof candidate !== 'string' || !candidate) {
      throw new UnauthorizedException('飞书登录状态无效');
    }
    return candidate;
  }

  private normalizeInternalPath(value: string): string {
    if (!value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) {
      return '/dashboard';
    }
    return value;
  }

  private tooManyLoginAttempts(): HttpException {
    return new HttpException('登录尝试过多，请稍后重试', HttpStatus.TOO_MANY_REQUESTS);
  }

  private async blacklistAccessToken(token: string): Promise<void> {
    if (!token) return;
    const decoded = this.jwtService.decode(token) as {
      jti?: string;
      exp?: number;
    } | null;
    if (!decoded?.jti || !decoded.exp) return;

    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await this.redisService.blacklistToken(decoded.jti, ttl);
    }
  }
}
