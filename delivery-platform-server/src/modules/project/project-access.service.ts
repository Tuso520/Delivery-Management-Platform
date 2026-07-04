import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

const elevatedRoleCodes = new Set([
  'SUPER_ADMIN',
  'SYSTEM_ADMIN',
  'DELIVERY_MANAGER',
]);

@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async isElevated(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        userRoles: {
          select: {
            role: { select: { roleCode: true } },
          },
        },
      },
    });

    return Boolean(
      user?.userRoles.some(({ role }) => elevatedRoleCodes.has(role.roleCode)),
    );
  }

  async buildProjectWhere(userId: string): Promise<Prisma.ProjectWhereInput> {
    if (await this.isElevated(userId)) {
      return { deletedAt: null };
    }

    return {
      deletedAt: null,
      members: { some: { userId } },
    };
  }

  async assertProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('项目不存在');
    }

    if (await this.isElevated(userId)) {
      return;
    }

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { id: true },
    });
    if (!member) {
      throw new ForbiddenException('没有访问该项目的权限');
    }
  }
}
