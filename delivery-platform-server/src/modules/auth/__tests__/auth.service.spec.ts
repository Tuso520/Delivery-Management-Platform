import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../database/redis.service';
import { AuthService } from '../auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let jwtService: Record<string, jest.Mock>;
  let redisService: Record<string, jest.Mock>;

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    password: '$2b$10$hashedpassword',
    realName: '测试用户',
    email: 'test@example.com',
    status: 'Active',
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

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    jwtService = {
      sign: jest.fn(),
      decode: jest.fn(),
    };

    redisService = {
      blacklistToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('should return user payload when credentials are valid', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('testuser', 'password123');

      expect(result.sub).toBe('user-1');
      expect(result.username).toBe('testuser');
      expect(result.roles).toEqual(['PROJECT_MANAGER']);
      expect(result.permissions).toEqual(['project:view', 'project:create']);
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { username: 'testuser', deletedAt: null },
        }),
      );
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.validateUser('nonexistent', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.validateUser('testuser', 'wrongpassword'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when account is Inactive', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        status: 'Inactive',
      });

      await expect(
        service.validateUser('testuser', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when account is Locked', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        status: 'Locked',
      });

      await expect(
        service.validateUser('testuser', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should deduplicate permissions from multiple roles', async () => {
      const userWithDuplicatePerms = {
        ...mockUser,
        userRoles: [
          {
            role: {
              roleCode: 'PROJECT_MANAGER',
              rolePermissions: [
                { permission: { permissionCode: 'project:view' } },
              ],
            },
          },
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
      };

      prisma.user.findFirst.mockResolvedValue(userWithDuplicatePerms);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('testuser', 'password123');
      expect(result.permissions).toEqual(['project:view', 'user:view']);
    });
  });

  describe('login', () => {
    it('should return access token and user payload for valid credentials', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue('jwt-token-123');

      const result = await service.login({
        username: 'testuser',
        password: 'password123',
      });

      expect(result.accessToken).toBe('jwt-token-123');
      expect(result.user.sub).toBe('user-1');
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-1', username: 'testuser' }),
      );
    });

    it('should throw UnauthorizedException when credentials are invalid', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ username: 'baduser', password: 'badpass' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should return success message', async () => {
      const result = await service.logout('user-1');
      expect(result).toEqual({ message: '登出成功' });
    });

    it('should blacklist a valid token until it expires', async () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 120;
      jwtService.decode.mockReturnValue({ jti: 'token-id', exp: expiresAt });

      await service.logout('jwt-token');

      expect(redisService.blacklistToken).toHaveBeenCalledWith(
        'token-id',
        expect.any(Number),
      );
    });
  });

  describe('getProfile', () => {
    it('should return user profile with roles and permissions', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.getProfile('user-1');

      expect(result.sub).toBe('user-1');
      expect(result.username).toBe('testuser');
      expect(result.roles).toEqual(['PROJECT_MANAGER']);
      expect(result.permissions).toEqual(['project:view', 'project:create']);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty arrays when user has no roles', async () => {
      const userNoRoles = { ...mockUser, userRoles: [] };
      prisma.user.findFirst.mockResolvedValue(userNoRoles);

      const result = await service.getProfile('user-1');

      expect(result.roles).toEqual([]);
      expect(result.permissions).toEqual([]);
    });
  });
});
