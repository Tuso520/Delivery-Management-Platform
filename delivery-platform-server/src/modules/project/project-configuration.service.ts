import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

const PROJECT_DICTIONARIES = {
  projectTypes: 'project_type',
  contractTypes: 'contract_type',
  productTypes: 'product_type',
  projectKeywords: 'project_keyword',
} as const;

type ProjectDictionaryKey = keyof typeof PROJECT_DICTIONARIES;

export interface ProjectConfigurationOption {
  value: string;
  label: string;
  extraData: unknown;
}

export type ProjectConfiguration = Record<ProjectDictionaryKey, ProjectConfigurationOption[]>;

interface ConfigurableProjectFields {
  projectType?: string;
  contractType?: string;
  product?: string;
  keywords?: string[];
}

@Injectable()
export class ProjectConfigurationService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfiguration(): Promise<ProjectConfiguration> {
    const categories = await this.prisma.dictionaryCategory.findMany({
      where: {
        categoryCode: { in: Object.values(PROJECT_DICTIONARIES) },
        status: 'Active',
      },
      select: {
        categoryCode: true,
        items: {
          where: { status: 'Active' },
          select: { itemValue: true, itemLabel: true, extraData: true },
          orderBy: [{ sortOrder: 'asc' }, { itemLabel: 'asc' }],
        },
      },
    });

    const byCode = new Map(categories.map((category) => [category.categoryCode, category.items]));
    return Object.fromEntries(
      Object.entries(PROJECT_DICTIONARIES).map(([key, code]) => [
        key,
        (byCode.get(code) ?? []).map((item) => ({
          value: item.itemValue,
          label: item.itemLabel,
          extraData: item.extraData,
        })),
      ]),
    ) as ProjectConfiguration;
  }

  async validate(fields: ConfigurableProjectFields): Promise<void> {
    if (
      fields.projectType === undefined &&
      fields.contractType === undefined &&
      fields.product === undefined &&
      fields.keywords === undefined
    ) {
      return;
    }
    const configuration = await this.getConfiguration();
    this.assertValue('项目类型', fields.projectType, configuration.projectTypes);
    this.assertValue('合同类型', fields.contractType, configuration.contractTypes);
    this.assertValue('产品类型', fields.product, configuration.productTypes);
    for (const keyword of fields.keywords ?? []) {
      this.assertValue('项目关键词', keyword, configuration.projectKeywords);
    }
  }

  private assertValue(
    fieldName: string,
    value: string | undefined,
    options: ProjectConfigurationOption[],
  ): void {
    if (value !== undefined && !options.some((option) => option.value === value)) {
      throw new BadRequestException(`${fieldName}不是当前启用的配置项`);
    }
  }
}
