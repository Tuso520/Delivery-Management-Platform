import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { seedProjects } from '../../../prisma/seed-data/projects';
import { seedRoles } from '../../../prisma/seed-data/roles';
import {
  resolveSeedPassword,
  shouldResetExistingSeedUserPasswords,
} from '../../../prisma/seed-data/seed-password';
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
  it('creates fresh target standards with verified file-only content', () => {
    const source = readFileSync(
      join(__dirname, '../../../prisma/seed-data/target-standards.ts'),
      'utf8',
    );

    expect(source).toContain('await ensureSeedObject(definitionStorage, plan)');
    expect(source).toContain('await verifyStoredObject(storage.client');
    expect(source).toContain('await tx.logicalFile.create');
    expect(source).toContain('await tx.fileAsset.create');
    expect(source).toContain('await tx.fileVersion.create');
    expect(source).toContain('fileVersionId,');
    expect(source).toContain("status: 'APPROVED'");
    expect(source).toContain('await removeUnboundSeedObject(prisma, definitionStorage');
    expect(source).toContain('await storage.client.removeObject(storage.bucket, storageKey)');
    expect(source).toContain('storageBucket_storageKey');
    const versionCreateStart = source.indexOf('await tx.standardVersion.create');
    const versionCreateEnd = source.indexOf('await tx.standard.update', versionCreateStart);
    const versionCreate = source.slice(versionCreateStart, versionCreateEnd);
    expect(versionCreateStart).toBeGreaterThan(-1);
    expect(versionCreateEnd).toBeGreaterThan(versionCreateStart);
    expect(versionCreate).not.toContain('structuredContent:');
    expect(versionCreate).not.toContain('applicability:');
    expect(versionCreate).not.toContain('legacySnapshot:');
  });

  it('keeps the target seed entry disconnected from retired seed domains and writes', () => {
    const seedDirectory = join(__dirname, '../../../prisma');
    const activeFiles = [
      'seed.ts',
      'seed-data/archive-templates.ts',
      'seed-data/languages.ts',
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
    expect(source).not.toContain('seedUiTranslations');
    expect(source).not.toMatch(/prisma\.translation\./);
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

  it('retires database UI translations without deleting production rows', () => {
    const migration = readFileSync(
      join(
        __dirname,
        '../../../prisma/migrations/20260713100000_retire_database_ui_translations/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain("`content_type` <> ''ui''");
    expect(migration).toContain("`field_name` <> ''label''");
    expect(migration).toContain("`language_code` NOT IN (''zh-CN'', ''en-US'')");
    expect(migration).toContain('PREPARE translation_retirement_guard_statement');
    expect(migration).toContain('PREPARE translation_state_guard_statement');
    expect(migration).toContain(
      'RENAME TABLE `translations` TO `retired_ui_translations_20260713`',
    );
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/iu);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/iu);
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

  it('requires explicit non-placeholder seed passwords in every environment', () => {
    for (const nodeEnv of [undefined, 'development', 'test', 'production']) {
      expect(() => resolveSeedPassword('admin', { NODE_ENV: nodeEnv })).toThrow(
        'SEED_ADMIN_PASSWORD',
      );
      expect(() =>
        resolveSeedPassword('admin', {
          NODE_ENV: nodeEnv,
          SEED_ADMIN_PASSWORD: '   ',
        }),
      ).toThrow('SEED_ADMIN_PASSWORD');
      expect(() =>
        resolveSeedPassword('pm', {
          NODE_ENV: nodeEnv,
          SEED_DEFAULT_PASSWORD: 'CHANGE_ME_DEMO_USER_PASSWORD',
        }),
      ).toThrow('SEED_PM_PASSWORD or SEED_DEFAULT_PASSWORD');
      expect(() =>
        resolveSeedPassword('pm', {
          NODE_ENV: nodeEnv,
          SEED_DEFAULT_PASSWORD: '   ',
        }),
      ).toThrow('SEED_PM_PASSWORD or SEED_DEFAULT_PASSWORD');
    }

    expect(
      resolveSeedPassword('admin', {
        NODE_ENV: 'development',
        SEED_ADMIN_PASSWORD: 'unit-test-admin-secret',
      }),
    ).toBe('unit-test-admin-secret');
    expect(
      resolveSeedPassword('pm', {
        NODE_ENV: 'development',
        SEED_DEFAULT_PASSWORD: 'unit-test-user-secret',
      }),
    ).toBe('unit-test-user-secret');
    expect(
      resolveSeedPassword('admin', {
        NODE_ENV: 'test',
        SEED_ADMIN_PASSWORD: '  intentionally-spaced-unit-test-secret  ',
      }),
    ).toBe('  intentionally-spaced-unit-test-secret  ');
  });

  it('contains no runtime password fallback and requires Compose seed inputs', () => {
    const seedPasswordSource = readFileSync(
      join(__dirname, '../../../prisma/seed-data/seed-password.ts'),
      'utf8',
    );
    expect(seedPasswordSource).not.toContain('developmentPasswords');
    expect(seedPasswordSource).not.toContain("environment.NODE_ENV !== 'production'");

    const repositoryRoot = join(__dirname, '../../../..');
    const localMockSource = readFileSync(
      join(repositoryRoot, 'scripts/local-test-server.mjs'),
      'utf8',
    );
    expect(localMockSource).toContain('LOCAL_TEST_ADMIN_PASSWORD');
    expect(localMockSource).toContain('LOCAL_TEST_PM_PASSWORD');
    expect(localMockSource).not.toMatch(/Admin@123|Pm@123456/u);

    for (const composeFile of ['docker-compose.yml', 'docker-compose.test.yml']) {
      const source = readFileSync(join(repositoryRoot, composeFile), 'utf8');
      expect(source).toContain('${SEED_ADMIN_PASSWORD:?SEED_ADMIN_PASSWORD is required}');
      expect(source).toContain('${SEED_DEFAULT_PASSWORD:?SEED_DEFAULT_PASSWORD is required}');
      expect(source).toContain('${SEED_RESET_EXISTING_USER_PASSWORDS:-false}');
      expect(source).not.toContain('${SEED_RESET_EXISTING_USER_PASSWORDS:-true}');
    }

    for (const exampleFile of ['.env.example', '.env.local.example']) {
      const source = readFileSync(join(repositoryRoot, exampleFile), 'utf8');
      expect(source).toMatch(/^SEED_ADMIN_PASSWORD=CHANGE_ME_.+$/mu);
      expect(source).toMatch(/^SEED_DEFAULT_PASSWORD=CHANGE_ME_.+$/mu);
      expect(source).toContain('SEED_RESET_EXISTING_USER_PASSWORDS=false');
      expect(source).not.toContain('SEED_RESET_EXISTING_USER_PASSWORDS=true');
    }
  });

  it('never resets existing seed passwords unless reset is explicitly enabled', () => {
    for (const nodeEnv of [undefined, 'development', 'test', 'production']) {
      expect(shouldResetExistingSeedUserPasswords({ NODE_ENV: nodeEnv })).toBe(false);
    }
    expect(
      shouldResetExistingSeedUserPasswords({
        NODE_ENV: 'production',
        SEED_RESET_EXISTING_USER_PASSWORDS: 'true',
      }),
    ).toBe(true);
  });

  it('fails seed-user password preflight before the first database read', async () => {
    const originalAdminPassword = process.env.SEED_ADMIN_PASSWORD;
    const originalDefaultPassword = process.env.SEED_DEFAULT_PASSWORD;
    delete process.env.SEED_ADMIN_PASSWORD;
    delete process.env.SEED_DEFAULT_PASSWORD;
    const findUnique = jest.fn();

    try {
      await expect(seedUsers({ user: { findUnique } } as unknown as PrismaClient)).rejects.toThrow(
        'SEED_ADMIN_PASSWORD',
      );
    } finally {
      if (originalAdminPassword === undefined) {
        delete process.env.SEED_ADMIN_PASSWORD;
      } else {
        process.env.SEED_ADMIN_PASSWORD = originalAdminPassword;
      }
      if (originalDefaultPassword === undefined) {
        delete process.env.SEED_DEFAULT_PASSWORD;
      } else {
        process.env.SEED_DEFAULT_PASSWORD = originalDefaultPassword;
      }
    }

    expect(findUnique).not.toHaveBeenCalled();
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

  it('resets existing seeded user passwords only when explicitly enabled without reviving accounts', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalReset = process.env.SEED_RESET_EXISTING_USER_PASSWORDS;
    const originalAdminPassword = process.env.SEED_ADMIN_PASSWORD;
    const originalDefaultPassword = process.env.SEED_DEFAULT_PASSWORD;
    process.env.NODE_ENV = 'development';
    process.env.SEED_RESET_EXISTING_USER_PASSWORDS = 'true';
    process.env.SEED_ADMIN_PASSWORD = 'unit-test-admin-secret';
    process.env.SEED_DEFAULT_PASSWORD = 'unit-test-user-secret';
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

      if (originalAdminPassword === undefined) {
        delete process.env.SEED_ADMIN_PASSWORD;
      } else {
        process.env.SEED_ADMIN_PASSWORD = originalAdminPassword;
      }

      if (originalDefaultPassword === undefined) {
        delete process.env.SEED_DEFAULT_PASSWORD;
      } else {
        process.env.SEED_DEFAULT_PASSWORD = originalDefaultPassword;
      }
    }

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-admin' },
        data: {
          password: 'hashed:unit-test-admin-secret',
        },
      }),
    );
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-pm_wang' },
        data: expect.objectContaining({
          password: 'hashed:unit-test-user-secret',
        }),
      }),
    );
    expect(bcrypt.hash).toHaveBeenCalledWith('unit-test-admin-secret', 12);
  });

  it('does not reset existing seeded user passwords in production by default', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalReset = process.env.SEED_RESET_EXISTING_USER_PASSWORDS;
    const originalAdminPassword = process.env.SEED_ADMIN_PASSWORD;
    const originalDefaultPassword = process.env.SEED_DEFAULT_PASSWORD;
    process.env.NODE_ENV = 'production';
    delete process.env.SEED_RESET_EXISTING_USER_PASSWORDS;
    process.env.SEED_ADMIN_PASSWORD = 'unit-test-admin-secret';
    process.env.SEED_DEFAULT_PASSWORD = 'unit-test-user-secret';
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

      if (originalAdminPassword === undefined) {
        delete process.env.SEED_ADMIN_PASSWORD;
      } else {
        process.env.SEED_ADMIN_PASSWORD = originalAdminPassword;
      }

      if (originalDefaultPassword === undefined) {
        delete process.env.SEED_DEFAULT_PASSWORD;
      } else {
        process.env.SEED_DEFAULT_PASSWORD = originalDefaultPassword;
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
