import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../../database/prisma.service';
import { OperationLogService } from '../../operation-log/operation-log.service';
import { AssignRolesDto } from '../dto/assign-roles.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { UserService } from '../user.service';
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));
describe('UserService', () => {
  let service: UserService;
  let prisma: {
    user: Record<string, jest.Mock>;
    userRole: Record<string, jest.Mock>;
    role: Record<string, jest.Mock>;
    refreshSession: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  const operationLog = {
    log: jest.fn().mockResolvedValue(undefined),
  };
  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        delete: jest.fn(),
      },
      userRole: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      role: {
        findMany: jest.fn(),
      },
      refreshSession: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof prisma) => Promise<unknown>) => callback(prisma),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: prisma },
        { provide: OperationLogService, useValue: operationLog },
      ],
    }).compile();
    service = module.get<UserService>(UserService);
    jest.clearAllMocks();
  });
  describe('findAll', () => {
    const mockUsers = [
      {
        id: 'user-1',
        username: 'admin',
        realName: '管理员',
        email: 'admin@test.com',
        phone: '13800138000',
        departmentId: null,
        status: 'Active' as const,
        lastLoginAt: new Date('2026-06-22'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-06-22'),
        userRoles: [
          {
            role: { id: 'role-1', roleCode: 'SUPER_ADMIN', roleName: '超级管理员' },
          },
        ],
      },
      {
        id: 'user-2',
        username: 'zhangsan',
        realName: '张三',
        email: 'zhangsan@test.com',
        phone: '13800138001',
        departmentId: 'dept-1',
        status: 'Active' as const,
        lastLoginAt: null,
        createdAt: new Date('2026-02-01'),
        updatedAt: new Date('2026-06-22'),
        userRoles: [],
      },
    ];
    it('should return paginated results', async () => {
      prisma.user.count.mockResolvedValue(2);
      prisma.user.findMany.mockResolvedValue(mockUsers);
      const result = await service.findAll({ page: 1, pageSize: 20 });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result).not.toHaveProperty('list');
      expect(result).not.toHaveProperty('pagination');
      expect(result).not.toHaveProperty('totalPages');
      expect(result.items[0].roles).toEqual([
        { id: 'role-1', roleCode: 'SUPER_ADMIN', roleName: '超级管理员' },
      ]);
    });
    it('should filter by keyword in username, realName, and email', async () => {
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([mockUsers[0]]);
      await service.findAll({ keyword: 'admin' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            OR: [
              { username: { contains: 'admin' } },
              { realName: { contains: 'admin' } },
              { email: { contains: 'admin' } },
            ],
          },
        }),
      );
    });
    it('should filter by status', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([]);
      await service.findAll({ status: 'Active' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'Active',
          }),
        }),
      );
    });
    it('should filter by departmentId', async () => {
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([mockUsers[1]]);
      await service.findAll({ departmentId: 'dept-1' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            departmentId: 'dept-1',
          }),
        }),
      );
    });
    it('should return empty list when no users match', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([]);
      const result = await service.findAll({ keyword: 'nonexistent' });
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
    it('should apply pagination correctly', async () => {
      prisma.user.count.mockResolvedValue(25);
      prisma.user.findMany.mockResolvedValue([]);
      await service.findAll({ page: 2, pageSize: 10 });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });
  });
  describe('findById', () => {
    it('should return user with roles when found', async () => {
      const mockUser = {
        id: 'user-1',
        username: 'admin',
        realName: '管理员',
        email: 'admin@test.com',
        phone: '13800138000',
        departmentId: null,
        status: 'Active',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [
          {
            role: {
              id: 'role-1',
              roleCode: 'SUPER_ADMIN',
              roleName: '超级管理员',
              permissions: [
                {
                  permission: {
                    id: 'perm-1',
                    permissionCode: 'user:view',
                    permissionName: '查看用户',
                    resource: 'user',
                    action: 'view',
                  },
                },
              ],
            },
          },
        ],
      };
      prisma.user.findFirst.mockResolvedValue(mockUser);
      const result = await service.findById('user-1');
      expect(result.id).toBe('user-1');
      expect(result.roles).toHaveLength(1);
      expect(result.roles[0].roleCode).toBe('SUPER_ADMIN');
    });
    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
    it('should not return soft-deleted users', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.findById('deleted-user')).rejects.toThrow(NotFoundException);
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'deleted-user', deletedAt: null },
        }),
      );
    });
  });
  describe('create', () => {
    const createDto: CreateUserDto = {
      username: 'newuser',
      password: 'password123',
      realName: '新用户',
      email: 'new@test.com',
      phone: '13900139000',
    };
    it('should hash password and create user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashed123');
      prisma.user.create.mockResolvedValue({
        id: 'user-new',
        username: 'newuser',
        realName: '新用户',
        email: 'new@test.com',
        phone: '13900139000',
        departmentId: null,
        status: 'Active',
        createdAt: new Date(),
      });
      const result = await service.create(createDto);
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            username: 'newuser',
            password: '$2b$10$hashed123',
          }),
        }),
      );
      expect(result.username).toBe('newuser');
    });
    it('should throw ConflictException on duplicate username', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing', username: 'newuser' });
      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });
    it('should create user without optional fields', async () => {
      const minimalDto: CreateUserDto = {
        username: 'minimal',
        password: 'password123',
        realName: '最小用户',
      };
      prisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashed456');
      prisma.user.create.mockResolvedValue({
        id: 'user-min',
        username: 'minimal',
        realName: '最小用户',
        email: null,
        phone: null,
        departmentId: null,
        status: 'Active',
        createdAt: new Date(),
      });
      const result = await service.create(minimalDto);
      expect(result.username).toBe('minimal');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            username: 'minimal',
            realName: '最小用户',
          }),
        }),
      );
    });
  });
  describe('softDelete', () => {
    it('should soft-delete the user and revoke active sessions atomically', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', deletedAt: null });
      prisma.user.update.mockResolvedValue({ id: 'user-1', deletedAt: new Date() });
      await service.softDelete('user-1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: {
            deletedAt: expect.any(Date),
            permissionVersion: { increment: 1 },
          },
        }),
      );
      expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: {
          revokedAt: expect.any(Date),
          revokeReason: 'USER_DELETED',
        },
      });
    });
    it('should throw NotFoundException for non-existent user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.softDelete('nonexistent')).rejects.toThrow(NotFoundException);
    });
    it('should return void on success', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', deletedAt: null });
      prisma.user.update.mockResolvedValue({ id: 'user-1', deletedAt: new Date() });
      const result = await service.softDelete('user-1');
      expect(result).toBeUndefined();
    });
  });
  describe('assignRoles', () => {
    const assignDto: AssignRolesDto = {
      roleIds: ['role-1', 'role-2'],
    };
    it('should replace roles in transaction', async () => {
      prisma.role.findMany.mockResolvedValue([
        { id: 'role-1', defaultDataScope: 'OWNED' },
        { id: 'role-2', defaultDataScope: 'PARTICIPATED' },
      ]);
      prisma.user.findFirst
        .mockResolvedValueOnce({
          id: 'user-1',
          userRoles: [{ roleId: 'role-old' }],
        })
        .mockResolvedValueOnce({
          id: 'user-1',
          username: 'admin',
          realName: '管理员',
          email: 'admin@test.com',
          phone: '13800138000',
          departmentId: null,
          status: 'Active',
          lastLoginAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          userRoles: [
            {
              role: {
                id: 'role-1',
                roleCode: 'PROJECT_MANAGER',
                roleName: '项目经理',
                permissions: [],
              },
            },
          ],
        });
      const result = await service.assignRoles('user-1', assignDto, 'admin-1');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(prisma.userRole.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'user-1', roleId: 'role-1', dataScope: 'OWNED' },
          {
            userId: 'user-1',
            roleId: 'role-2',
            dataScope: 'PARTICIPATED',
          },
        ],
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { permissionVersion: { increment: 1 } },
      });
      expect(operationLog.log).toHaveBeenCalledWith(
        {
          userId: 'admin-1',
          module: 'permission',
          action: 'assign_user_roles',
          targetType: 'user',
          targetId: 'user-1',
          beforeData: { roleIds: ['role-old'] },
          afterData: { roleIds: ['role-1', 'role-2'] },
        },
        prisma,
      );
      expect(result.id).toBe('user-1');
    });
    it('should throw NotFoundException when user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.assignRoles('nonexistent', assignDto, 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });
    it('should handle empty roleIds by removing all roles', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', deletedAt: null });
      prisma.role.findMany.mockResolvedValue([]);
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        username: 'admin',
        realName: '管理员',
        email: 'admin@test.com',
        phone: '13800138000',
        departmentId: null,
        status: 'Active',
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userRoles: [],
      });
      const result = await service.assignRoles('user-1', { roleIds: [] }, 'admin-1');
      expect(prisma.userRole.deleteMany).toHaveBeenCalled();
      expect(prisma.userRole.createMany).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { permissionVersion: { increment: 1 } },
      });
      expect(result.id).toBe('user-1');
    });

    it('should reject missing or inactive roles before replacing assignments', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', deletedAt: null });
      prisma.role.findMany.mockResolvedValue([{ id: 'role-1', defaultDataScope: 'OWNED' }]);

      await expect(service.assignRoles('user-1', assignDto, 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.userRole.deleteMany).not.toHaveBeenCalled();
    });
  });
  describe('disable', () => {
    it('should set user status to Inactive', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        deletedAt: null,
        status: 'Active',
      });
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        username: 'admin',
        realName: '管理员',
        status: 'Inactive',
      });
      const result = await service.disable('user-1');
      expect(result.status).toBe('Inactive');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'Inactive',
            permissionVersion: { increment: 1 },
          }),
        }),
      );
      expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: {
          revokedAt: expect.any(Date),
          revokeReason: 'USER_DISABLED',
        },
      });
    });
    it('should throw NotFoundException for non-existent user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.disable('nonexistent')).rejects.toThrow(NotFoundException);
    });
    it('should throw BadRequestException if already disabled', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        deletedAt: null,
        status: 'Inactive',
      });
      await expect(service.disable('user-1')).rejects.toThrow(BadRequestException);
    });
  });
  describe('enable', () => {
    it('should set user status to Active', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        deletedAt: null,
        status: 'Inactive',
      });
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        username: 'admin',
        realName: '管理员',
        status: 'Active',
      });
      const result = await service.enable('user-1');
      expect(result.status).toBe('Active');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: 'Active',
            permissionVersion: { increment: 1 },
          },
        }),
      );
    });
    it('should throw BadRequestException if already active', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        deletedAt: null,
        status: 'Active',
      });
      await expect(service.enable('user-1')).rejects.toThrow(BadRequestException);
    });
  });
  describe('resetPassword', () => {
    it('should hash new password and update user', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        deletedAt: null,
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhashed');
      prisma.user.update.mockResolvedValue({ id: 'user-1' });
      const result = await service.resetPassword('user-1', {
        newPassword: 'newpass123',
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('newpass123', 10);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: {
            password: '$2b$10$newhashed',
            permissionVersion: { increment: 1 },
          },
        }),
      );
      expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: {
          revokedAt: expect.any(Date),
          revokeReason: 'PASSWORD_RESET',
        },
      });
      expect(result).toEqual({ message: '密码重置成功' });
    });
    it('should throw NotFoundException for non-existent user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.resetPassword('nonexistent', { newPassword: 'newpass123' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
