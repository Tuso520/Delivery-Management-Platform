import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import { ArchiveTemplateService } from '../archive-template.service';

describe('ArchiveTemplateService target aggregate', () => {
  it('lists target template metadata without exposing legacy template items', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      archiveTemplate: { findMany },
    } as unknown as PrismaService;
    const service = new ArchiveTemplateService(prisma);

    await service.findAll({ keyword: 'delivery' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { templateCode: { contains: 'delivery' } },
            { templateName: { contains: 'delivery' } },
          ],
        },
        select: expect.objectContaining({
          currentPublishedVersion: expect.any(Object),
          _count: { select: { versions: true, projectSnapshots: true } },
        }),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    );
    expect(findMany.mock.calls[0][0].select).not.toHaveProperty('items');
  });

  it.each([
    ['templateName', 'desc', [{ templateName: 'desc' }, { id: 'asc' }]],
    [
      'currentVersion',
      'asc',
      [{ currentPublishedVersion: { versionNo: 'asc' } }, { templateName: 'asc' }, { id: 'asc' }],
    ],
  ] as const)('sorts %s in the database', async (sortBy, sortOrder, orderBy) => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      archiveTemplate: { findMany },
    } as unknown as PrismaService;
    const service = new ArchiveTemplateService(prisma);

    await service.findAll({ sortBy, sortOrder });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy }));
  });

  it('creates a template and its initial editable version atomically', async () => {
    const transaction = {
      archiveTemplate: {
        create: jest.fn().mockResolvedValue({ id: 'template-1', templateCode: 'TPL-001' }),
      },
      archiveTemplateVersion: {
        create: jest.fn().mockResolvedValue({
          id: 'version-1',
          versionNo: 'V1.0',
          status: 'DRAFT',
          revision: 1,
        }),
      },
    };
    const prisma = {
      archiveTemplate: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new ArchiveTemplateService(prisma);

    const result = await service.create(
      { templateCode: 'TPL-001', templateName: '交付档案模板' },
      'user-1',
    );

    expect(transaction.archiveTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        templateCode: 'TPL-001',
        status: 'DRAFT',
        createdBy: 'user-1',
        updatedBy: 'user-1',
      }),
    });
    expect(transaction.archiveTemplateVersion.create).toHaveBeenCalledWith({
      data: {
        templateId: 'template-1',
        versionNo: 'V1.0',
        status: 'DRAFT',
        createdBy: 'user-1',
      },
      select: { id: true, versionNo: true, status: true, revision: true },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'template-1',
        draftVersion: expect.objectContaining({ id: 'version-1', revision: 1 }),
      }),
    );
  });

  it('returns not found for a missing target template', async () => {
    const prisma = {
      archiveTemplate: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new ArchiveTemplateService(prisma);

    await expect(service.findById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects deletion when the actor is not a super administrator', async () => {
    const prisma = {} as PrismaService;
    const service = new ArchiveTemplateService(prisma);

    await expect(
      service.remove('template-1', { sub: 'user-1', roles: ['PROJECT_MANAGER'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects deletion when a project still references the template', async () => {
    const transaction = {
      archiveTemplate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'template-1',
          templateCode: 'TPL-001',
          templateName: '交付档案模板',
        }),
        delete: jest.fn(),
      },
      project: { count: jest.fn().mockResolvedValue(2) },
      operationLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new ArchiveTemplateService(prisma);

    await expect(
      service.remove('template-1', { sub: 'admin-1', roles: ['SUPER_ADMIN'] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.archiveTemplate.delete).not.toHaveBeenCalled();
  });

  it('deletes an unreferenced template and writes a success audit', async () => {
    const transaction = {
      archiveTemplate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'template-1',
          templateCode: 'TPL-001',
          templateName: '交付档案模板',
        }),
        delete: jest.fn().mockResolvedValue({ id: 'template-1' }),
      },
      project: { count: jest.fn().mockResolvedValue(0) },
      operationLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new ArchiveTemplateService(prisma);

    await service.remove('template-1', { sub: 'admin-1', roles: ['SUPER_ADMIN'] });

    expect(transaction.archiveTemplate.delete).toHaveBeenCalledWith({
      where: { id: 'template-1' },
    });
    expect(transaction.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'admin-1',
        module: 'archive_template',
        action: 'delete',
        targetId: 'template-1',
        result: 'success',
      }),
    });
  });
});
