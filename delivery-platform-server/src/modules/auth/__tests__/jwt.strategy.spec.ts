import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../../../database/prisma.service';
import type { RedisService } from '../../../database/redis.service';
import { JwtStrategy, type JwtPayload } from '../strategies/jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { user: { findFirst: jest.Mock } };
  let redis: { isBlacklisted: jest.Mock };

  const payload: JwtPayload = {
    sub: 'user-1',
    username: 'stale-name',
    realName: '旧名称',
    email: 'old@example.com',
    roles: ['STALE_ROLE'],
    permissions: ['stale:permission'],
    permissionVersion: 5,
    jti: 'access-token-id',
  };
  const currentUser = {
    id: 'user-1',
    username: 'current-user',
    realName: '当前用户',
    email: 'current@example.com',
    permissionVersion: 5,
    userRoles: [
      {
        role: {
          roleCode: 'PROJECT_MANAGER',
          rolePermissions: [{ permission: { permissionCode: 'project:view' } }],
        },
      },
    ],
  };

  beforeEach(() => {
    prisma = { user: { findFirst: jest.fn() } };
    redis = { isBlacklisted: jest.fn().mockResolvedValue(false) };
    const config = {
      get: jest.fn().mockReturnValue('unit-test-secret'),
    };
    strategy = new JwtStrategy(
      config as unknown as ConfigService,
      redis as unknown as RedisService,
      prisma as unknown as PrismaService,
    );
  });

  it('reloads current permissions through the active-role filter', async () => {
    prisma.user.findFirst.mockResolvedValue(currentUser);

    const result = await strategy.validate(payload);

    expect(result).toEqual({
      sub: 'user-1',
      username: 'current-user',
      realName: '当前用户',
      email: 'current@example.com',
      roles: ['PROJECT_MANAGER'],
      permissions: ['project:view'],
      permissionVersion: 5,
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'user-1',
          deletedAt: null,
          status: 'Active',
        },
        select: expect.objectContaining({
          userRoles: expect.objectContaining({
            where: { role: { status: 'Active' } },
          }),
        }),
      }),
    );
  });

  it('rejects access tokens after the user permission version changes', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...currentUser,
      permissionVersion: 6,
    });

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects legacy access tokens without a permission version', async () => {
    prisma.user.findFirst.mockResolvedValue(currentUser);
    const legacyPayload: Partial<JwtPayload> = { ...payload };
    delete legacyPayload.permissionVersion;

    await expect(
      strategy.validate(legacyPayload as JwtPayload),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects blacklisted tokens before loading the user', async () => {
    redis.isBlacklisted.mockResolvedValue(true);

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('rejects deleted, inactive, or missing users', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });
});
