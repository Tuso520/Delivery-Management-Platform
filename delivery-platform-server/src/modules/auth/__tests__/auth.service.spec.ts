import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import type { PrismaService } from '../../../database/prisma.service';
import type { RedisService } from '../../../database/redis.service';
import type { PermissionResolutionService } from '../../permission/permission-resolution.service';
import type { IntegrationService } from '../../platform/integration.service';
import type { SystemConfigService } from '../../system-config/system-config.service';
import { AuthService } from '../auth.service';
import type { RefreshSessionService } from '../refresh-session.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findFirst: jest.Mock; update: jest.Mock };
    externalIdentity: { findMany: jest.Mock; updateMany: jest.Mock };
  };
  let jwtService: { sign: jest.Mock; decode: jest.Mock };
  let redisService: {
    blacklistToken: jest.Mock;
    storeOneTimeJson: jest.Mock;
    consumeOneTimeJson: jest.Mock;
  };
  let refreshSessions: {
    issue: jest.Mock;
    rotate: jest.Mock;
    revoke: jest.Mock;
    revokeAll: jest.Mock;
  };
  let permissionResolver: { resolveForUser: jest.Mock };

  const refreshExpiresAt = new Date('2026-07-18T00:00:00.000Z');
  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    password: '$2b$10$hashedpassword',
    realName: '测试用户',
    email: 'test@example.com',
    status: 'Active',
    permissionVersion: 3,
    userRoles: [
      {
        role: {
          roleCode: 'PROJECT_MANAGER',
          rolePermissions: [
            { permission: { permissionCode: 'project:view' } },
            { permission: { permissionCode: 'project:create' } },
          ],
        },
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      externalIdentity: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    jwtService = {
      sign: jest.fn(),
      decode: jest.fn(),
    };
    redisService = {
      blacklistToken: jest.fn(),
      storeOneTimeJson: jest.fn(),
      consumeOneTimeJson: jest.fn(),
    };
    refreshSessions = {
      issue: jest.fn(),
      rotate: jest.fn(),
      revoke: jest.fn(),
      revokeAll: jest.fn(),
    };
    permissionResolver = {
      resolveForUser: jest.fn().mockResolvedValue({
        roles: ['PROJECT_MANAGER'],
        permissions: ['project:view', 'project:create'],
      }),
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      redisService as unknown as RedisService,
      refreshSessions as unknown as RefreshSessionService,
      undefined,
      permissionResolver as unknown as PermissionResolutionService,
    );
  });

  describe('validateUser', () => {
    it('returns only roles and permissions loaded through the active-role filter', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('testuser', 'password123');

      expect(result).toEqual({
        sub: 'user-1',
        username: 'testuser',
        realName: '测试用户',
        email: 'test@example.com',
        roles: ['PROJECT_MANAGER'],
        permissions: ['project:view', 'project:create'],
        permissionVersion: 3,
      });
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { username: 'testuser', deletedAt: null },
          select: expect.objectContaining({
            userRoles: expect.objectContaining({
              where: { role: { status: 'Active' } },
            }),
          }),
        }),
      );
    });

    it('deduplicates permissions across active roles', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        userRoles: [
          mockUser.userRoles[0],
          {
            role: {
              roleCode: 'DELIVERY_MANAGER',
              rolePermissions: [
                { permission: { permissionCode: 'project:view' } },
                { permission: { permissionCode: 'user:view' } },
              ],
            },
          },
        ],
      });
      permissionResolver.resolveForUser.mockResolvedValue({
        roles: ['PROJECT_MANAGER', 'DELIVERY_MANAGER'],
        permissions: ['project:view', 'project:create', 'user:view'],
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('testuser', 'password123');

      expect(result.permissions).toEqual(['project:view', 'project:create', 'user:view']);
    });

    it('rejects missing users', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.validateUser('missing', 'password123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects inactive accounts before checking the password', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        status: 'Inactive',
      });

      await expect(service.validateUser('testuser', 'password123')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('rejects invalid passwords', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.validateUser('testuser', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('login and refresh', () => {
    it('issues a refresh session and signs the permission version into access tokens', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ id: 'user-1' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      refreshSessions.issue.mockResolvedValue({
        token: 'refresh-token-1',
        expiresAt: refreshExpiresAt,
      });
      jwtService.sign.mockReturnValue('access-token-1');

      const result = await service.login(
        { username: 'testuser', password: 'password123' },
        { deviceId: 'browser-1' },
      );

      expect(refreshSessions.issue).toHaveBeenCalledWith('user-1', {
        deviceId: 'browser-1',
      });
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-1',
          permissionVersion: 3,
          jti: expect.any(String),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          accessToken: 'access-token-1',
          refreshToken: 'refresh-token-1',
          refreshExpiresAt,
          defaultRoute: '/dashboard',
        }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it('enforces the configured failed-login threshold without exposing credentials', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const policyRedis = {
        blacklistToken: jest.fn(),
        getSecurityCounter: jest.fn().mockResolvedValue(2),
        incrementSecurityCounter: jest.fn().mockResolvedValue(3),
        clearSecurityCounter: jest.fn(),
      };
      const systemConfig = {
        getSettings: jest.fn().mockResolvedValue({
          security: { sessionHours: 12, loginMaxAttempts: 3 },
        }),
      };
      const policyService = new AuthService(
        prisma as unknown as PrismaService,
        jwtService as unknown as JwtService,
        policyRedis as unknown as RedisService,
        refreshSessions as unknown as RefreshSessionService,
        systemConfig as unknown as SystemConfigService,
        permissionResolver as unknown as PermissionResolutionService,
      );

      const attempt = policyService.login(
        { username: 'testuser', password: 'wrong-password' },
        { ipAddress: '127.0.0.1' },
      );

      await expect(attempt).rejects.toMatchObject({ status: 429 });
      expect(policyRedis.incrementSecurityCounter).toHaveBeenCalledWith(
        expect.stringMatching(/^login:[a-f0-9]{64}$/),
        900,
      );
      expect(refreshSessions.issue).not.toHaveBeenCalled();
    });

    it('rotates the refresh token and reloads the current active roles', async () => {
      refreshSessions.rotate.mockResolvedValue({
        userId: 'user-1',
        token: 'refresh-token-2',
        expiresAt: refreshExpiresAt,
      });
      prisma.user.findFirst.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue('access-token-2');

      const result = await service.refresh('refresh-token-1', {
        ipAddress: '127.0.0.1',
      });

      expect(refreshSessions.rotate).toHaveBeenCalledWith('refresh-token-1', {
        ipAddress: '127.0.0.1',
      });
      expect(result.accessToken).toBe('access-token-2');
      expect(result.refreshToken).toBe('refresh-token-2');
      expect(result.user.roles).toEqual(['PROJECT_MANAGER']);
    });

    it('revokes the rotated child session when the user was disabled', async () => {
      refreshSessions.rotate.mockResolvedValue({
        userId: 'user-disabled',
        token: 'refresh-token-child',
        expiresAt: refreshExpiresAt,
      });
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.refresh('refresh-token-parent')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(refreshSessions.revoke).toHaveBeenCalledWith('refresh-token-child');
      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });

  describe('Feishu OAuth login', () => {
    function createFeishuService() {
      const integration = {
        getFeishuOAuthSettings: jest.fn().mockResolvedValue({
          integrationConfigId: 'integration-1',
          appId: 'cli_app_id',
          redirectUri: 'https://test.example.com/api/v1/auth/feishu/callback',
        }),
        exchangeFeishuOAuthCode: jest.fn().mockResolvedValue({
          openId: 'ou_user_1',
          unionId: 'on_user_1',
          tenantUserId: 'tenant-user-1',
        }),
      };
      return {
        integration,
        service: new AuthService(
          prisma as unknown as PrismaService,
          jwtService as unknown as JwtService,
          redisService as unknown as RedisService,
          refreshSessions as unknown as RefreshSessionService,
          undefined,
          permissionResolver as unknown as PermissionResolutionService,
          integration as unknown as IntegrationService,
        ),
      };
    }

    it('stores only a hashed one-time state and rejects external redirect paths', async () => {
      const { service: feishuService } = createFeishuService();

      const result = await feishuService.beginFeishuLogin('//evil.example.com');

      const authorizationUrl = new URL(result.authorizationUrl);
      const state = authorizationUrl.searchParams.get('state');
      expect(authorizationUrl.origin).toBe('https://accounts.feishu.cn');
      expect(authorizationUrl.searchParams.get('app_id')).toBe('cli_app_id');
      expect(state).toHaveLength(43);
      expect(redisService.storeOneTimeJson).toHaveBeenCalledWith(
        'feishu-state',
        expect.stringMatching(/^[a-f0-9]{64}$/),
        expect.objectContaining({ redirectPath: '/dashboard' }),
        300,
      );
      expect(redisService.storeOneTimeJson.mock.calls[0][1]).not.toBe(state);
    });

    it('matches a unique active synced identity and returns a one-minute login ticket', async () => {
      const { service: feishuService, integration } = createFeishuService();
      redisService.consumeOneTimeJson.mockResolvedValue({
        integrationConfigId: 'integration-1',
        redirectPath: '/project',
        redirectUri: 'https://test.example.com/api/v1/auth/feishu/callback',
      });
      prisma.externalIdentity.findMany.mockResolvedValue([
        {
          id: 'identity-1',
          userId: 'user-1',
          user: { status: 'Active', deletedAt: null },
        },
      ]);

      const callback = await feishuService.handleFeishuCallback({
        state: 'opaque-state',
        code: 'one-time-code',
      });

      expect(integration.exchangeFeishuOAuthCode).toHaveBeenCalledWith(
        'integration-1',
        'one-time-code',
      );
      expect(prisma.externalIdentity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ provider: 'FEISHU', isActive: true }),
        }),
      );
      expect(new URL(callback).pathname).toBe('/login/feishu/callback');
      expect(redisService.storeOneTimeJson).toHaveBeenCalledWith(
        'feishu-ticket',
        expect.stringMatching(/^[a-f0-9]{64}$/),
        { userId: 'user-1', redirectPath: '/project' },
        60,
      );
    });

    it('consumes the one-time ticket and issues the normal refresh-cookie session', async () => {
      const { service: feishuService } = createFeishuService();
      redisService.consumeOneTimeJson.mockResolvedValue({
        userId: 'user-1',
        redirectPath: '/dashboard',
      });
      prisma.user.findFirst.mockResolvedValue(mockUser);
      refreshSessions.issue.mockResolvedValue({
        token: 'refresh-token-feishu',
        expiresAt: refreshExpiresAt,
      });
      jwtService.sign.mockReturnValue('access-token-feishu');

      const result = await feishuService.completeFeishuLogin('one-time-ticket');

      expect(result).toEqual(
        expect.objectContaining({
          accessToken: 'access-token-feishu',
          refreshToken: 'refresh-token-feishu',
          defaultRoute: '/dashboard',
        }),
      );
      expect(redisService.consumeOneTimeJson).toHaveBeenCalledWith(
        'feishu-ticket',
        expect.stringMatching(/^[a-f0-9]{64}$/),
      );
      expect(refreshSessions.issue).toHaveBeenCalledWith('user-1', {});
    });

    it('rejects a replayed or expired state before calling Feishu', async () => {
      const { service: feishuService, integration } = createFeishuService();
      redisService.consumeOneTimeJson.mockResolvedValue(null);

      await expect(
        feishuService.handleFeishuCallback({ state: 'used-state', code: 'code' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(integration.exchangeFeishuOAuthCode).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('blacklists the access token and revokes the current refresh token', async () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 120;
      jwtService.decode.mockReturnValue({ jti: 'token-id', exp: expiresAt });

      const result = await service.logout('access-token', 'refresh-token');

      expect(redisService.blacklistToken).toHaveBeenCalledWith('token-id', expect.any(Number));
      expect(refreshSessions.revoke).toHaveBeenCalledWith('refresh-token');
      expect(result).toEqual({ message: '登出成功' });
    });

    it('revokes every refresh session during logout-all', async () => {
      jwtService.decode.mockReturnValue(null);

      await service.logoutAll('user-1', 'access-token');

      expect(refreshSessions.revokeAll).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getProfile', () => {
    it('loads an active user and filters out inactive roles in the query', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.getProfile('user-1');

      expect(result.permissionVersion).toBe(3);
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1', deletedAt: null, status: 'Active' },
          select: expect.objectContaining({
            userRoles: expect.objectContaining({
              where: { role: { status: 'Active' } },
            }),
          }),
        }),
      );
    });

    it('throws when the active user cannot be found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.getProfile('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
