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
    extraData: null, status: 'Active', sortOrder: 10, isSystemDefault: false,
    createdBy: 'admin-id', updatedBy: 'admin-id', createdAt: new Date(), updatedAt: new Date(),
    category, ...overrides,
  };
}

describe('FieldConfigurationService', () => {
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
    await service.create(category.id, { name: '试点项目', sortOrder: 80 }, 'admin-id');
    expect(prisma.dictionaryItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ itemLabel: '试点项目', createdBy: 'admin-id', updatedBy: 'admin-id' }) });
  });

  it('rejects deleting a referenced custom value and suggests preserving it', async () => {
    const prisma = createPrismaMock();
    prisma.dictionaryItem.findUnique.mockResolvedValue(item());
    prisma.project.count.mockResolvedValue(2);
    const service = new FieldConfigurationService(prisma as unknown as PrismaService);
    await expect(service.remove('item-id')).rejects.toThrow('该字段值已被业务引用，不能删除');
    expect(prisma.dictionaryItem.delete).not.toHaveBeenCalled();
  });

  it('rejects deleting a system default even when it has no references', async () => {
    const prisma = createPrismaMock();
    prisma.dictionaryItem.findUnique.mockResolvedValue(item({ isSystemDefault: true }));
    const service = new FieldConfigurationService(prisma as unknown as PrismaService);
    await expect(service.remove('item-id')).rejects.toThrow('系统初始化字段不可删除，请改为停用');
  });

  it('deletes an unreferenced custom value', async () => {
    const prisma = createPrismaMock();
    prisma.dictionaryItem.findUnique.mockResolvedValue(item());
    const service = new FieldConfigurationService(prisma as unknown as PrismaService);
    await expect(service.remove('item-id')).resolves.toBeNull();
    expect(prisma.dictionaryItem.delete).toHaveBeenCalledWith({ where: { id: 'item-id' } });
  });

  it('prevents changing stable system default codes', async () => {
    const prisma = createPrismaMock();
    prisma.dictionaryItem.findUnique.mockResolvedValue(item({ isSystemDefault: true }));
    prisma.dictionaryItem.findFirst.mockResolvedValue(null);
    const service = new FieldConfigurationService(prisma as unknown as PrismaService);
    await expect(service.update('item-id', { name: '中国', code: 'CHN', sortOrder: 10 }, 'admin-id')).rejects.toBeInstanceOf(ConflictException);
  });
});
