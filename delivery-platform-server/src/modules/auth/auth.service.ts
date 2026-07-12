import { createHash } from 'node:crypto';

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
import { SystemConfigService } from '../system-config/system-config.service';

import { LoginDto } from './dto/login.dto';
import { RefreshSessionService, type RefreshSessionContext } from './refresh-session.service';
import { JwtPayload } from './strategies/jwt.strategy';

interface UserWithRoles {
  userRoles: Array<{
    role: {
      roleCode: string;
      rolePermissions: Array<{ permission: { permissionCode: string } }>;
    };
  }>;
}

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
    @Optional() private readonly systemConfig?: SystemConfigService,
  ) {}

  private extractRolesAndPermissions(user: UserWithRoles): {
    roles: string[];
    permissions: string[];
  } {
    const roles = user.userRoles.map((ur) => ur.role.roleCode);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.permissionCode),
        ),
      ),
    ];
    return { roles, permissions };
  }

  async validateUser(username: string, password: string): Promise<AuthUser> {
    const user = await withTransientPrismaReadRetry(() => this.prisma.user.findFirst({
      where: { username, deletedAt: null },
      select: {
        id: true,
        username: true,
        password: true,
        realName: true,
        email: true,
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

    const { roles, permissions } = this.extractRolesAndPermissions(user);
    return {
      sub: user.id,
      username: user.username,
      realName: user.realName,
      email: user.email,
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

  async refresh(
    refreshToken: string,
    context: RefreshSessionContext = {},
  ): Promise<AuthSessionResult> {
    const rotated = await this.refreshSessions.rotate(refreshToken, context);
    const user = await this.getProfile(rotated.userId);

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

    const { roles, permissions } = this.extractRolesAndPermissions(user);
    return {
      sub: user.id,
      username: user.username,
      realName: user.realName,
      email: user.email,
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

  private loginAttemptKey(username: string, ipAddress?: string): string {
    return `login:${createHash('sha256')
      .update(`${username.trim().toLowerCase()}\0${ipAddress?.trim() || 'unknown'}`)
      .digest('hex')}`;
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
