import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';

import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

interface UserWithRoles {
  userRoles: Array<{
    role: {
      roleCode: string;
      rolePermissions: Array<{ permission: { permissionCode: string } }>;
    };
  }>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * 提取用户角色和权限（去掉重复逻辑）
   */
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

  async validateUser(
    username: string,
    password: string,
  ): Promise<Omit<JwtPayload, 'iat' | 'exp' | 'jti'>> {
    const user = await this.prisma.user.findFirst({
      where: { username, deletedAt: null },
      select: {
        id: true,
        username: true,
        password: true,
        realName: true,
        email: true,
        status: true,
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
      throw new UnauthorizedException('用户名或密码错误');
    }

    if (user.status === 'Inactive' || user.status === 'Locked') {
      throw new UnauthorizedException('账户已被禁用或锁定');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
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
    };
  }

  async login(
    loginDto: LoginDto,
  ): Promise<{ accessToken: string; user: Omit<JwtPayload, 'iat' | 'exp' | 'jti'> }> {
    const payload = await this.validateUser(loginDto.username, loginDto.password);
    const jti = uuidv4();
    const accessToken = this.jwtService.sign({ ...payload, jti });
    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      user: payload,
    };
  }

  async logout(token: string): Promise<{ message: string }> {
    if (!token) {
      return { message: '登出成功' };
    }

    try {
      // Decode the token without verifying signature to extract jti and exp
      const decoded = this.jwtService.decode(token) as { jti?: string; exp?: number } | null;

      if (decoded?.jti && decoded?.exp) {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const ttl = decoded.exp - nowSeconds;
        if (ttl > 0) {
          await this.redisService.blacklistToken(decoded.jti, ttl);
        }
      }
    } catch {
      // Token decode failed — still report success to the client
    }

    return { message: '登出成功' };
  }

  async getProfile(userId: string): Promise<Omit<JwtPayload, 'iat' | 'exp' | 'jti'>> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
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
    };
  }
}
