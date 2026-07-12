import { createHash, randomBytes } from 'node:crypto';

import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '../../database/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';

export interface RefreshSessionContext {
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export interface RotatedRefreshToken extends IssuedRefreshToken {
  userId: string;
}

class SessionRotationConflict extends Error {}

@Injectable()
export class RefreshSessionService {
  private readonly expiresInDays: number;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
    @Optional() private readonly systemConfig?: SystemConfigService,
  ) {
    const configuredDays = configService.get<number>('auth.refreshTokenExpiresDays');
    this.expiresInDays = configuredDays ?? 7;
    if (!Number.isInteger(this.expiresInDays) || this.expiresInDays < 1) {
      throw new Error('REFRESH_TOKEN_EXPIRES_DAYS must be a positive integer.');
    }
  }

  async issue(
    userId: string,
    context: RefreshSessionContext,
    familyId = uuidv4(),
  ): Promise<IssuedRefreshToken> {
    const token = this.generateToken();
    const expiresAt = await this.resolveExpiry();

    await this.prisma.refreshSession.create({
      data: {
        userId,
        tokenHash: this.hashToken(token),
        familyId,
        expiresAt,
        ...this.sanitizeContext(context),
      },
    });

    return { token, expiresAt };
  }

  async rotate(token: string, context: RefreshSessionContext): Promise<RotatedRefreshToken> {
    if (!token) {
      throw new UnauthorizedException('刷新会话不存在');
    }

    const current = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: this.hashToken(token) },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        revokeReason: true,
        user: { select: { status: true, deletedAt: true } },
      },
    });

    if (!current) {
      throw new UnauthorizedException('刷新会话无效');
    }

    if (current.revokedAt) {
      if (current.revokeReason === 'ROTATED') {
        await this.revokeFamily(current.familyId, 'REUSE_DETECTED');
      }
      throw new UnauthorizedException('刷新会话已失效');
    }

    const now = new Date();
    if (current.expiresAt <= now) {
      await this.prisma.refreshSession.update({
        where: { id: current.id },
        data: { revokedAt: now, revokeReason: 'EXPIRED' },
      });
      throw new UnauthorizedException('刷新会话已过期');
    }

    if (current.user.deletedAt || current.user.status !== 'Active') {
      await this.revokeFamily(current.familyId, 'USER_DISABLED');
      throw new UnauthorizedException('用户不存在或已停用');
    }

    const nextToken = this.generateToken();
    const nextSessionId = uuidv4();
    const expiresAt = await this.resolveExpiry();

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const claimed = await tx.refreshSession.updateMany({
            where: {
              id: current.id,
              revokedAt: null,
              expiresAt: { gt: now },
            },
            data: {
              revokedAt: now,
              revokeReason: 'ROTATED',
              lastUsedAt: now,
            },
          });

          if (claimed.count !== 1) {
            throw new SessionRotationConflict();
          }

          await tx.refreshSession.create({
            data: {
              id: nextSessionId,
              userId: current.userId,
              tokenHash: this.hashToken(nextToken),
              familyId: current.familyId,
              expiresAt,
              ...this.sanitizeContext(context),
            },
          });

          await tx.refreshSession.update({
            where: { id: current.id },
            data: { replacedById: nextSessionId },
          });
        },
        {
          maxWait: 10_000,
          timeout: 30_000,
        },
      );
    } catch (error) {
      if (error instanceof SessionRotationConflict) {
        await this.revokeFamily(current.familyId, 'REUSE_DETECTED');
        throw new UnauthorizedException('刷新会话已被使用');
      }
      throw error;
    }

    return {
      userId: current.userId,
      token: nextToken,
      expiresAt,
    };
  }

  async revoke(token: string, reason = 'LOGOUT'): Promise<void> {
    if (!token) return;
    await this.prisma.refreshSession.updateMany({
      where: {
        tokenHash: this.hashToken(token),
        revokedAt: null,
      },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  async revokeAll(userId: string, reason = 'LOGOUT_ALL'): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  private async resolveExpiry(): Promise<Date> {
    const configuredHours = this.systemConfig
      ? (await this.systemConfig.getSettings()).security.sessionHours
      : this.expiresInDays * 24;
    return new Date(Date.now() + configuredHours * 60 * 60 * 1000);
  }

  private generateToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private sanitizeContext(context: RefreshSessionContext): RefreshSessionContext {
    return {
      deviceId: context.deviceId?.trim().slice(0, 100) || undefined,
      ipAddress: context.ipAddress?.trim().slice(0, 50) || undefined,
      userAgent: context.userAgent?.trim().slice(0, 500) || undefined,
    };
  }
}
