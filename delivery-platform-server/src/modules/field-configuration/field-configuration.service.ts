import { randomUUID } from 'node:crypto';

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

import type {
  CreateFieldConfigurationDto,
  CreateFieldValueDto,
  FieldConfigurationSortItemDto,
  FieldValueSortItemDto,
  QueryFieldConfigurationsDto,
  QueryFieldValuesDto,
  UpdateFieldConfigurationDto,
  UpdateFieldValueDto,
} from './dto/field-configuration.dto';

export const FIELD_CATEGORY_CODES = [
  'COUNTRY', 'CUSTOMER_TYPE', 'CONTRACT_TYPE', 'PRODUCT_TYPE', 'PROJECT_KEYWORD',
  'CURRENCY', 'PROJECT_STAGE', 'PROJECT_STATUS', 'JOB_POSITION', 'PROJECT_TYPE',
  'FILE_TYPE',
] as const;

const CODE_REQUIRED = new Set(['COUNTRY', 'CURRENCY']);

interface ReferenceSource { module: string; count: number }
interface ReferenceStatus { referenced: boolean; total: number; sources: ReferenceSource[] }

@Injectable()
export class FieldConfigurationService {
  constructor(private readonly prisma: PrismaService) {}

  async findConfigurations(query: QueryFieldConfigurationsDto = {}) {
    const fields = await this.prisma.dictionaryCategory.findMany({
      where: query.includeDisabled ? undefined : { status: 'Active' },
      include: {
        items: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { itemLabel: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { categoryName: 'asc' }],
    });
    return fields
      .filter((field) => !query.moduleCode || this.toStringArray(field.visibleScopes).includes(query.moduleCode))
      .map((field) => this.toFieldConfiguration(field));
  }

  async findConfigurationsByModule(moduleCode: string, includeDisabled = false) {
    return this.findConfigurations({ moduleCode, includeDisabled });
  }

  async findBusinessConfigurationsByModule(moduleCode: string) {
    return this.findConfigurations({ moduleCode, includeDisabled: true });
  }

  async assertConfiguredValue(
    fieldCode: string,
    value?: string | null,
    currentValue?: string | null,
  ): Promise<void> {
    if (value === undefined || value === null || value === '' || value === currentValue) return;
    const configured = await this.prisma.dictionaryItem.findFirst({
      where: {
        itemValue: value,
        status: 'Active',
        deletedAt: null,
        category: {
          categoryCode: fieldCode.toUpperCase(),
          status: 'Active',
        },
      },
      select: { id: true },
    });
    if (!configured) throw new BadRequestException('提交值不是当前启用的字段配置项');
  }

  async getConfigurationVersion() {
    const [categoryVersion, itemVersion] = await Promise.all([
      this.prisma.dictionaryCategory.aggregate({
        _max: { updatedAt: true, revision: true },
        _sum: { revision: true },
      }),
      this.prisma.dictionaryItem.aggregate({
        where: { deletedAt: null },
        _max: { updatedAt: true },
      }),
    ]);
    const updatedAt = [categoryVersion._max.updatedAt, itemVersion._max.updatedAt]
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    return {
      version: `${categoryVersion._sum.revision ?? 0}-${updatedAt?.getTime() ?? 0}`,
      revision: categoryVersion._max.revision ?? 0,
      updatedAt,
    };
  }

  async isFieldCodeAvailable(fieldCode: string, excludeId?: string) {
    const normalizedCode = fieldCode.toUpperCase();
    const existing = await this.prisma.dictionaryCategory.findFirst({
      where: {
        categoryCode: normalizedCode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return { fieldCode: normalizedCode, available: !existing };
  }

  async createField(dto: CreateFieldConfigurationDto, actorId: string) {
    const normalizedCode = dto.fieldCode.toUpperCase();
    const availability = await this.isFieldCodeAvailable(normalizedCode);
    if (!availability.available) throw new ConflictException('字段编码已存在');
    const field = await this.prisma.dictionaryCategory.create({
      data: {
        categoryCode: normalizedCode,
        categoryName: dto.fieldName,
        fieldType: dto.fieldType,
        required: dto.required ?? false,
        defaultValue: this.toJsonValue(dto.defaultValue),
        visibleScopes: dto.visibleScopes ?? [],
        permissions: this.toPermissions(dto.permissions),
        description: dto.description || null,
        status: dto.enabled === false ? 'Inactive' : 'Active',
        sortOrder: dto.sort ?? 0,
        createdBy: actorId,
        updatedBy: actorId,
      },
      include: { items: true },
    });
    return this.toFieldConfiguration(field);
  }

  async updateField(id: string, dto: UpdateFieldConfigurationDto, actorId: string) {
    const current = await this.assertField(id);
    if (dto.fieldCode && dto.fieldCode.toUpperCase() !== current.categoryCode) {
      throw new ConflictException('字段编码是稳定标识，不允许修改');
    }
    const field = await this.prisma.dictionaryCategory.update({
      where: { id },
      data: {
        ...(dto.fieldName !== undefined ? { categoryName: dto.fieldName } : {}),
        ...(dto.fieldType !== undefined ? { fieldType: dto.fieldType } : {}),
        ...(dto.required !== undefined ? { required: dto.required } : {}),
        ...(dto.defaultValue !== undefined ? { defaultValue: this.toJsonValue(dto.defaultValue) } : {}),
        ...(dto.visibleScopes !== undefined ? { visibleScopes: dto.visibleScopes } : {}),
        ...(dto.permissions !== undefined ? { permissions: this.toPermissions(dto.permissions) } : {}),
        ...(dto.description !== undefined ? { description: dto.description || null } : {}),
        ...(dto.enabled !== undefined ? { status: dto.enabled ? 'Active' : 'Inactive' } : {}),
        ...(dto.sort !== undefined ? { sortOrder: dto.sort } : {}),
        revision: { increment: 1 },
        updatedBy: actorId,
      },
      include: {
        items: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { itemLabel: 'asc' }],
        },
      },
    });
    return this.toFieldConfiguration(field);
  }

  async changeFieldStatus(id: string, enabled: boolean, actorId: string) {
    return this.updateField(id, { enabled }, actorId);
  }

  async sortFields(items: FieldConfigurationSortItemDto[], actorId: string) {
    if (new Set(items.map((item) => item.id)).size !== items.length) {
      throw new BadRequestException('字段排序中存在重复记录');
    }
    const count = await this.prisma.dictionaryCategory.count({
      where: { id: { in: items.map((item) => item.id) } },
    });
    if (count !== items.length) throw new BadRequestException('字段排序包含不存在的字段');
    await this.prisma.$transaction(items.map((item) => this.prisma.dictionaryCategory.update({
      where: { id: item.id },
      data: { sortOrder: item.sort, revision: { increment: 1 }, updatedBy: actorId },
    })));
    return this.findConfigurations({ includeDisabled: true });
  }

  async findCategories() {
    return this.prisma.dictionaryCategory.findMany({
      where: { categoryCode: { in: [...FIELD_CATEGORY_CODES] } },
      select: { id: true, categoryCode: true, categoryName: true, fieldType: true, required: true, defaultValue: true, visibleScopes: true, permissions: true, revision: true, description: true, sortOrder: true, isSystem: true, status: true, createdBy: true, updatedBy: true, createdAt: true, updatedAt: true, _count: { select: { items: { where: { deletedAt: null } } } } },
      orderBy: [{ sortOrder: 'asc' }, { categoryName: 'asc' }],
    });
  }

  async findCategory(id: string) {
    const category = await this.assertCategory(id);
    const valueCount = await this.prisma.dictionaryItem.count({ where: { categoryId: id, deletedAt: null } });
    return { ...category, valueCount };
  }

  async findValues(categoryId: string, query: QueryFieldValuesDto = {}) {
    await this.assertCategory(categoryId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 100);
    const where = {
      categoryId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { itemLabel: { contains: query.keyword } },
              { itemCode: { contains: query.keyword } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.dictionaryItem.count({ where }),
      this.prisma.dictionaryItem.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { itemLabel: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: items.map((item) => this.toValue(item)),
      page,
      pageSize,
      total,
    };
  }

  async findEnabled(code: string) {
    const category = await this.prisma.dictionaryCategory.findFirst({
      where: { categoryCode: code.toUpperCase() },
      select: {
        categoryCode: true,
        categoryName: true,
        fieldType: true,
        required: true,
        defaultValue: true,
        visibleScopes: true,
        permissions: true,
        revision: true,
        status: true,
        updatedAt: true,
        items: {
          where: { deletedAt: null },
          select: { id: true, itemValue: true, itemLabel: true, itemCode: true, sortOrder: true, status: true },
          orderBy: [{ sortOrder: 'asc' }, { itemLabel: 'asc' }],
        },
      },
    });
    if (!category) throw new NotFoundException('字段分类不存在');
    return {
      code: category.categoryCode,
      name: category.categoryName,
      fieldType: category.fieldType,
      required: category.required,
      enabled: category.status === 'Active',
      defaultValue: category.defaultValue,
      visibleScopes: this.toStringArray(category.visibleScopes),
      permissions: category.permissions,
      revision: category.revision,
      updatedAt: category.updatedAt,
      values: category.items.map((item) => ({
        id: item.id,
        value: item.itemValue,
        name: item.itemLabel,
        code: item.itemCode,
        sortOrder: item.sortOrder,
        enabled: item.status === 'Active',
      })),
    };
  }

  async create(categoryId: string, dto: CreateFieldValueDto, actorId: string) {
    const category = await this.assertCategory(categoryId);
    this.assertRequiredCode(category.categoryCode, dto.code);
    await this.assertDuplicate(categoryId, dto.name, dto.code);
    const deletedByLabel = await this.prisma.dictionaryItem.findFirst({
      where: {
        categoryId,
        deletedAt: { not: null },
        itemLabel: dto.name,
      },
    });
    const deletedByCode = dto.code
      ? await this.prisma.dictionaryItem.findFirst({
          where: {
            categoryId,
            deletedAt: { not: null },
            OR: [{ itemCode: dto.code }, { itemValue: dto.code }],
          },
        })
      : null;
    if (deletedByLabel && deletedByCode && deletedByLabel.id !== deletedByCode.id) {
      throw new ConflictException('字段名称和编码分别属于不同的已删除记录，请使用不冲突的名称或编码');
    }
    const deleted = deletedByCode ?? deletedByLabel;
    if (deleted) {
      const restored = await this.prisma.dictionaryItem.update({
        where: { id: deleted.id },
        data: {
          itemLabel: dto.name,
          itemCode: dto.code ?? null,
          itemValue: dto.code ?? deleted.itemValue,
          description: dto.description || null,
          sortOrder: dto.sortOrder ?? deleted.sortOrder,
          status: dto.status ?? 'Active',
          deletedAt: null,
          updatedBy: actorId,
        },
      });
      await this.bumpCategoryRevision(categoryId, actorId);
      return this.toValue(restored);
    }
    const item = await this.prisma.dictionaryItem.create({
      data: {
        categoryId,
        itemValue: dto.code ?? `CUSTOM_${randomUUID().replaceAll('-', '').toUpperCase()}`,
        itemLabel: dto.name,
        itemCode: dto.code ?? null,
        description: dto.description || null,
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status ?? 'Active',
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.bumpCategoryRevision(categoryId, actorId);
    return this.toValue(item);
  }

  async update(id: string, dto: UpdateFieldValueDto, actorId: string) {
    const current = await this.assertItem(id);
    this.assertRequiredCode(current.category.categoryCode, dto.code);
    await this.assertDuplicate(current.categoryId, dto.name, dto.code, id);
    const codeChanged = (current.itemCode ?? null) !== (dto.code ?? null);
    if (codeChanged && current.isSystemDefault) {
      throw new ConflictException('系统初始化字段的稳定编码不可修改');
    }
    if (codeChanged) await this.assertNotReferenced(current, '修改编码');
    const item = await this.prisma.dictionaryItem.update({
      where: { id },
      data: {
        itemLabel: dto.name,
        itemCode: dto.code ?? null,
        description: dto.description === undefined ? current.description : dto.description || null,
        itemValue: dto.code ?? current.itemValue,
        sortOrder: dto.sortOrder ?? current.sortOrder,
        updatedBy: actorId,
      },
    });
    await this.bumpCategoryRevision(current.categoryId, actorId);
    return this.toValue(item);
  }

  async changeStatus(id: string, status: 'Active' | 'Inactive', actorId: string) {
    const current = await this.assertItem(id);
    if (status === 'Inactive' && current.status !== 'Inactive') await this.referenceStatus(current);
    const item = await this.prisma.dictionaryItem.update({ where: { id }, data: { status, updatedBy: actorId } });
    await this.bumpCategoryRevision(current.categoryId, actorId);
    return this.toValue(item);
  }

  async sort(categoryId: string, items: FieldValueSortItemDto[], actorId: string) {
    await this.assertCategory(categoryId);
    if (new Set(items.map((item) => item.id)).size !== items.length) throw new BadRequestException('批量排序中存在重复字段值');
    const count = await this.prisma.dictionaryItem.count({ where: { categoryId, id: { in: items.map((item) => item.id) }, deletedAt: null } });
    if (count !== items.length) throw new BadRequestException('批量排序包含不属于当前分类的字段值');
    await this.prisma.$transaction(items.map((item) => this.prisma.dictionaryItem.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder, updatedBy: actorId } })));
    const sorted = await this.prisma.dictionaryItem.findMany({
      where: { categoryId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { itemLabel: 'asc' }],
    });
    await this.bumpCategoryRevision(categoryId, actorId);
    return sorted.map((item) => this.toValue(item));
  }

  async getReferenceStatus(id: string): Promise<ReferenceStatus> {
    return this.referenceStatus(await this.assertItem(id));
  }

  async remove(id: string, actorId: string): Promise<null> {
    const current = await this.assertItem(id);
    await this.assertNotReferenced(current, '删除');
    if (current.isSystemDefault) throw new ConflictException('系统初始化字段不可删除，请改为停用');
    await this.prisma.dictionaryItem.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'Inactive', updatedBy: actorId },
    });
    await this.bumpCategoryRevision(current.categoryId, actorId);
    return null;
  }

  async findEnabledBatch(codes: string[]) {
    const normalizedCodes = [...new Set(codes.map((code) => code.toUpperCase()))];
    const categories = await this.prisma.dictionaryCategory.findMany({
      where: { categoryCode: { in: normalizedCodes } },
      select: {
        categoryCode: true,
        categoryName: true,
        fieldType: true,
        required: true,
        defaultValue: true,
        visibleScopes: true,
        permissions: true,
        revision: true,
        status: true,
        updatedAt: true,
        items: {
          where: { deletedAt: null },
          select: { id: true, itemValue: true, itemLabel: true, itemCode: true, sortOrder: true, status: true },
          orderBy: [{ sortOrder: 'asc' }, { itemLabel: 'asc' }],
        },
      },
    });
    const byCode = new Map(categories.map((category) => [category.categoryCode, {
      code: category.categoryCode,
      name: category.categoryName,
      fieldType: category.fieldType,
      required: category.required,
      enabled: category.status === 'Active',
      defaultValue: category.defaultValue,
      visibleScopes: this.toStringArray(category.visibleScopes),
      permissions: category.permissions,
      revision: category.revision,
      updatedAt: category.updatedAt,
      values: category.items.map((item) => ({
        id: item.id,
        value: item.itemValue,
        name: item.itemLabel,
        code: item.itemCode,
        sortOrder: item.sortOrder,
        enabled: item.status === 'Active',
      })),
    }]));
    return normalizedCodes.flatMap((code) => byCode.get(code) ?? []);
  }

  private async assertCategory(id: string) {
    const category = await this.prisma.dictionaryCategory.findFirst({ where: { id } });
    if (!category) throw new NotFoundException('字段分类不存在');
    return category;
  }

  private async assertField(id: string) {
    const field = await this.prisma.dictionaryCategory.findUnique({
      where: { id },
      include: { items: { where: { deletedAt: null } } },
    });
    if (!field) throw new NotFoundException('字段配置不存在');
    return field;
  }

  private async bumpCategoryRevision(categoryId: string, actorId: string): Promise<void> {
    await this.prisma.dictionaryCategory.update({
      where: { id: categoryId },
      data: { revision: { increment: 1 }, updatedBy: actorId },
    });
  }

  private async assertItem(id: string) {
    const item = await this.prisma.dictionaryItem.findUnique({ where: { id }, include: { category: true } });
    if (!item || item.deletedAt) throw new NotFoundException('字段值不存在');
    return item;
  }

  private assertRequiredCode(categoryCode: string, code?: string): void {
    if (CODE_REQUIRED.has(categoryCode) && !code) throw new BadRequestException('国家和币种字段必须填写编码');
  }

  private async assertDuplicate(categoryId: string, name: string, code?: string, excludeId?: string): Promise<void> {
    const duplicate = await this.prisma.dictionaryItem.findFirst({
      where: { categoryId, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}), OR: [{ itemLabel: name }, ...(code ? [{ itemCode: code }] : [])] },
      select: { itemLabel: true, itemCode: true },
    });
    if (!duplicate) return;
    if (duplicate.itemLabel === name) throw new ConflictException('同一分类下字段名称不得重复');
    throw new ConflictException('同一分类下非空编码不得重复');
  }

  private async assertNotReferenced(item: Awaited<ReturnType<FieldConfigurationService['assertItem']>>, action: string): Promise<void> {
    const status = await this.referenceStatus(item);
    if (status.referenced) throw new ConflictException(`该字段值已被业务引用，不能${action}，请保留并继续使用`);
  }

  private async referenceStatus(item: Awaited<ReturnType<FieldConfigurationService['assertItem']>>): Promise<ReferenceStatus> {
    const value = item.itemValue;
    const code = item.category.categoryCode;
    const checks: Array<Promise<ReferenceSource>> = [];
    const add = (module: string, promise: Promise<number>) => checks.push(promise.then((count) => ({ module, count })));
    if (code === 'COUNTRY') {
      add('项目台账', this.prisma.project.count({ where: { countryCode: value, deletedAt: null } }));
      add('档案模板', this.prisma.archiveTemplate.count({ where: { countryCode: value } }));
      add('检查模板', this.prisma.checklistTemplate.count({ where: { countryCode: value } }));
      add('文档模板', this.prisma.documentTemplate.count({ where: { countryCode: value } }));
    } else if (code === 'CURRENCY') {
      add('项目台账', this.prisma.project.count({ where: { OR: [{ contractCurrency: value }, { baseCurrency: value }], deletedAt: null } }));
      add('项目收付款', this.prisma.projectPayment.count({ where: { OR: [{ originalCurrency: value }, { convertedCurrency: value }] } }));
    } else if (code === 'CUSTOMER_TYPE') {
      add('项目台账', this.prisma.project.count({ where: { customerType: value, deletedAt: null } }));
    } else if (code === 'CONTRACT_TYPE') {
      add('项目台账', this.prisma.project.count({ where: { contractType: value, deletedAt: null } }));
    } else if (code === 'PRODUCT_TYPE') {
      add('项目台账', this.prisma.project.count({ where: { product: value, deletedAt: null } }));
    } else if (code === 'PROJECT_KEYWORD') {
      add('项目台账', this.prisma.project.count({ where: { keywords: { array_contains: value }, deletedAt: null } }));
    } else if (code === 'PROJECT_STAGE') {
      add('项目台账', this.prisma.project.count({ where: { currentStage: value, deletedAt: null } }));
      add('项目进度记录', this.prisma.projectProcessRecord.count({ where: { stageCode: value } }));
      add('检查模板', this.prisma.checklistTemplate.count({ where: { stageCode: value } }));
      add('文档模板', this.prisma.documentTemplate.count({ where: { stageCode: value } }));
    } else if (code === 'PROJECT_STATUS') {
      add('项目台账', this.prisma.project.count({ where: { status: value, deletedAt: null } }));
    } else if (code === 'PROJECT_TYPE') {
      add('项目台账', this.prisma.project.count({ where: { projectType: value, deletedAt: null } }));
      add('档案模板', this.prisma.archiveTemplate.count({ where: { projectType: value } }));
      add('检查模板', this.prisma.checklistTemplate.count({ where: { projectType: value } }));
      add('文档模板', this.prisma.documentTemplate.count({ where: { projectType: value } }));
    } else if (code === 'STANDARD_CATEGORY') {
      add('标准库', this.prisma.standard.count({ where: { category: value } }));
    } else if (code === 'KNOWLEDGE_CATEGORY') {
      add('知识库', this.prisma.knowledgeItem.count({
        where: { category: { fieldOptionId: item.id } },
      }));
    } else if (code === 'FILE_TYPE') {
      add(
        '档案模板',
        this.prisma.archiveTemplateVersionItem.count({
          where: { allowedExtensions: { array_contains: value } },
        }),
      );
      add(
        '项目档案',
        this.prisma.projectArchiveEntry.count({
          where: { allowedExtensions: { array_contains: value } },
        }),
      );
    }
    const sources = (await Promise.all(checks)).filter((source) => source.count > 0);
    const total = sources.reduce((sum, source) => sum + source.count, 0);
    return { referenced: total > 0, total, sources };
  }

  private toValue(item: { id: string; categoryId: string; itemValue: string; itemLabel: string; itemCode: string | null; description: string | null; extraData: unknown; sortOrder: number; status: string; isSystemDefault: boolean; createdBy: string | null; updatedBy: string | null; createdAt: Date; updatedAt: Date }) {
    return { id: item.id, categoryId: item.categoryId, value: item.itemValue, name: item.itemLabel, code: item.itemCode, description: item.description, metadata: item.extraData, sortOrder: item.sortOrder, status: item.status, isSystemDefault: item.isSystemDefault, createdBy: item.createdBy, updatedBy: item.updatedBy, createdAt: item.createdAt, updatedAt: item.updatedAt };
  }

  private toFieldConfiguration(field: {
    id: string;
    categoryCode: string;
    categoryName: string;
    fieldType: string;
    required: boolean;
    defaultValue: unknown;
    visibleScopes: unknown;
    permissions: unknown;
    description: string | null;
    status: string;
    sortOrder: number;
    revision: number;
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    items: Array<{
      id: string;
      itemValue: string;
      itemLabel: string;
      itemCode: string | null;
      sortOrder: number;
      status: string;
    }>;
  }) {
    return {
      id: field.id,
      fieldCode: field.categoryCode,
      fieldName: field.categoryName,
      fieldType: field.fieldType,
      required: field.required,
      enabled: field.status === 'Active',
      defaultValue: field.defaultValue,
      sort: field.sortOrder,
      options: field.items.map((item) => ({
        id: item.id,
        label: item.itemLabel,
        value: item.itemValue,
        code: item.itemCode,
        sort: item.sortOrder,
        enabled: item.status === 'Active',
      })),
      visibleScopes: this.toStringArray(field.visibleScopes),
      permissions: field.permissions,
      description: field.description,
      revision: field.revision,
      createdBy: field.createdBy,
      updatedBy: field.updatedBy,
      createdAt: field.createdAt,
      updatedAt: field.updatedAt,
    };
  }

  private toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull | undefined {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  }

  private toPermissions(value?: { view?: string[]; edit?: string[] }): Prisma.InputJsonObject {
    return {
      view: value?.view ?? [],
      edit: value?.edit ?? [],
    };
  }
}
