import { NotFoundException } from '@nestjs/common';

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
      }),
    );
    expect(findMany.mock.calls[0][0].select).not.toHaveProperty('items');
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
});
