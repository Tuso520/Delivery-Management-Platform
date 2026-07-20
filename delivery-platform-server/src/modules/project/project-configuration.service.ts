import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

const PROJECT_DICTIONARIES = {
  projectTypes: ['PROJECT_TYPE', 'project_type'],
  contractTypes: ['CONTRACT_TYPE', 'contract_type'],
  productTypes: ['PRODUCT_TYPE', 'product_type'],
  projectKeywords: ['PROJECT_KEYWORD', 'project_keyword'],
} as const;

// Existing projects and integrations may still submit these pre-field-center
// values. They remain write-compatible without becoming selectable defaults.
const LEGACY_PROJECT_TYPE_VALUES = new Set(['DATA_CENTER', 'LIGHTWEIGHT']);

type ProjectDictionaryKey = keyof typeof PROJECT_DICTIONARIES;

export interface ProjectConfigurationOption {
  value: string;
  label: string;
  extraData: unknown;
  status: string;
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

  async getConfiguration(includeInactive = false): Promise<ProjectConfiguration> {
    const categories = await this.prisma.dictionaryCategory.findMany({
      where: {
        categoryCode: { in: Object.values(PROJECT_DICTIONARIES).flat() },
        status: 'Active',
      },
      select: {
        categoryCode: true,
        items: {
          where: { deletedAt: null, ...(!includeInactive ? { status: 'Active' } : {}) },
          select: { itemValue: true, itemLabel: true, extraData: true, status: true },
          orderBy: [{ sortOrder: 'asc' }, { itemLabel: 'asc' }],
        },
      },
    });

    const byCode = new Map(categories.map((category) => [category.categoryCode, category.items]));
    return Object.fromEntries(
      Object.entries(PROJECT_DICTIONARIES).map(([key, codes]) => [
        key,
        (codes.map((code) => byCode.get(code)).find((items) => items !== undefined) ?? []).map((item) => ({
          value: item.itemValue,
          label: item.itemLabel,
          extraData: item.extraData,
          status: item.status,
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
    this.assertValue(
      '项目类型',
      fields.projectType,
      configuration.projectTypes,
      LEGACY_PROJECT_TYPE_VALUES,
    );
    this.assertValue('合同类型', fields.contractType, configuration.contractTypes);
    this.assertValue('产品类型', fields.product, configuration.productTypes);
    for (const keyword of fields.keywords ?? []) {
      this.assertValue('项目关键词', keyword, configuration.projectKeywords);
    }
  }

  async validateUpdate(
    fields: ConfigurableProjectFields,
    current: ConfigurableProjectFields,
  ): Promise<void> {
    const configuration = await this.getConfiguration();
    this.assertValue('项目类型', fields.projectType, configuration.projectTypes, new Set([
      ...LEGACY_PROJECT_TYPE_VALUES,
      ...(current.projectType ? [current.projectType] : []),
    ]));
    this.assertValue('合同类型', fields.contractType, configuration.contractTypes, new Set(
      current.contractType ? [current.contractType] : [],
    ));
    this.assertValue('产品类型', fields.product, configuration.productTypes, new Set(
      current.product ? [current.product] : [],
    ));
    const currentKeywords = new Set(current.keywords ?? []);
    for (const keyword of fields.keywords ?? []) {
      this.assertValue('项目关键词', keyword, configuration.projectKeywords, currentKeywords);
    }
  }

  private assertValue(
    fieldName: string,
    value: string | undefined,
    options: ProjectConfigurationOption[],
    compatibleValues?: ReadonlySet<string>,
  ): void {
    if (
      value !== undefined &&
      !options.some((option) => option.value === value) &&
      !compatibleValues?.has(value)
    ) {
      throw new BadRequestException(`${fieldName}不是当前启用的配置项`);
    }
  }
}
