import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { OperationLogService } from '../operation-log/operation-log.service';
import { ProjectAccessService } from '../project/project-access.service';

import { AddProjectMemberDto, UpdateMemberRoleDto } from './dto/project-member.dto';

@Injectable()
export class ProjectMemberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
    private readonly operationLog: OperationLogService,
  ) {}

  async findByProject(projectId: string, userId: string) {
    await this.projectAccess.assertProjectAccess(projectId, userId);

    return this.prisma.projectMember.findMany({
      where: { projectId, deletedAt: null },
      select: {
        id: true,
        projectId: true,
        userId: true,
        projectRole: true,
        permissionLevel: true,
        dataScope: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            username: true,
            realName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addMember(
    projectId: string,
    dto: AddProjectMemberDto,
    operatorId: string,
  ) {
    await this.projectAccess.assertProjectAccess(projectId, operatorId);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: dto.userId, deletedAt: null, status: 'Active' },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('用户不存在或已停用');

      const existing = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: dto.userId } },
        select: { id: true, deletedAt: true },
      });
      if (existing && !existing.deletedAt) {
        throw new ConflictException('该用户已是项目成员');
      }

      const memberSelect = {
        id: true,
        projectId: true,
        userId: true,
        projectRole: true,
        permissionLevel: true,
        dataScope: true,
        createdAt: true,
      } as const;
      const member = existing
        ? await tx.projectMember.update({
            where: { id: existing.id },
            data: {
              projectRole: dto.projectRole,
              permissionLevel: dto.permissionLevel || 'Member',
              dataScope: dto.dataScope || 'PROJECT',
              deletedAt: null,
            },
            select: memberSelect,
          })
        : await tx.projectMember.create({
            data: {
              projectId,
              userId: dto.userId,
              projectRole: dto.projectRole,
              permissionLevel: dto.permissionLevel || 'Member',
              dataScope: dto.dataScope || 'PROJECT',
            },
            select: memberSelect,
          });
      await this.operationLog.log(
        {
          userId: operatorId,
          module: 'project_member',
          action: existing ? 'restore' : 'add',
          targetType: 'project_member',
          targetId: member.id,
          afterData: {
            projectId,
            userId: dto.userId,
            projectRole: member.projectRole,
            dataScope: member.dataScope,
          },
        },
        tx,
      );
      return member;
    });
  }

  async removeMember(
    projectId: string,
    memberId: string,
    operatorId: string,
  ): Promise<void> {
    await this.projectAccess.assertProjectAccess(projectId, operatorId);
    await this.prisma.$transaction(async (tx) => {
      const member = await tx.projectMember.findFirst({
        where: { id: memberId, projectId, deletedAt: null },
      });
      if (!member) throw new NotFoundException('项目成员不存在');

      await tx.projectMember.update({
        where: { id: memberId },
        data: { deletedAt: new Date() },
      });
      await this.operationLog.log(
        {
          userId: operatorId,
          module: 'project_member',
          action: 'remove',
          targetType: 'project_member',
          targetId: memberId,
          beforeData: {
            projectId,
            userId: member.userId,
            projectRole: member.projectRole,
            dataScope: member.dataScope,
          },
        },
        tx,
      );
    });
  }

  async updateRole(
    projectId: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
    operatorId: string,
  ) {
    await this.projectAccess.assertProjectAccess(projectId, operatorId);
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.projectMember.findFirst({
        where: { id: memberId, projectId, deletedAt: null },
      });
      if (!member) throw new NotFoundException('项目成员不存在');

      const updated = await tx.projectMember.update({
        where: { id: memberId },
        data: { projectRole: dto.projectRole },
        select: {
          id: true,
          projectId: true,
          userId: true,
          projectRole: true,
          permissionLevel: true,
          dataScope: true,
          updatedAt: true,
        },
      });
      await this.operationLog.log(
        {
          userId: operatorId,
          module: 'project_member',
          action: 'update_role',
          targetType: 'project_member',
          targetId: memberId,
          beforeData: { projectRole: member.projectRole },
          afterData: { projectRole: updated.projectRole },
        },
        tx,
      );
      return updated;
    });
  }
}
