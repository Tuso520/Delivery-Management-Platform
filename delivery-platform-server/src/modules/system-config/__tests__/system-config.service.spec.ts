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
      attachment: { maxSizeMb: 100 },
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
});
