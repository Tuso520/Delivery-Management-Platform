import { BadRequestException, ConflictException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import { FieldConfigurationService } from '../field-configuration.service';

function createPrismaMock() {
  return {
    dictionaryCategory: { findFirst: jest.fn(), findMany: jest.fn() },
    dictionaryItem: {
      findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(),
      create: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn(),
    },
    project: { count: jest.fn().mockResolvedValue(0) },
    projectPayment: { count: jest.fn().mockResolvedValue(0) },
    archiveTemplate: { count: jest.fn().mockResolvedValue(0) },
    checklistTemplate: { count: jest.fn().mockResolvedValue(0) },
    documentTemplate: { count: jest.fn().mockResolvedValue(0) },
    standard: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn(async (values: unknown[]) => Promise.all(values)),
  };
}

const category = {
  id: 'category-id', categoryCode: 'COUNTRY', categoryName: '国家', description: null,
  isSystem: true, status: 'Active', sortOrder: 10, createdAt: new Date(), updatedAt: new Date(),
};

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-id', categoryId: category.id, itemValue: 'CN', itemLabel: '中国', itemCode: 'CN',
    description: null, extraData: null, status: 'Active', sortOrder: 10, isSystemDefault: false,
    createdBy: 'admin-id', updatedBy: 'admin-id', createdAt: new Date(), updatedAt: new Date(),
    deletedAt: null, category, ...overrides,
  };
}

