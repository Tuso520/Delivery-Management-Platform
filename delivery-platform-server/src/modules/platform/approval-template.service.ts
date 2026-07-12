import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { OperationLogService } from '../operation-log/operation-log.service';
import { REGISTERED_REVIEW_SOURCE_TYPES } from '../review/review-business.service';

import {
  CreateTargetApprovalTemplateDto,
  QueryTargetApprovalTemplateDto,
  TARGET_APPROVAL_BUSINESS_TYPES,
  TargetApprovalBusinessType,
  TargetApprovalStepDto,
  UpdateTargetApprovalTemplateDto,
} from './dto/approval-template.dto';

const TARGET_REVIEW_SOURCE_BY_APPROVAL_TYPE: Partial<Record<TargetApprovalBusinessType, string>> = {
  PROJECT_CREATE: 'PROJECT_CREATE',
  PROJECT_ARCHIVE_FILE: 'PROJECT_ARCHIVE',
  STANDARD: 'STANDARD',
  KNOWLEDGE: 'KNOWLEDGE',
  ARCHIVE_TEMPLATE: 'ARCHIVE_TEMPLATE',
};

const REGISTERED_REVIEW_SOURCE_SET = new Set<string>(REGISTERED_REVIEW_SOURCE_TYPES);

const targetTemplateWithSteps = Prisma.validator<Prisma.ApprovalTemplateDefaultArgs>()({
  include: { steps: { orderBy: { stepOrder: 'asc' } } },
});

type TargetTemplateRecord = Prisma.ApprovalTemplateGetPayload<typeof targetTemplateWithSteps>;

