import { BadRequestException, ForbiddenException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { ToolService } from '../tool.service';

const viewer: JwtPayload = {
  sub: 'viewer-1',
  username: 'viewer',
  realName: '只读用户',
  email: null,
  roles: ['VIEWER'],
  permissions: ['tools:view'],
  permissionVersion: 1,
};

const manager: JwtPayload = {
  ...viewer,
  sub: 'manager-1',
  username: 'manager',
  realName: '工具管理员',
  roles: ['STANDARD_ADMIN'],
  permissions: ['tools:view', 'tools:manage'],
};

function toolRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tool-1',
    categoryId: 'category-1',
    name: '文档转换',
    description: '转换交付文档格式',
    toolType: 'external',
    url: 'https://tools.example.test/convert',
    icon: 'Link',
    configuration: { timeoutSeconds: 30 },
    sortOrder: 10,
    status: 'Active',
    createdAt: new Date('2026-07-11T00:00:00Z'),
    updatedAt: new Date('2026-07-11T00:00:00Z'),
    category: {
      id: 'category-1',
      name: '文档工具',
      sortOrder: 10,
      status: 'Active',
    },
    ...overrides,
  };
}

describe('ToolService target catalog', () => {
  it('returns only active catalog entries to ordinary viewers', async () => {
    const findMany = jest.fn().mockResolvedValue([toolRecord()]);
    const prisma = { toolItem: { findMany } } as unknown as PrismaService;
    const service = new ToolService(prisma);

    const result = await service.findAll({}, viewer);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'Active',
          category: { status: 'Active' },
        },
      }),
    );
    expect(result).toEqual([
      {
        id: 'tool-1',
        name: '文档转换',
        category: '文档工具',
        description: '转换交付文档格式',
        toolType: 'EXTERNAL',
        routeOrUrl: 'https://tools.example.test/convert',
        enabled: true,
        sortOrder: 10,
        configuration: { timeoutSeconds: 30 },
      },
    ]);
  });

  it('rejects includeDisabled for callers without tools:manage', async () => {
    const prisma = { toolItem: { findMany: jest.fn() } } as unknown as PrismaService;
    const service = new ToolService(prisma);

    await expect(service.findAll({ includeDisabled: true }, viewer)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lets managers inspect active and inactive tools without status filtering', async () => {
    const findMany = jest.fn().mockResolvedValue([toolRecord({ status: 'Inactive' })]);
    const prisma = { toolItem: { findMany } } as unknown as PrismaService;
    const service = new ToolService(prisma);

    const result = await service.findAll({ includeDisabled: true }, manager);

    expect(findMany.mock.calls[0][0].where).toEqual({ category: {} });
    expect(result[0].enabled).toBe(false);
  });

  it('finds or creates a category and persists target fields transactionally', async () => {
    const transaction = {
      toolCategory: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'category-2',
          name: 'PDF 工具',
          sortOrder: 0,
          status: 'Active',
        }),
      },
      toolItem: {
        create: jest.fn().mockResolvedValue(
          toolRecord({
            categoryId: 'category-2',
            name: 'PDF 压缩',
            toolType: 'internal',
            url: '/tools/pdf-compress',
            configuration: { maxSizeMb: 50 },
            category: {
              id: 'category-2',
              name: 'PDF 工具',
              sortOrder: 0,
              status: 'Active',
            },
          }),
        ),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new ToolService(prisma);

    const result = await service.create({
      name: ' PDF 压缩 ',
      category: ' PDF 工具 ',
      toolType: 'INTERNAL',
      routeOrUrl: '/tools/pdf-compress',
      configuration: { maxSizeMb: 50 },
    });

    expect(transaction.toolCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'PDF 工具', status: 'Active' } }),
    );
    expect(transaction.toolItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoryId: 'category-2',
          name: 'PDF 压缩',
          toolType: 'internal',
          url: '/tools/pdf-compress',
          configuration: { maxSizeMb: 50 },
        }),
      }),
    );
    expect(result.category).toBe('PDF 工具');
  });

  it('rejects unsafe external schemes', async () => {
    const prisma = { $transaction: jest.fn() } as unknown as PrismaService;
    const service = new ToolService(prisma);

    await expect(
      service.create({
        name: '本地文件',
        category: '文档工具',
        toolType: 'EXTERNAL',
        routeOrUrl: 'file:///etc/passwd',
      }),
    ).rejects.toThrow(new BadRequestException('外部工具仅支持 HTTP(S) 地址'));
  });

  it('disables tools by status without deleting catalog data', async () => {
    const update = jest.fn().mockResolvedValue(toolRecord({ status: 'Inactive' }));
    const prisma = {
      toolItem: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tool-1' }),
        update,
      },
    } as unknown as PrismaService;
    const service = new ToolService(prisma);

    const result = await service.setEnabled('tool-1', false);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tool-1' },
        data: { status: 'Inactive' },
      }),
    );
    expect(result.enabled).toBe(false);
  });
});
