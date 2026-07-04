import {
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { CreateProjectDto } from '../dto/create-project.dto';
import { ProjectStatusQuery } from '../dto/query-project.dto';
import { ProjectAccessService } from '../project-access.service';
import { ProjectService } from '../project.service';


describe('ProjectService', () => {
  let service: ProjectService;
  let prisma: {
    user: Record<string, jest.Mock>;
    project: Record<string, jest.Mock>;
    projectMember: Record<string, jest.Mock>;
    exchangeRate: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };

  const mockProject = {
    id: 'project-1',
    projectCode: 'VN-AC-2026-001',
    projectName: '测试项目',
    countryCode: 'VN',
    city: '河内',
    customerName: '测试客户',
    projectType: 'Network',
    contractCurrency: 'USD',
    baseCurrency: 'CNY',
    contractAmount: new Prisma.Decimal(100000),
    projectLanguage: 'zh-CN',
    currentStage: 'Initiation',
    projectStatus: 'Draft',
    riskLevel: 'Low',
    startDate: new Date('2026-07-01'),
    plannedEndDate: new Date('2026-12-31'),
    actualEndDate: null,
    createdBy: null,
    createdAt: new Date('2026-06-22'),
    updatedAt: new Date('2026-06-22'),
    deletedAt: null,
    members: [
      {
        id: 'member-1',
        userId: 'user-1',
        projectRole: 'ProjectManager',
        user: {
          id: 'user-1',
          realName: '管理员',
          username: 'admin',
        },
      },
    ],
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      project: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      projectMember: {
        findUnique: jest.fn(),
      },
      exchangeRate: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        ProjectAccessService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ProjectService>(ProjectService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated projects', async () => {
      prisma.project.count.mockResolvedValue(1);
      prisma.project.findMany.mockResolvedValue([mockProject]);

      const result = await service.findAll({ page: 1, pageSize: 20 });

      expect(result.list).toHaveLength(1);
      expect(result.list[0].projectCode).toBe('VN-AC-2026-001');
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
    });

    it('should filter by keyword in projectName and projectCode', async () => {
      prisma.project.count.mockResolvedValue(1);
      prisma.project.findMany.mockResolvedValue([mockProject]);

      await service.findAll({ keyword: '测试' });

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { projectName: { contains: '测试' } },
              { projectCode: { contains: '测试' } },
            ],
          }),
        }),
      );
    });

    it('should filter by projectStatus', async () => {
      prisma.project.count.mockResolvedValue(0);
      prisma.project.findMany.mockResolvedValue([]);

      await service.findAll({ projectStatus: ProjectStatusQuery.Active });

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectStatus: 'Active',
          }),
        }),
      );
    });

    it('should filter by countryCode', async () => {
      prisma.project.count.mockResolvedValue(1);
      prisma.project.findMany.mockResolvedValue([mockProject]);

      await service.findAll({ countryCode: 'VN' });

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            countryCode: 'VN',
          }),
        }),
      );
    });

    it('should return empty list when no projects match', async () => {
      prisma.project.count.mockResolvedValue(0);
      prisma.project.findMany.mockResolvedValue([]);

      const result = await service.findAll({ keyword: 'nonexistent' });

      expect(result.list).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('create', () => {
    const createDto: CreateProjectDto = {
      projectName: '新项目',
      countryCode: 'VN',
      customerName: 'AC客户',
      projectType: 'Network',
      contractCurrency: 'USD',
      baseCurrency: 'CNY',
      contractAmount: 50000,
      currentStage: 'Initiation',
      riskLevel: 'Low',
      startDate: '2026-08-01',
      plannedEndDate: '2027-01-31',
    };

    it('should generate projectCode and create project', async () => {
      const rateDate = new Date('2026-06-24T00:00:00Z');
      prisma.project.findFirst
        .mockResolvedValueOnce(null)  // No previous project with same prefix
        .mockResolvedValueOnce(mockProject); // Duplicate for update call
      prisma.exchangeRate.findFirst.mockResolvedValue({
        rate: new Prisma.Decimal(7.2),
        rateDate,
        source: 'CentralBank',
      });
      prisma.project.create.mockResolvedValue(mockProject);

      const result = await service.create(createDto);

      expect(result.projectCode).toBeDefined();
      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectName: '新项目',
            countryCode: 'VN',
            projectStatus: 'Draft',
            exchangeRate: new Prisma.Decimal(7.2),
            convertedAmount: new Prisma.Decimal(360000),
            exchangeRateDate: rateDate,
            exchangeRateSource: 'CentralBank',
          }),
        }),
      );
    });

    it('should increment projectCode sequence', async () => {
      prisma.project.findFirst
        .mockResolvedValueOnce({
          projectCode: 'AC-VN-2026-001',
        })
        .mockResolvedValueOnce(mockProject);
      prisma.project.create.mockResolvedValue(mockProject);

      // Generate the project code
      const projectCode = await service.generateProjectCode('VN', 'AC');
      expect(projectCode).toBe('VN-AC-2026-002');
    });

    it('should generate first project code when no previous projects', async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      const projectCode = await service.generateProjectCode('VN', 'XX');
      expect(projectCode).toBe('VN-XX-2026-001');
    });

    it('should use XX for customer code when no customer name', async () => {
      prisma.project.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockProject);
      prisma.project.create.mockResolvedValue(mockProject);

      await service.create({
        projectName: '无名项目',
        countryCode: 'TH',
      });

      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectCode: expect.stringContaining('TH-XX-'),
          }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('should return project with members', async () => {
      const projectWithIncludes = {
        ...mockProject,
        members: [
          {
            id: 'member-1',
            userId: 'user-1',
            projectRole: 'ProjectManager',
            user: {
              id: 'user-1',
              username: 'admin',
              realName: '管理员',
              email: 'admin@test.com',
            },
          },
        ],
      };

      prisma.project.findFirst.mockResolvedValue(projectWithIncludes);
      // Mock checkProjectAccess (elevated role bypasses check)
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        userRoles: [
          {
            role: { roleCode: 'SUPER_ADMIN' },
          },
        ],
      });

      const result = await service.findById('project-1', 'user-1');

      expect(result.id).toBe('project-1');
      expect(result.members).toHaveLength(1);
      expect(result.members[0].projectRole).toBe('ProjectManager');
    });

    it('should throw NotFoundException when project does not exist', async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should allow access for project members', async () => {
      prisma.project.findFirst.mockResolvedValue(mockProject);
      // User is not elevated but is a project member
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        userRoles: [{ role: { roleCode: 'PROJECT_MANAGER' } }],
      });
      prisma.projectMember.findUnique.mockResolvedValue({
        projectId: 'project-1',
        userId: 'user-2',
      });

      const result = await service.findById('project-1', 'user-2');
      expect(result).toBeDefined();
    });

    it('should deny access for non-members without elevated role', async () => {
      prisma.project.findFirst.mockResolvedValue(mockProject);
      // User is not elevated and not a member
      prisma.user.findUnique.mockResolvedValue({
        id: 'outsider',
        userRoles: [{ role: { roleCode: 'PROJECT_MANAGER' } }],
      });
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.findById('project-1', 'outsider'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('softDelete', () => {
    it('should set deletedAt on existing project', async () => {
      prisma.project.findFirst.mockResolvedValue(mockProject);
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin',
        userRoles: [{ role: { roleCode: 'SUPER_ADMIN' } }],
      });
      prisma.project.update.mockResolvedValue({
        ...mockProject,
        deletedAt: new Date(),
      });

      await service.softDelete('project-1', 'admin');

      expect(prisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'project-1' },
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('should throw NotFoundException for non-existent project', async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.softDelete('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('checkProjectAccess', () => {
    const accessService = () =>
      service as unknown as {
        checkProjectAccess(projectId: string, userId: string): Promise<void>;
      };

    it('should allow access for SUPER_ADMIN', async () => {
      prisma.project.findFirst.mockResolvedValue(mockProject);
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin',
        userRoles: [{ role: { roleCode: 'SUPER_ADMIN' } }],
      });

      // The result should not throw
      await expect(
        accessService().checkProjectAccess('project-1', 'admin'),
      ).resolves.toBeUndefined();
    });

    it('should allow access for SYSTEM_ADMIN', async () => {
      prisma.project.findFirst.mockResolvedValue(mockProject);
      prisma.user.findUnique.mockResolvedValue({
        id: 'sysadmin',
        userRoles: [{ role: { roleCode: 'SYSTEM_ADMIN' } }],
      });

      await expect(
        accessService().checkProjectAccess('project-1', 'sysadmin'),
      ).resolves.toBeUndefined();
    });

    it('should allow access for DELIVERY_MANAGER', async () => {
      prisma.project.findFirst.mockResolvedValue(mockProject);
      prisma.user.findUnique.mockResolvedValue({
        id: 'dm',
        userRoles: [{ role: { roleCode: 'DELIVERY_MANAGER' } }],
      });

      await expect(
        accessService().checkProjectAccess('project-1', 'dm'),
      ).resolves.toBeUndefined();
    });

    it('should allow access when user is a project member', async () => {
      prisma.project.findFirst.mockResolvedValue(mockProject);
      prisma.user.findUnique.mockResolvedValue({
        id: 'member',
        userRoles: [{ role: { roleCode: 'PROJECT_MANAGER' } }],
      });
      prisma.projectMember.findUnique.mockResolvedValue({
        projectId: 'project-1',
        userId: 'member',
      });

      await expect(
        accessService().checkProjectAccess('project-1', 'member'),
      ).resolves.toBeUndefined();
    });

    it('should deny access when user is not a member and not elevated', async () => {
      prisma.project.findFirst.mockResolvedValue(mockProject);
      prisma.user.findUnique.mockResolvedValue({
        id: 'outsider',
        userRoles: [{ role: { roleCode: 'PROJECT_MANAGER' } }],
      });
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        accessService().checkProjectAccess('project-1', 'outsider'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should update project fields', async () => {
      prisma.project.findFirst.mockResolvedValue(mockProject);
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin',
        userRoles: [{ role: { roleCode: 'SUPER_ADMIN' } }],
      });
      prisma.project.update.mockResolvedValue({
        ...mockProject,
        projectName: '更新后的项目',
      });

      const result = await service.update(
        'project-1',
        { projectName: '更新后的项目' },
        'admin',
      );

      expect(result.projectName).toBe('更新后的项目');
    });

    it('should throw NotFoundException for non-existent project', async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { projectName: '新名称' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
