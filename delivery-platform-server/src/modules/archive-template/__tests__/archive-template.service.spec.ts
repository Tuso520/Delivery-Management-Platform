import { BadRequestException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import { ArchiveTemplateService } from '../archive-template.service';

describe('ArchiveTemplateService item management', () => {
  it('creates a child item with a derived level and next item number', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'item-2' });
    const prisma = {
      archiveTemplate: {
        findUnique: jest.fn().mockResolvedValue({ id: 'template-1' }),
      },
      archiveTemplateItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'item-1',
          templateId: 'template-1',
          level: 1,
        }),
        aggregate: jest.fn().mockResolvedValue({ _max: { itemNo: 8 } }),
        create,
      },
    } as unknown as PrismaService;
    const service = new ArchiveTemplateService(prisma);

    await service.createItem('template-1', {
      stageCode: 'Construction',
      name: '现场照片',
      parentId: 'item-1',
      evidenceFileTypes: ['jpg', 'png'],
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        templateId: 'template-1',
        parentId: 'item-1',
        level: 2,
        itemNo: 9,
        allowedFileTypes: 'jpg,png',
      }),
    });
  });

  it('refuses to delete an item already used by project archives', async () => {
    const prisma = {
      archiveTemplateItem: {
        findUnique: jest.fn().mockResolvedValue({ id: 'item-1' }),
        count: jest.fn().mockResolvedValue(0),
        delete: jest.fn(),
      },
      projectArchiveItem: {
        count: jest.fn().mockResolvedValue(2),
      },
    } as unknown as PrismaService;
    const service = new ArchiveTemplateService(prisma);

    await expect(service.deleteItem('item-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.archiveTemplateItem.delete).not.toHaveBeenCalled();
  });
});
