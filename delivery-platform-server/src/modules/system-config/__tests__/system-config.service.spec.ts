import type { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';

import type { PrismaService } from '../../../database/prisma.service';
import { SystemConfigService } from '../system-config.service';

describe('SystemConfigService target settings', () => {
  it('returns only the typed settings schema with safe defaults', async () => {
    const prisma = {
      systemConfig: {
        findMany: jest.fn().mockResolvedValue([
          { configKey: 'project.default_page_size', configValue: '50' },
          { configKey: 'file.allowed_extensions', configValue: 'pdf,docx' },
          { configKey: 'security.login_max_attempts', configValue: '8' },
        ]),
      },
    } as unknown as PrismaService;
    const service = new SystemConfigService(prisma);

    await expect(service.getSettings()).resolves.toEqual({
      project: {
        defaultPageSize: 50,
        defaultRiskLevel: 'Low',
      },
      attachment: { maxSizeMb: 500 },
      file: { allowedExtensions: ['pdf', 'docx'] },
      approval: { timeoutDays: 3 },
      knowledge: { defaultPageSize: 20 },
      security: { sessionHours: 12, loginMaxAttempts: 8 },
    });
  });

  it('does not expose the retired arbitrary-key CRUD methods', () => {
    const service = new SystemConfigService({} as PrismaService);

    expect(service).not.toHaveProperty('findAll');
    expect(service).not.toHaveProperty('findByKey');
    expect(service).not.toHaveProperty('upsert');
    expect(service).not.toHaveProperty('delete');
  });

  it('resolves the project creation risk default from its typed key', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { configKey: 'project.default_risk_level', configValue: 'High' },
    ]);
    const service = new SystemConfigService({
      systemConfig: { findMany },
    } as unknown as PrismaService);

    await expect(service.getDefaultProjectRiskLevel()).resolves.toBe('High');
    expect(findMany).toHaveBeenCalledWith({
      where: { configKey: { in: ['project.default_risk_level'] } },
    });
  });

  it('resolves project and knowledge pagination defaults from their runtime keys', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ configKey: 'project.default_page_size', configValue: '40' }])
      .mockResolvedValueOnce([{ configKey: 'knowledge.default_page_size', configValue: '60' }]);
    const service = new SystemConfigService({
      systemConfig: { findMany },
    } as unknown as PrismaService);

    await expect(service.getDefaultProjectPageSize()).resolves.toBe(40);
    await expect(service.getDefaultKnowledgePageSize()).resolves.toBe(60);
  });

  it('writes only known target keys in a single transaction', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'config-1' });
    const prisma = {
      systemConfig: {
        upsert,
        findMany: jest.fn().mockResolvedValue([
          { configKey: 'project.default_page_size', configValue: '30' },
          { configKey: 'file.allowed_extensions', configValue: 'pdf,xlsx' },
        ]),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    } as unknown as PrismaService;
    const service = new SystemConfigService(prisma);

    await service.updateSettings(
      {
        project: { defaultPageSize: 30 },
        file: { allowedExtensions: ['pdf', 'xlsx'] },
      },
      'admin-1',
    );

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { configKey: 'project.default_page_size' },
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { configKey: 'file.allowed_extensions' },
      }),
    );
  });

  it('stores ONLYOFFICE JWT configuration encrypted and never returns the secret', async () => {
    let record:
      | {
          id: string;
          provider: string;
          configValue: Prisma.JsonValue;
          encryptedConfig: string | null;
          isEnabled: boolean;
          updatedAt: Date;
        }
      | undefined;
    const prisma = {
      integrationConfig: {
        findFirst: jest.fn(async () => record ?? null),
        create: jest.fn(async ({ data }) => {
          record = {
            id: 'onlyoffice-1',
            provider: data.provider,
            configValue: data.configValue,
            encryptedConfig: data.encryptedConfig,
            isEnabled: data.isEnabled,
            updatedAt: new Date('2026-08-24T00:00:00.000Z'),
          };
          return record;
        }),
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    const config = {
      get: jest.fn().mockReturnValue(Buffer.alloc(32, 9).toString('base64')),
    } as unknown as ConfigService;
    const service = new SystemConfigService(prisma, config);

    const response = await service.updateDocumentPreviewSettings(
      {
        enabled: true,
        docsUrl: 'https://office.example.com/',
        jwtSecret: 'onlyoffice-secret',
      },
      'admin-1',
    );

    expect(record?.encryptedConfig).toMatch(/^v1:/);
    expect(record?.encryptedConfig).not.toContain('onlyoffice-secret');
    expect(response).toEqual(
      expect.objectContaining({
        enabled: true,
        docsUrl: 'https://office.example.com',
        jwtSecretConfigured: true,
        ready: true,
        source: 'DATABASE',
      }),
    );
    expect(JSON.stringify(response)).not.toContain('onlyoffice-secret');
    await expect(service.getOnlyOfficeRuntimeConfig()).resolves.toEqual({
      docsUrl: 'https://office.example.com',
      jwtSecret: 'onlyoffice-secret',
    });
  });
});