describe('FieldConfigurationService', () => {
  it('returns field values with server-side pagination', async () => {
    const prisma = createPrismaMock();
    prisma.dictionaryCategory.findFirst.mockResolvedValue(category);
    prisma.dictionaryItem.count.mockResolvedValue(12);
    prisma.dictionaryItem.findMany.mockResolvedValue([item()]);
    const service = new FieldConfigurationService(prisma as unknown as PrismaService);

    await expect(service.findValues(category.id, { page: 2, pageSize: 10, keyword: '中', status: 'Active' }))
      .resolves.toMatchObject({ page: 2, pageSize: 10, total: 12, items: [{ name: '中国' }] });
    expect(prisma.dictionaryItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 10,
      where: expect.objectContaining({ categoryId: category.id, status: 'Active', deletedAt: null }),
    }));
  });

  it('requires codes for country and currency values', async () => {
    const prisma = createPrismaMock();
    prisma.dictionaryCategory.findFirst.mockResolvedValue(category);
    const service = new FieldConfigurationService(prisma as unknown as PrismaService);
    await expect(service.create(category.id, { name: '日本' }, 'admin-id')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate names and non-empty codes within one category', async () => {
    const prisma = createPrismaMock();
    prisma.dictionaryCategory.findFirst.mockResolvedValue(category);
    prisma.dictionaryItem.findFirst.mockResolvedValue({ itemLabel: '中国', itemCode: 'CN' });
    const service = new FieldConfigurationService(prisma as unknown as PrismaService);
    await expect(service.create(category.id, { name: '中国', code: 'CHN' }, 'admin-id')).rejects.toThrow('同一分类下字段名称不得重复');
    await expect(service.create(category.id, { name: '中华人民共和国', code: 'CN' }, 'admin-id')).rejects.toThrow('同一分类下非空编码不得重复');
  });

  it('creates a custom value while recording creator and updater', async () => {
    const prisma = createPrismaMock();
    prisma.dictionaryCategory.findFirst.mockResolvedValue({ ...category, categoryCode: 'PROJECT_TYPE' });
    prisma.dictionaryItem.findFirst.mockResolvedValue(null);
    prisma.dictionaryItem.create.mockImplementation(({ data }) => item({ ...data, itemCode: null }));
    const service = new FieldConfigurationService(prisma as unknown as PrismaService);
    await service.create(category.id, { name: '试点项目', sortOrder: 80, status: 'Inactive' }, 'admin-id');
    expect(prisma.dictionaryItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ itemLabel: '试点项目', status: 'Inactive', createdBy: 'admin-id', updatedBy: 'admin-id' }) });
  });

  it('restores a soft-deleted value by stable code after its label changed', async () => {
    const prisma = createPrismaMock();
    prisma.dictionaryCategory.findFirst.mockResolvedValue({ ...category, categoryCode: 'PROJECT_TYPE' });
    prisma.dictionaryItem.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(item({ itemLabel: '旧名称', itemCode: 'PILOT', itemValue: 'PILOT', deletedAt: new Date() }));
    prisma.dictionaryItem.update.mockImplementation(({ data }) => item({ ...data }));
    const service = new FieldConfigurationService(prisma as unknown as PrismaService);

    await expect(service.create(category.id, {
      name: '新名称', code: 'PILOT', sortOrder: 80,
    }, 'admin-id')).resolves.toMatchObject({ name: '新名称', code: 'PILOT', status: 'Active' });
    expect(prisma.dictionaryItem.create).not.toHaveBeenCalled();
    expect(prisma.dictionaryItem.update).toHaveBeenCalledWith({
      where: { id: 'item-id' },
      data: expect.objectContaining({ itemLabel: '新名称', itemCode: 'PILOT', itemValue: 'PILOT', deletedAt: null }),
    });
  });

  it('rejects an ambiguous restore across different soft-deleted records', async () => {
    const prisma = createPrismaMock();
    prisma.dictionaryCategory.findFirst.mockResolvedValue({ ...category, categoryCode: 'PROJECT_TYPE' });
    prisma.dictionaryItem.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(item({ id: 'deleted-by-label', itemLabel: '试点项目', itemCode: 'OLD_CODE', deletedAt: new Date() }))
      .mockResolvedValueOnce(item({ id: 'deleted-by-code', itemLabel: '旧项目', itemCode: 'PILOT', deletedAt: new Date() }));
    const service = new FieldConfigurationService(prisma as unknown as PrismaService);

    await expect(service.create(category.id, {
      name: '试点项目', code: 'PILOT', sortOrder: 80,
    }, 'admin-id')).rejects.toThrow('字段名称和编码分别属于不同的已删除记录');
    expect(prisma.dictionaryItem.update).not.toHaveBeenCalled();
  });

  it('rejects deleting a referenced custom value and suggests preserving it', async () => {
    const prisma = createPrismaMock();
    prisma.dictionaryItem.findUnique.mockResolvedValue(item());
    prisma.project.count.mockResolvedValue(2);
    const service = new FieldConfigurationService(prisma as unknown as PrismaService);
    await expect(service.remove('item-id', 'admin-id')).rejects.toThrow('该字段值已被业务引用，不能删除');
    expect(prisma.dictionaryItem.delete).not.toHaveBeenCalled();
  });

  it('rejects deleting a system default even when it has no references', async () => {
    const prisma = createPrismaMock();
    prisma.dictionaryItem.findUnique.mockResolvedValue(item({ isSystemDefault: true }));
    const service = new FieldConfigurationService(prisma as unknown as PrismaService);
    await expect(service.remove('item-id', 'admin-id')).rejects.toThrow('系统初始化字段不可删除，请改为停用');
  });

  it('soft deletes an unreferenced custom value', async () => {
    const prisma = createPrismaMock();
    prisma.dictionaryItem.findUnique.mockResolvedValue(item());
    const service = new FieldConfigurationService(prisma as unknown as PrismaService);
    await expect(service.remove('item-id', 'admin-id')).resolves.toBeNull();
    expect(prisma.dictionaryItem.update).toHaveBeenCalledWith({
      where: { id: 'item-id' },
      data: expect.objectContaining({ status: 'Inactive', updatedBy: 'admin-id' }),
    });
  });

  it('batch reads only active, non-deleted options in requested order', async () => {
    const prisma = createPrismaMock();
    prisma.dictionaryCategory.findMany.mockResolvedValue([{
      categoryCode: 'COUNTRY',
      categoryName: '国家',
      items: [{ id: 'item-id', itemValue: 'CN', itemLabel: '中国', itemCode: 'CN', sortOrder: 10 }],
    }]);
    const service = new FieldConfigurationService(prisma as unknown as PrismaService);

    await expect(service.findEnabledBatch(['CURRENCY', 'country', 'COUNTRY'])).resolves.toEqual([
      { code: 'COUNTRY', name: '国家', values: [{ id: 'item-id', value: 'CN', name: '中国', code: 'CN', sortOrder: 10 }] },
    ]);
    expect(prisma.dictionaryCategory.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { categoryCode: { in: ['CURRENCY', 'COUNTRY'] }, status: 'Active' },
    }));
  });

  it('prevents changing stable system default codes', async () => {
    const prisma = createPrismaMock();
    prisma.dictionaryItem.findUnique.mockResolvedValue(item({ isSystemDefault: true }));
    prisma.dictionaryItem.findFirst.mockResolvedValue(null);
    const service = new FieldConfigurationService(prisma as unknown as PrismaService);
    await expect(service.update('item-id', { name: '中国', code: 'CHN', sortOrder: 10 }, 'admin-id')).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows a referenced value to be deactivated for new records while preserving history', async () => {
    const prisma = createPrismaMock();
    prisma.dictionaryItem.findUnique.mockResolvedValue(item());
    prisma.dictionaryItem.findFirst.mockResolvedValue(null);
    prisma.project.count.mockResolvedValue(1);
    prisma.dictionaryItem.update.mockResolvedValue(item({ status: 'Inactive' }));
    const service = new FieldConfigurationService(prisma as unknown as PrismaService);

    await expect(service.update('item-id', {
      name: '中国', code: 'CN', sortOrder: 10, status: 'Inactive',
    }, 'admin-id')).resolves.toMatchObject({ status: 'Inactive' });
    expect(prisma.dictionaryItem.update).toHaveBeenCalled();
  });
});
