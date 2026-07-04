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
      where: { projectId },
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

    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: dto.userId } },
    });

    if (existing) {
      throw new ConflictException('该用户已是项目成员');
    }

    const member = await this.prisma.projectMember.create({
      data: {
        projectId,
        userId: dto.userId,
        projectRole: dto.projectRole,
        permissionLevel: dto.permissionLevel || 'Member',
        dataScope: dto.dataScope || 'PROJECT',
      },
      select: {
        id: true,
        projectId: true,
        userId: true,
        projectRole: true,
        permissionLevel: true,
        dataScope: true,
        createdAt: true,
      },
    });
    await this.operationLog.log({
      userId: operatorId,
      module: 'project_member',
      action: 'add',
      targetType: 'project_member',
      targetId: member.id,
      afterData: {
        projectId,
        userId: dto.userId,
        projectRole: member.projectRole,
        dataScope: member.dataScope,
      },
    });
    return member;
  }

  async removeMember(
    projectId: string,
    memberId: string,
    operatorId: string,
  ): Promise<void> {
    await this.projectAccess.assertProjectAccess(projectId, operatorId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId },
    });

    if (!member) {
      throw new NotFoundException('项目成员不存在');
    }

    await this.prisma.projectMember.delete({
      where: { id: memberId },
    });
    await this.operationLog.log({
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
    });
  }

  async updateRole(
    projectId: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
    operatorId: string,
  ) {
    await this.projectAccess.assertProjectAccess(projectId, operatorId);
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId },
    });

    if (!member) {
      throw new NotFoundException('项目成员不存在');
    }

    const updated = await this.prisma.projectMember.update({
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
    await this.operationLog.log({
      userId: operatorId,
      module: 'project_member',
      action: 'update_role',
      targetType: 'project_member',
      targetId: memberId,
      beforeData: { projectRole: member.projectRole },
      afterData: { projectRole: updated.projectRole },
    });
    return updated;
  }
}
