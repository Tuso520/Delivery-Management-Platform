import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { seedProjects } from '../../../prisma/seed-data/projects';
import { seedRoles } from '../../../prisma/seed-data/roles';
import { resolveSeedPassword } from '../../../prisma/seed-data/seed-password';
import { seedSystemOperations } from '../../../prisma/seed-data/system-operations';
import { seedTargetKnowledge } from '../../../prisma/seed-data/target-knowledge';
import { seedTargetDictionaries } from '../../../prisma/seed-data/target-platform';
import { seedTargetStandards } from '../../../prisma/seed-data/target-standards';
import { seedTemplatesAndTools } from '../../../prisma/seed-data/templates-tools';
import { seedUsers } from '../../../prisma/seed-data/users';

jest.mock('bcrypt', () => ({
  hash: jest.fn((value: string) => Promise.resolve(`hashed:${value}`)),
}));

describe('deployment seed safety', () => {
  it('keeps the target seed entry disconnected from retired seed domains and writes', () => {
    const seedDirectory = join(__dirname, '../../../prisma');
    const activeFiles = [
      'seed.ts',
      'seed-data/archive-templates.ts',
      'seed-data/projects.ts',
      'seed-data/system-operations.ts',
      'seed-data/target-platform.ts',
      'seed-data/target-standards.ts',
      'seed-data/target-knowledge.ts',
      'seed-data/templates-tools.ts',
    ];
    const source = activeFiles
      .map((file) => readFileSync(join(seedDirectory, file), 'utf8'))
      .join('\n');
    const entry = readFileSync(join(seedDirectory, 'seed.ts'), 'utf8');

    for (const retiredImport of [
      'checklist-templates',
      'seed-data/workflow',
      'seed-data/knowledge',
      'seed-data/platform',
      'seed-data/performance',
      'seed-data/project-operations',
      'seed-data/demo-coverage',
    ]) {
      expect(entry).not.toContain(retiredImport);
    }
    expect(source).not.toMatch(/\.deleteMany\s*\(/);
    expect(source).not.toMatch(
      /prisma\.(workflowCategory|workflowDocument|checklistTemplate|checklistTemplateItem|knowledgeArticle|attachment|dailyReport|okrObjective|keyResult|projectRetrospective|skillDefinition|trainingPlan|backupRecord|approvalTask|externalContactCandidate|projectArchiveItem)\./,
    );
    for (const businessType of [
      'PROJECT_ARCHIVE_FILE',
      'ARCHIVE_TEMPLATE',
      'STANDARD',
      'KNOWLEDGE',
    ]) {
      expect(source).toContain(`'${businessType}'`);
    }
    expect(source).not.toContain("'PROJECT_CREATE'");
  });

  it('does not overwrite existing projects', async () => {
    const projectUpsert = jest
      .fn()
      .mockImplementation(({ where }: { where: { projectCode: string } }) =>
        Promise.resolve({
          id: `project-${where.projectCode}`,
          projectCode: where.projectCode,
        }),
      );
    const legacyProjectArchiveCreate = jest.fn();
    const prisma = {
      project: {
        upsert: projectUpsert,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          archiveTemplateId: 'archive-template-1',
          archiveTemplateVersionId: 'archive-template-version-1',
        }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      projectMember: {
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      archiveTemplate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'archive-template-1',
          currentPublishedVersionId: 'archive-template-version-1',
        }),
      },
      archiveTemplateVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'archive-template-version-1',
          folders: [],
        }),
      },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      projectArchiveItem: { create: legacyProjectArchiveCreate },
      $transaction: jest.fn(),
    } as unknown as PrismaClient;
    (prisma.$transaction as unknown as jest.Mock).mockImplementation(
      (callback: (tx: PrismaClient) => Promise<unknown>) => callback(prisma),
    );

    await seedProjects(prisma);

    for (const call of projectUpsert.mock.calls) {
      expect(call[0].update).toEqual({});
    }
    expect(legacyProjectArchiveCreate).not.toHaveBeenCalled();
  });

  it('does not reset existing notification or integration configuration', async () => {
    const systemConfigUpsert = jest.fn().mockResolvedValue({ id: 'config-1' });
    const notificationRuleUpsert = jest.fn().mockResolvedValue({ id: 'rule-1' });
    const integrationUpsert = jest.fn().mockResolvedValue({ id: 'integration-1' });
    const prisma = {
      systemConfig: {
        upsert: systemConfigUpsert,
      },
      notificationRule: {
        findFirst: jest.fn().mockResolvedValue({ id: 'rule-1' }),
        upsert: notificationRuleUpsert,
      },
      integrationConfig: {
        findFirst: jest.fn().mockResolvedValue({ id: 'integration-1' }),
        upsert: integrationUpsert,
      },
    } as unknown as PrismaClient;

    await seedSystemOperations(prisma);

    for (const upsert of [systemConfigUpsert, notificationRuleUpsert, integrationUpsert]) {
      for (const [call] of upsert.mock.calls) {
        expect(call.update).toEqual({});
      }
    }
  });

  it('does not overwrite or re-enable existing seeded tools', async () => {
    const categoryCreate = jest.fn();
    const toolCreate = jest.fn();
    const prisma = {
      toolCategory: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-category' }),
        create: categoryCreate,
      },
      toolItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-tool' }),
        create: toolCreate,
      },
    } as unknown as PrismaClient;

    await seedTemplatesAndTools(prisma);

    expect(categoryCreate).not.toHaveBeenCalled();
    expect(toolCreate).not.toHaveBeenCalled();
    expect(prisma.toolCategory).not.toHaveProperty('update');
    expect(prisma.toolItem).not.toHaveProperty('update');
  });

  it('does not replace edited target knowledge content or create legacy attachments', async () => {
    const categoryUpsert = jest.fn().mockResolvedValue({ id: 'knowledge-category-1' });
    const itemUpsert = jest.fn().mockResolvedValue({ id: 'knowledge-item-1' });
    const versionUpsert = jest.fn().mockResolvedValue({ id: 'knowledge-version-1' });
    const prisma = {
      knowledgeCategory: {
        findFirst: jest.fn().mockResolvedValue({ id: 'knowledge-category-1' }),
        upsert: categoryUpsert,
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'admin-1' }),
      },
      knowledgeItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 'knowledge-item-1' }),
        upsert: itemUpsert,
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      knowledgeVersion: { upsert: versionUpsert },
      $transaction: jest.fn(),
    } as unknown as PrismaClient;
    (prisma.$transaction as unknown as jest.Mock).mockImplementation(
      (callback: (tx: PrismaClient) => Promise<unknown>) => callback(prisma),
    );

    await seedTargetKnowledge(prisma);

    for (const upsert of [categoryUpsert, itemUpsert, versionUpsert]) {
      for (const [call] of upsert.mock.calls) {
        expect(call.update).toEqual({});
      }
    }
    expect(versionUpsert).not.toHaveBeenCalled();
    expect(prisma).not.toHaveProperty('attachment');
  });

  it('does not attach seed versions to standards that already exist', async () => {
    const versionUpsert = jest.fn();
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'admin-1' }) },
      standard: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing-standard' }),
        upsert: jest.fn().mockResolvedValue({ id: 'existing-standard' }),
      },
      standardVersion: { upsert: versionUpsert },
      $transaction: jest.fn(),
    } as unknown as PrismaClient;
    (prisma.$transaction as unknown as jest.Mock).mockImplementation(
      (callback: (tx: PrismaClient) => Promise<unknown>) => callback(prisma),
    );

    await seedTargetStandards(prisma);

    expect(versionUpsert).not.toHaveBeenCalled();
    for (const [call] of (prisma.standard.upsert as unknown as jest.Mock).mock.calls) {
      expect(call.update).toEqual({});
    }
  });

  it('requires explicit seed passwords in production', () => {
    expect(() =>
      resolveSeedPassword('admin', {
        NODE_ENV: 'production',
        SEED_ADMIN_PASSWORD: 'CHANGE_ME_ADMIN_PASSWORD',
      }),
    ).toThrow('生产环境首次初始化必须配置 SEED_ADMIN_PASSWORD');
  });

  it('seeds target dictionaries without retired workforce domains', async () => {
    const categoryUpsert = jest.fn(({ where }) =>
      Promise.resolve({ id: `category-${where.categoryCode}` }),
    );
    const itemUpsert = jest.fn().mockResolvedValue({ id: 'item-1' });
    const prisma = {
      dictionaryCategory: { upsert: categoryUpsert },
      dictionaryItem: { upsert: itemUpsert },
    } as unknown as PrismaClient;

    await seedTargetDictionaries(prisma);

    const categoryCodes = categoryUpsert.mock.calls.map(([call]) => call.where.categoryCode);
    expect(categoryCodes).toEqual(
      expect.arrayContaining([
        'project_type',
        'project_lifecycle_status',
        'project_delivery_stage',
        'archive_file_type',
        'standard_type',
        'knowledge_content_type',
        'notification_event',
        'notification_channel',
      ]),
    );
    expect(categoryCodes).not.toEqual(
      expect.arrayContaining(['skill_level', 'skill_category', 'training_category']),
    );
  });

  it('resets existing seeded user passwords outside production without reviving accounts', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalReset = process.env.SEED_RESET_EXISTING_USER_PASSWORDS;
    process.env.NODE_ENV = 'development';
    delete process.env.SEED_RESET_EXISTING_USER_PASSWORDS;
    jest.clearAllMocks();

    const userUpdate = jest.fn(({ where, data }) =>
      Promise.resolve({ id: where.id, username: where.id, ...data }),
    );
    const prisma = {
      user: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve({
            id: `user-${where.username}`,
            username: where.username,
            status: 'Locked',
            deletedAt: new Date('2026-07-01T00:00:00.000Z'),
          }),
        ),
        create: jest.fn(),
        update: userUpdate,
      },
      role: {
        findUnique: jest.fn(({ where }) => Promise.resolve({ id: `role-${where.roleCode}` })),
      },
      userRole: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing-link' }),
        create: jest.fn(),
      },
    } as unknown as PrismaClient;

    try {
      await seedUsers(prisma);
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }

      if (originalReset === undefined) {
        delete process.env.SEED_RESET_EXISTING_USER_PASSWORDS;
      } else {
        process.env.SEED_RESET_EXISTING_USER_PASSWORDS = originalReset;
      }
    }

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-admin' },
        data: {
          password: 'hashed:Admin@123',
        },
      }),
    );
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-pm_wang' },
        data: expect.objectContaining({
          password: 'hashed:Pm@123456',
        }),
      }),
    );
    expect(bcrypt.hash).toHaveBeenCalledWith('Admin@123', 12);
  });

  it('does not reset existing seeded user passwords in production by default', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalReset = process.env.SEED_RESET_EXISTING_USER_PASSWORDS;
    process.env.NODE_ENV = 'production';
    delete process.env.SEED_RESET_EXISTING_USER_PASSWORDS;
    jest.clearAllMocks();

    const prisma = {
      user: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve({
            id: `user-${where.username}`,
            username: where.username,
            status: 'Active',
            deletedAt: null,
          }),
        ),
        create: jest.fn(),
        update: jest.fn(),
      },
      role: {
        findUnique: jest.fn(({ where }) => Promise.resolve({ id: `role-${where.roleCode}` })),
      },
      userRole: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing-link' }),
        create: jest.fn(),
      },
    } as unknown as PrismaClient;

    try {
      await seedUsers(prisma);
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }

      if (originalReset === undefined) {
        delete process.env.SEED_RESET_EXISTING_USER_PASSWORDS;
      } else {
        process.env.SEED_RESET_EXISTING_USER_PASSWORDS = originalReset;
      }
    }

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it('does not overwrite or broaden existing seeded roles in production', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const deleteRolePermission = jest.fn();
    const createRolePermission = jest.fn();
    const permissionFindMany = jest.fn().mockResolvedValue([{ id: 'new-seeded-permission' }]);
    const prisma = {
      role: {
        findUnique: jest.fn().mockResolvedValue({ id: 'role-1' }),
        upsert: jest.fn().mockResolvedValue({ id: 'role-1' }),
      },
      permission: {
        findMany: permissionFindMany,
      },
      rolePermission: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'custom-link', permissionId: 'custom-permission' }]),
        create: createRolePermission,
        delete: deleteRolePermission,
      },
    } as unknown as PrismaClient;

    try {
      await seedRoles(prisma);
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }

    expect(deleteRolePermission).not.toHaveBeenCalled();
    expect(createRolePermission).not.toHaveBeenCalled();
    expect(permissionFindMany).not.toHaveBeenCalled();
    for (const call of (prisma.role.upsert as unknown as jest.Mock).mock.calls) {
      expect(call[0].update).toEqual({});
    }
  });

  it('assigns the initial permission matrix to roles first created in production', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const createRolePermission = jest.fn().mockResolvedValue({ id: 'link-1' });
    const prisma = {
      role: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(({ where }) => Promise.resolve({ id: `role-${where.roleCode}` })),
      },
      permission: {
        findMany: jest.fn().mockResolvedValue([{ id: 'permission-1' }]),
      },
      rolePermission: {
        findMany: jest.fn().mockResolvedValue([]),
        create: createRolePermission,
      },
    } as unknown as PrismaClient;

    try {
      await seedRoles(prisma);
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }

    expect(createRolePermission).toHaveBeenCalled();
    expect(createRolePermission.mock.calls.length).toBe(
      (prisma.role.upsert as unknown as jest.Mock).mock.calls.length,
    );
  });
});
