import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../../../database/prisma.service';
import type { SystemConfigService } from '../../system-config/system-config.service';
import { RefreshSessionService } from '../refresh-session.service';

describe('RefreshSessionService', () => {
  let transaction: {
    refreshSession: {
      updateMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let prisma: {
    refreshSession: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let service: RefreshSessionService;

  const createService = (expiresInDays = 7): RefreshSessionService => {
    const config = {
      get: jest.fn().mockReturnValue(expiresInDays),
    };
    return new RefreshSessionService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
  };

  beforeEach(() => {
    transaction = {
      refreshSession: {
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    prisma = {
      refreshSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    };
    service = createService();
  });

  it('stores only a SHA-256 token hash and sanitized device metadata', async () => {
    const result = await service.issue('user-1', {
      deviceId: `  ${'d'.repeat(120)}  `,
      ipAddress: ' 127.0.0.1 ',
      userAgent: ' Test Browser ',
    });

    expect(result.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(prisma.refreshSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        familyId: expect.any(String),
        deviceId: 'd'.repeat(100),
        ipAddress: '127.0.0.1',
        userAgent: 'Test Browser',
      }),
    });
    const createCall = prisma.refreshSession.create.mock.calls[0][0] as {
      data: { tokenHash: string };
    };
    expect(createCall.data.tokenHash).not.toBe(result.token);
  });

  it('uses the configured session lifetime for newly issued refresh sessions', async () => {
    const config = { get: jest.fn().mockReturnValue(7) };
    const systemConfig = {
      getSettings: jest.fn().mockResolvedValue({
        security: { sessionHours: 2, loginMaxAttempts: 5 },
      }),
    };
    const configuredService = new RefreshSessionService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      systemConfig as unknown as SystemConfigService,
    );
    const before = Date.now();

    const result = await configuredService.issue('user-1', {});

    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 2 * 60 * 60 * 1000);
    expect(result.expiresAt.getTime()).toBeLessThan(before + 2 * 60 * 60 * 1000 + 5_000);
  });

  it('rotates an active token exactly once inside a transaction', async () => {
    prisma.refreshSession.findUnique.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      familyId: 'family-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      revokeReason: null,
      user: { status: 'Active', deletedAt: null },
    });
    transaction.refreshSession.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.rotate('old-refresh-token', {
      deviceId: 'browser-2',
    });

    expect(result.userId).toBe('user-1');
    expect(result.token).not.toBe('old-refresh-token');
    expect(transaction.refreshSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'session-1',
          revokedAt: null,
        }),
        data: expect.objectContaining({ revokeReason: 'ROTATED' }),
      }),
    );
    expect(transaction.refreshSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        familyId: 'family-1',
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        deviceId: 'browser-2',
      }),
    });
    expect(transaction.refreshSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { replacedById: expect.any(String) },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 30_000,
    });
  });

  it('revokes the active family when a rotated token is reused', async () => {
    prisma.refreshSession.findUnique.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      familyId: 'family-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      revokeReason: 'ROTATED',
      user: { status: 'Active', deletedAt: null },
    });

    await expect(service.rotate('reused-refresh-token', {})).rejects.toThrow(UnauthorizedException);
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', revokedAt: null },
      data: {
        revokedAt: expect.any(Date),
        revokeReason: 'REUSE_DETECTED',
      },
    });
  });

  it('treats a concurrent rotation claim failure as token reuse', async () => {
    prisma.refreshSession.findUnique.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      familyId: 'family-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      revokeReason: null,
      user: { status: 'Active', deletedAt: null },
    });
    transaction.refreshSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.rotate('concurrently-used-token', {})).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', revokedAt: null },
      data: {
        revokedAt: expect.any(Date),
        revokeReason: 'REUSE_DETECTED',
      },
    });
  });

  it('rejects invalid expiry configuration at startup', () => {
    expect(() => createService(0)).toThrow(
      'REFRESH_TOKEN_EXPIRES_DAYS must be a positive integer.',
    );
  });
});
