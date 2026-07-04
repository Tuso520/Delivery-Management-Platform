import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../database/redis.service';

export interface JwtPayload {
  sub: string;
  username: string;
  realName: string;
  email: string | null;
  roles: string[];
  permissions: string[];
  jti?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
  ) {
    const jwtSecret = configService.get<string>('auth.jwtSecret');

    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured. Check your .env file.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload.sub) {
      throw new UnauthorizedException('无效的Token');
    }

    // Check token blacklist (logout revocation)
    if (payload.jti) {
      const blacklisted = await this.redisService.isBlacklisted(payload.jti);
      if (blacklisted) {
        throw new UnauthorizedException('Token已失效，请重新登录');
      }
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        deletedAt: null,
        status: 'Active',
      },
      select: {
        id: true,
        username: true,
        realName: true,
        email: true,
        userRoles: {
          select: {
            role: {
              select: {
                roleCode: true,
                rolePermissions: {
                  select: {
                    permission: {
                      select: { permissionCode: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException('用户不存在或已停用');
    }

    return {
      sub: user.id,
      username: user.username,
      realName: user.realName,
      email: user.email,
      roles: user.userRoles.map(({ role }) => role.roleCode),
      permissions: [
        ...new Set(
          user.userRoles.flatMap(({ role }) =>
            role.rolePermissions.map(
              ({ permission }) => permission.permissionCode,
            ),
          ),
        ),
      ],
    };
  }
}
