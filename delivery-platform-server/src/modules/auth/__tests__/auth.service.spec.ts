import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import type { PrismaService } from '../../../database/prisma.service';
import type { RedisService } from '../../../database/redis.service';
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
  };
  let jwtService: { sign: jest.Mock; decode: jest.Mock };
  let redisService: { blacklistToken: jest.Mock };
  let refreshSessions: {
    issue: jest.Mock;
    rotate: jest.Mock;
    revoke: jest.Mock;
    revokeAll: jest.Mock;
  };

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
    };
    jwtService = {
      sign: jest.fn(),
      decode: jest.fn(),
    };
    redisService = {
      blacklistToken: jest.fn(),
    };
    refreshSessions = {
      issue: jest.fn(),
      rotate: jest.fn(),
      revoke: jest.fn(),
      revokeAll: jest.fn(),
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      redisService as unknown as RedisService,
      refreshSessions as unknown as RefreshSessionService,
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
