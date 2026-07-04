import type { PrismaClient } from '@prisma/client';

import { seedKnowledge } from '../../../prisma/seed-data/knowledge';
import { seedReportsAndPerformance } from '../../../prisma/seed-data/performance';
import { seedProjects } from '../../../prisma/seed-data/projects';
import { seedRoles } from '../../../prisma/seed-data/roles';
import { resolveSeedPassword } from '../../../prisma/seed-data/seed-password';
import { seedSystemOperations } from '../../../prisma/seed-data/system-operations';

describe('deployment seed safety', () => {
  it('does not overwrite existing projects', async () => {
    const projectUpsert = jest
      .fn()
      .mockImplementation(({ where }: { where: { projectCode: string } }) =>
        Promise.resolve({
          id: `project-${where.projectCode}`,
          projectCode: where.projectCode,
        }),
      );
    const prisma = {
      project: { upsert: projectUpsert },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      archiveTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    await seedProjects(prisma);

    for (const call of projectUpsert.mock.calls) {
      expect(call[0].update).toEqual({});
    }
  });

  it('does not overwrite existing reports or performance records', async () => {
    const dailyReportUpdate = jest.fn();
    const objectiveUpdate = jest
      .fn()
      .mockResolvedValue({ id: 'objective-1' });
    const keyResultUpdate = jest
      .fn()
      .mockResolvedValue({ id: 'key-result-1' });
    const performanceUpsert = jest.fn().mockResolvedValue({ id: 'score-1' });
    const prisma = {
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'project-1' }),
      },
      dailyReport: {
        findFirst: jest.fn().mockResolvedValue({ id: 'report-1' }),
        create: jest.fn(),
        update: dailyReportUpdate,
      },
      okrObjective: {
        findFirst: jest.fn().mockResolvedValue({ id: 'objective-1' }),
        create: jest.fn(),
        update: objectiveUpdate,
      },
      keyResult: {
        findFirst: jest.fn().mockResolvedValue({ id: 'key-result-1' }),
        create: jest.fn(),
        update: keyResultUpdate,
      },
      performanceScore: {
        upsert: performanceUpsert,
      },
    } as unknown as PrismaClient;

    await seedReportsAndPerformance(prisma, 'user-1');

    expect(dailyReportUpdate).not.toHaveBeenCalled();
    expect(objectiveUpdate).not.toHaveBeenCalled();
    expect(keyResultUpdate).not.toHaveBeenCalled();
    expect(performanceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} }),
    );
  });

  it('does not reset existing notification or integration configuration', async () => {
    const notificationRuleUpdate = jest.fn();
    const integrationUpdate = jest.fn();
    const prisma = {
      systemConfig: {
        upsert: jest.fn().mockResolvedValue({ id: 'config-1' }),
      },
      notificationRule: {
        findFirst: jest.fn().mockResolvedValue({ id: 'rule-1' }),
        create: jest.fn(),
        update: notificationRuleUpdate,
      },
      integrationConfig: {
        findFirst: jest.fn().mockResolvedValue({ id: 'integration-1' }),
        create: jest.fn(),
        update: integrationUpdate,
      },
      operationLog: {
        count: jest.fn().mockResolvedValue(1),
        createMany: jest.fn(),
      },
    } as unknown as PrismaClient;

    await seedSystemOperations(prisma);

    expect(notificationRuleUpdate).not.toHaveBeenCalled();
    expect(integrationUpdate).not.toHaveBeenCalled();
  });

  it('does not replace edited knowledge index content', async () => {
    const articleUpdate = jest.fn();
    const prisma = {
      knowledgeCategory: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'knowledge-category-1' }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'knowledge-category-1' }),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'admin-1' }),
      },
      knowledgeArticle: {
        findFirst: jest.fn().mockResolvedValue({ id: 'article-1' }),
        create: jest.fn(),
        update: articleUpdate,
      },
    } as unknown as PrismaClient;

    await seedKnowledge(prisma);

    expect(articleUpdate).not.toHaveBeenCalled();
  });

  it('requires explicit seed passwords in production', () => {
    expect(() =>
      resolveSeedPassword(
        'admin',
        {
          NODE_ENV: 'production',
          SEED_ADMIN_PASSWORD: 'CHANGE_ME_ADMIN_PASSWORD',
        },
      ),
    ).toThrow('生产环境首次初始化必须配置 SEED_ADMIN_PASSWORD');
  });

  it('does not remove permissions added to seeded roles in production', async () => {
    const deleteRolePermission = jest.fn();
    const prisma = {
      role: {
        upsert: jest.fn().mockResolvedValue({ id: 'role-1' }),
      },
      permission: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      rolePermission: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'custom-link', permissionId: 'custom-permission' },
        ]),
        create: jest.fn(),
        delete: deleteRolePermission,
      },
    } as unknown as PrismaClient;

    await seedRoles(prisma);

    expect(deleteRolePermission).not.toHaveBeenCalled();
    for (const call of (
      prisma.role.upsert as unknown as jest.Mock
    ).mock.calls) {
      expect(call[0].update).toEqual({});
    }
  });
});
