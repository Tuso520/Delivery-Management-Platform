import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { OperationLogService } from '../operation-log/operation-log.service';

import { ApprovalBusinessService } from './approval-business.service';
import {
  CreateApprovalTaskDto,
  DecideApprovalTaskDto,
  QueryPlatformDto,
  UpsertApprovalTemplateDto,
} from './dto/platform.dto';

export interface StartBusinessApprovalInput {
  businessType: string;
  businessId: string;
  businessTitle?: string;
  applicantId: string;
  countryCode?: string;
  templateId?: string;
  approverIds?: string[];
}

@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationLog: OperationLogService,
    private readonly businessWorkflow: ApprovalBusinessService,
    private readonly notificationService: NotificationService,
  ) {}

  async findTemplates(query: QueryPlatformDto) {
    const { page = 1, pageSize = 20, keyword, status } = query;
    const where: Prisma.ApprovalTemplateWhereInput = {
      ...(keyword && {
        OR: [
          { templateCode: { contains: keyword } },
          { templateName: { contains: keyword } },
          { businessType: { contains: keyword } },
        ],
      }),
      ...(status && { isEnabled: status === 'Enabled' }),
    };
    const [total, list] = await Promise.all([
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
      list,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async upsertTemplate(dto: UpsertApprovalTemplateDto, userId: string) {
    const template = await this.prisma.$transaction(async (tx) => {
      const template = await tx.approvalTemplate.upsert({
        where: { templateCode: dto.templateCode },
        create: {
          templateCode: dto.templateCode,
          templateName: dto.templateName,
          businessType: dto.businessType,
          countryCode: dto.countryCode,
          isEnabled: dto.isEnabled ?? true,
        },
        update: {
          templateName: dto.templateName,
          businessType: dto.businessType,
          countryCode: dto.countryCode,
          isEnabled: dto.isEnabled,
        },
      });
      await tx.approvalStep.deleteMany({ where: { templateId: template.id } });
      if (dto.steps.length) {
        await tx.approvalStep.createMany({
          data: dto.steps.map((step) => ({
            templateId: template.id,
            stepOrder: step.stepOrder,
            stepName: step.stepName,
            approverType: step.approverType,
            approverValue: step.approverValue,
          })),
        });
      }
      return tx.approvalTemplate.findUnique({
        where: { id: template.id },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
    });
    if (!template) {
      throw new NotFoundException('审批模板保存失败');
    }
    await this.operationLog.log({
      userId,
      module: 'approval',
      action: 'configure_template',
      targetType: 'approval_template',
      targetId: template.id,
      afterData: {
        templateCode: template.templateCode,
        businessType: template.businessType,
        countryCode: template.countryCode,
        isEnabled: template.isEnabled,
        stepCount: template.steps.length,
      },
    });
    return template;
  }

  async findTasks(query: QueryPlatformDto, userId: string) {
    const { page = 1, pageSize = 20, status } = query;
    const elevated = await this.isElevated(userId);
    const where: Prisma.ApprovalTaskWhereInput = {
      ...(status && { status }),
      ...(!elevated && {
        OR: [{ applicantId: userId }, { approverId: userId }],
      }),
    };
    const [total, list] = await Promise.all([
      this.prisma.approvalTask.count({ where }),
      this.prisma.approvalTask.findMany({
        where,
        include: {
          template: { select: { templateName: true, templateCode: true } },
          applicant: { select: { id: true, realName: true } },
          approver: { select: { id: true, realName: true } },
          actions: {
            include: { actor: { select: { id: true, realName: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      list,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async createTask(dto: CreateApprovalTaskDto, applicantId: string) {
    const template = await this.prisma.approvalTemplate.findFirst({
      where: { id: dto.templateId, isEnabled: true },
      select: { businessType: true },
    });
    if (!template) {
      throw new NotFoundException('审批模板不存在或已停用');
    }
    return this.startBusinessApproval({
      templateId: dto.templateId,
      businessType: template.businessType,
      businessId: dto.businessId,
      applicantId,
    });
  }

  async startBusinessApproval(input: StartBusinessApprovalInput) {
    const pendingTask = await this.prisma.approvalTask.findFirst({
      where: {
        businessType: input.businessType,
        businessId: input.businessId,
        status: 'Pending',
      },
      select: { id: true },
    });
    if (pendingTask) {
      throw new ConflictException('该业务已有待处理审批任务');
    }

    const templateId = input.approverIds?.length
      ? await this.upsertSequentialUserTemplate(input)
      : input.templateId;
    const template = await this.prisma.approvalTemplate.findFirst({
      where: templateId
        ? { id: templateId, isEnabled: true }
        : {
            businessType: input.businessType,
            isEnabled: true,
            ...(input.countryCode
              ? { OR: [{ countryCode: input.countryCode }, { countryCode: null }] }
              : { countryCode: null }),
          },
      include: { steps: { orderBy: { stepOrder: 'asc' }, take: 1 } },
      orderBy: [{ countryCode: 'desc' }, { updatedAt: 'desc' }],
    });
    if (!template) {
      throw new NotFoundException('未找到适用的审批模板');
    }
    const firstStep = template.steps[0];
    if (!firstStep) {
      throw new NotFoundException('审批模板未配置审批步骤');
    }
    const approverId = await this.resolveApprover(firstStep.approverType, firstStep.approverValue);
    const pendingNotification = await this.notificationService.resolveInAppNotification({
      eventType: 'approval_pending',
      userId: approverId,
      title: `待审批：${input.businessTitle ?? template.templateName}`,
      content: `${template.templateName}已提交，请及时处理。`,
    });

    const task = await this.prisma.$transaction(async (tx) => {
      const createdTask = await tx.approvalTask.create({
        data: {
          templateId: template.id,
          businessType: input.businessType,
          businessId: input.businessId,
          businessTitle: input.businessTitle,
          applicantId: input.applicantId,
          currentStep: firstStep.stepOrder,
          approverId,
        },
      });
      await tx.approvalAction.create({
        data: {
          taskId: createdTask.id,
          stepOrder: firstStep.stepOrder,
          action: 'Submitted',
          actorId: input.applicantId,
          comment: '发起审批',
        },
      });
      await this.businessWorkflow.applySubmissionState(tx, input.businessType, input.businessId);
      if (pendingNotification) {
        await tx.notification.create({
          data: {
            userId: approverId,
            ...pendingNotification,
            notificationType: 'approval_pending',
            relatedType: input.businessType,
            relatedId: input.businessId,
          },
        });
      }
      return createdTask;
    });

    await this.operationLog.log({
      userId: input.applicantId,
      module: 'approval',
      action: 'submit',
      targetType: input.businessType,
      targetId: input.businessId,
      afterData: { taskId: task.id, templateId: template.id },
    });
    return task;
  }

  async decideBusinessTask(
    businessType: string,
    businessId: string,
    dto: DecideApprovalTaskDto,
    userId: string,
  ) {
    const task = await this.prisma.approvalTask.findFirst({
      where: { businessType, businessId, status: 'Pending' },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!task) {
      throw new NotFoundException('未找到待处理的审批任务');
    }
    return this.decideTask(task.id, dto, userId);
  }

  async decideTask(id: string, dto: DecideApprovalTaskDto, userId: string) {
    const task = await this.prisma.approvalTask.findUnique({
      where: { id },
      include: { template: { include: { steps: true } } },
    });
    if (!task) {
      throw new NotFoundException('审批任务不存在');
    }
    if (task.status !== 'Pending') {
      throw new ForbiddenException('该审批任务已处理');
    }
    if (task.approverId !== userId && !(await this.isElevated(userId))) {
      throw new ForbiddenException('当前用户不是本步骤审批人');
    }

    const nextStep = task.template.steps
      .filter((step) => step.stepOrder > task.currentStep)
      .sort((a, b) => a.stepOrder - b.stepOrder)[0];
    const approvedWithNext = dto.decision === 'Approved' && nextStep;
    const nextApproverId = approvedWithNext
      ? await this.resolveApprover(nextStep.approverType, nextStep.approverValue)
      : null;
    const nextNotification =
      approvedWithNext && nextApproverId
        ? await this.notificationService.resolveInAppNotification({
            eventType: 'approval_pending',
            userId: nextApproverId,
            title: `待审批：${task.businessTitle ?? task.template.templateName}`,
            content: `${task.template.templateName}已进入下一审批步骤。`,
          })
        : null;
    const finalNotification = !approvedWithNext
      ? await this.notificationService.resolveInAppNotification({
          eventType: dto.decision === 'Approved' ? 'approval_approved' : 'approval_rejected',
          userId: task.applicantId,
          title: `审批${dto.decision === 'Approved' ? '通过' : '驳回'}：${
            task.businessTitle ?? task.template.templateName
          }`,
          content: dto.comment || '审批流程已处理完成。',
        })
      : null;
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedTask = await tx.approvalTask.update({
        where: { id },
        data: approvedWithNext
          ? {
              currentStep: nextStep.stepOrder,
              approverId: nextApproverId,
              comment: dto.comment,
            }
          : {
              status: dto.decision,
              approverId: userId,
              comment: dto.comment,
              decidedAt: new Date(),
            },
      });
      await tx.approvalAction.create({
        data: {
          taskId: id,
          stepOrder: task.currentStep,
          action: dto.decision,
          actorId: userId,
          comment: dto.comment,
        },
      });

      if (approvedWithNext && nextApproverId && nextNotification) {
        await tx.notification.create({
          data: {
            userId: nextApproverId,
            ...nextNotification,
            notificationType: 'approval_pending',
            relatedType: task.businessType,
            relatedId: task.businessId,
          },
        });
      } else {
        await this.businessWorkflow.applyDecisionState(
          tx,
          task.businessType,
          task.businessId,
          dto.decision,
          userId,
          dto.comment,
        );
        if (finalNotification) {
          await tx.notification.create({
            data: {
              userId: task.applicantId,
              ...finalNotification,
              notificationType: `approval_${dto.decision.toLowerCase()}`,
              relatedType: task.businessType,
              relatedId: task.businessId,
            },
          });
        }
      }
      return updatedTask;
    });
    await this.operationLog.log({
      userId,
      module: 'approval',
      action: dto.decision.toLowerCase(),
      targetType: task.businessType,
      targetId: task.businessId,
      afterData: { taskId: id, decision: dto.decision },
    });
    return result;
  }

  private async upsertSequentialUserTemplate(input: StartBusinessApprovalInput): Promise<string> {
    const approverIds = Array.from(new Set(input.approverIds ?? []));
    if (approverIds.length === 0) {
      throw new NotFoundException('评分流程未配置评分人');
    }
    const templateCode = `AUTO_${input.businessType}_${input.businessId}`.slice(0, 50);
    return this.prisma.$transaction(async (tx) => {
      const templateName = input.businessTitle
        ? `${input.businessTitle}评分流程`.slice(0, 100)
        : '自定义顺序评分流程';
      const template = await tx.approvalTemplate.upsert({
        where: { templateCode },
        create: {
          templateCode,
          templateName,
          businessType: input.businessType,
        },
        update: {
          templateName,
          businessType: input.businessType,
          isEnabled: true,
        },
      });
      await tx.approvalStep.deleteMany({ where: { templateId: template.id } });
      await tx.approvalStep.createMany({
        data: approverIds.map((approverId, index) => ({
          templateId: template.id,
          stepOrder: index + 1,
          stepName: `第 ${index + 1} 级评分`,
          approverType: 'user',
          approverValue: approverId,
        })),
      });
      return template.id;
    });
  }

  private async resolveApprover(approverType: string, approverValue: string): Promise<string> {
    if (approverType === 'user') {
      const user = await this.prisma.user.findFirst({
        where: { id: approverValue, deletedAt: null, status: 'Active' },
        select: { id: true },
      });
      if (!user) {
        throw new NotFoundException('配置的审批用户不存在');
      }
      return user.id;
    }
    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        status: 'Active',
        userRoles: { some: { role: { roleCode: approverValue } } },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!user) {
      throw new NotFoundException(`角色 ${approverValue} 暂无可用审批人`);
    }
    return user.id;
  }

  private async isElevated(userId: string): Promise<boolean> {
    const count = await this.prisma.userRole.count({
      where: {
        userId,
        role: {
          roleCode: {
            in: ['SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER'],
          },
        },
      },
    });
    return count > 0;
  }
}