@Injectable()
export class ApprovalTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationLog: OperationLogService,
  ) {}

  async findAll(query: QueryTargetApprovalTemplateDto) {
    const { page = 1, pageSize = 20, keyword, businessType, enabled } = query;
    const where: Prisma.ApprovalTemplateWhereInput = {
      deletedAt: null,
      businessType: businessType ? businessType : { in: [...TARGET_APPROVAL_BUSINESS_TYPES] },
      ...(enabled !== undefined && { isEnabled: enabled }),
      ...(keyword && {
        OR: [{ templateCode: { contains: keyword } }, { templateName: { contains: keyword } }],
      }),
    };
    const [total, templates] = await Promise.all([
      this.prisma.approvalTemplate.count({ where }),
      this.prisma.approvalTemplate.findMany({
        where,
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    return {
      items: templates.map((template) => this.toResponse(template)),
      page,
      pageSize,
      total,
    };
  }

  async create(dto: CreateTargetApprovalTemplateDto, userId: string) {
    this.assertRegisteredAdapter(dto.businessType);
    this.assertValidSteps(dto.steps);
    const duplicate = await this.prisma.approvalTemplate.findUnique({
      where: { templateCode: dto.templateCode },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('审批模板编码已存在');

    const template = await this.prisma.$transaction(async (tx) => {
      const created = await tx.approvalTemplate.create({
        data: {
          templateCode: dto.templateCode,
          templateName: dto.templateName,
          businessType: dto.businessType,
          countryCode: dto.countryCode ?? null,
          isEnabled: dto.enabled ?? true,
        },
      });
      await tx.approvalStep.createMany({
        data: dto.steps.map((step) => ({ templateId: created.id, ...this.toStepData(step) })),
      });
      return tx.approvalTemplate.findUnique({
        where: { id: created.id },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
    });
    if (!template) throw new NotFoundException('审批模板创建失败');
    await this.logChange(userId, 'create', template.id, template);
    return this.toResponse(template);
  }

  async update(id: string, dto: UpdateTargetApprovalTemplateDto, userId: string) {
    const current = await this.findActive(id);
    const businessType = dto.businessType ?? (current.businessType as TargetApprovalBusinessType);
    this.assertRegisteredAdapter(businessType);
    if (dto.steps) this.assertValidSteps(dto.steps);
    if (dto.templateCode && dto.templateCode !== current.templateCode) {
      const duplicate = await this.prisma.approvalTemplate.findUnique({
        where: { templateCode: dto.templateCode },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('审批模板编码已存在');
    }
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException('至少需要提供一个审批模板字段');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.approvalTemplate.update({
        where: { id },
        data: {
          ...(dto.templateCode !== undefined && {
            templateCode: dto.templateCode,
          }),
          ...(dto.templateName !== undefined && {
            templateName: dto.templateName,
          }),
          ...(dto.businessType !== undefined && {
            businessType: dto.businessType,
          }),
          ...(dto.countryCode !== undefined && {
            countryCode: dto.countryCode || null,
          }),
          ...(dto.enabled !== undefined && { isEnabled: dto.enabled }),
        },
      });
      if (dto.steps) {
        await tx.approvalStep.deleteMany({ where: { templateId: id } });
        await tx.approvalStep.createMany({
          data: dto.steps.map((step) => ({ templateId: id, ...this.toStepData(step) })),
        });
      }
      return tx.approvalTemplate.findUnique({
        where: { id },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
    });
    if (!updated) throw new NotFoundException('审批模板不存在');
    await this.logChange(userId, 'update', id, updated);
    return this.toResponse(updated);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findActive(id);
    await this.prisma.approvalTemplate.update({
      where: { id },
      data: { isEnabled: false, deletedAt: new Date() },
    });
    await this.logChange(userId, 'delete', id, { deleted: true });
  }

  async toggle(id: string, userId: string) {
    const current = await this.findActive(id);
    const enabled = !current.isEnabled;
    if (enabled) {
      this.assertRegisteredAdapter(current.businessType as TargetApprovalBusinessType);
      if (current.steps.length === 0) {
        throw new BadRequestException('没有审批步骤的模板不能启用');
      }
    }
    const updated = await this.prisma.approvalTemplate.update({
      where: { id },
      data: { isEnabled: enabled },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    await this.logChange(userId, 'toggle', id, { enabled });
    return this.toResponse(updated);
  }

  private assertRegisteredAdapter(businessType: TargetApprovalBusinessType): void {
    if (!TARGET_APPROVAL_BUSINESS_TYPES.includes(businessType)) {
      throw new BadRequestException(`审批业务类型 ${businessType} 不受支持`);
    }
    const sourceType = TARGET_REVIEW_SOURCE_BY_APPROVAL_TYPE[businessType];
    if (!sourceType || !REGISTERED_REVIEW_SOURCE_SET.has(sourceType)) {
      throw new BadRequestException(`审批业务类型 ${businessType} 尚未注册可回写的审核适配器`);
    }
  }

  private assertValidSteps(steps: TargetApprovalStepDto[]): void {
    const orders = steps.map((step) => step.stepOrder).sort((a, b) => a - b);
    if (new Set(orders).size !== orders.length) {
      throw new BadRequestException('审批步骤序号不能重复');
    }
    if (orders.some((order, index) => order !== index + 1)) {
      throw new BadRequestException('审批步骤序号必须从 1 开始连续递增');
    }
    for (const step of steps) {
      const approverValues = step.approverValues.map((value) => value.trim()).filter(Boolean);
      if (approverValues.length === 0 || new Set(approverValues).size !== approverValues.length) {
        throw new BadRequestException('每个审批步骤必须配置不重复的审批对象');
      }
      if (step.mode === 'SINGLE' && approverValues.length !== 1) {
        throw new BadRequestException('单人审核步骤只能配置一个审批对象');
      }
      if (
        step.mode === 'ANY_N' &&
        (!step.requiredCount || step.requiredCount > approverValues.length)
      ) {
        throw new BadRequestException('任意人数审核必须配置有效的通过人数');
      }
    }
  }

  private toStepData(step: TargetApprovalStepDto) {
    const approverValues = step.approverValues.map((value) => value.trim());
    const requiredCount =
      step.mode === 'SINGLE'
        ? 1
        : step.mode === 'ANY_N'
          ? (step.requiredCount as number)
          : approverValues.length;
    return {
      stepOrder: step.stepOrder,
      stepName: step.stepName,
      mode: step.mode,
      requiredCount,
      approverType: step.approverType,
      approverValues,
    };
  }

  private async findActive(id: string): Promise<TargetTemplateRecord> {
    const template = await this.prisma.approvalTemplate.findFirst({
      where: {
        id,
        deletedAt: null,
        businessType: { in: [...TARGET_APPROVAL_BUSINESS_TYPES] },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!template) throw new NotFoundException('审批模板不存在');
    return template;
  }

  private toResponse(template: TargetTemplateRecord) {
    return {
      id: template.id,
      templateCode: template.templateCode,
      templateName: template.templateName,
      businessType: template.businessType,
      countryCode: template.countryCode,
      enabled: template.isEnabled,
      steps: template.steps,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  private async logChange(
    userId: string,
    action: string,
    targetId: string,
    afterData: unknown,
  ): Promise<void> {
    await this.operationLog.log({
      userId,
      module: 'approval_config',
      action,
      targetType: 'approval_template',
      targetId,
      afterData: afterData as Record<string, unknown>,
    });
  }
}
