import { BadRequestException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import { ProjectConfigurationService } from '../project-configuration.service';

describe('ProjectConfigurationService', () => {
  const categories = [
    ['project_type', 'FACTORY', '工厂'],
    ['contract_type', 'EPC', 'EPC'],
    ['product_type', 'DEEPSIGHT', 'DeepSight'],
    ['project_keyword', 'NEW_BUILD', '新建项目'],
  ].map(([categoryCode, itemValue, itemLabel]) => ({
    categoryCode,
    items: [{ itemValue, itemLabel, extraData: null }],
  }));
  const prisma = {
    dictionaryCategory: { findMany: jest.fn().mockResolvedValue(categories) },
  };
  const service = new ProjectConfigurationService(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('returns all project dictionaries from active database configuration', async () => {
    await expect(service.getConfiguration()).resolves.toEqual({
      projectTypes: [{ value: 'FACTORY', label: '工厂', extraData: null }],
      contractTypes: [{ value: 'EPC', label: 'EPC', extraData: null }],
      productTypes: [{ value: 'DEEPSIGHT', label: 'DeepSight', extraData: null }],
      projectKeywords: [{ value: 'NEW_BUILD', label: '新建项目', extraData: null }],
    });
    expect(prisma.dictionaryCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'Active' }),
      }),
    );
  });

  it('accepts only values enabled in the current project configuration', async () => {
    await expect(
      service.validate({
        projectType: 'FACTORY',
        contractType: 'EPC',
        product: 'DEEPSIGHT',
        keywords: ['NEW_BUILD'],
      }),
    ).resolves.toBeUndefined();
    await expect(service.validate({ projectType: 'DATA_CENTER' })).resolves.toBeUndefined();
    await expect(service.validate({ projectType: 'LIGHTWEIGHT' })).resolves.toBeUndefined();
    await expect(service.validate({ projectType: 'DISABLED_VALUE' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
