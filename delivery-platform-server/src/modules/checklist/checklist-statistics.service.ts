import { Injectable } from '@nestjs/common';
import { ChecklistItemStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ProjectAccessService } from '../project/project-access.service';

@Injectable()
export class ChecklistStatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async getCompletionRate(projectId: string, userId: string) {
    await this.projectAccess.assertProjectAccess(projectId, userId);

    const items = await this.prisma.projectChecklistItem.findMany({
      where: { projectId },
      select: { status: true },
    });
    const statusCounts: Record<string, number> = {};
    for (const item of items) {
      statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1;
    }
    const completed =
      (statusCounts[ChecklistItemStatus.Approved] ?? 0) +
      (statusCounts[ChecklistItemStatus.Closed] ?? 0);
    const applicable =
      items.length - (statusCounts[ChecklistItemStatus.NotApplicable] ?? 0);
    return {
      total: items.length,
      completed,
      applicable,
      completionRate:
        applicable > 0 ? Math.round((completed / applicable) * 100) : 0,
      statusCounts,
    };
  }
}
