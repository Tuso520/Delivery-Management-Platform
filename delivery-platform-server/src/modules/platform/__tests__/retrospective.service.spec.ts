import { BadRequestException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import { RetrospectiveService } from '../retrospective.service';

describe('RetrospectiveService close validation', () => {
  it('does not close a retrospective with open corrective actions', async () => {
    const prisma = {
      projectRetrospective: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'retro-1',
          projectId: 'project-1',
        }),
      },
      userRole: { count: jest.fn().mockResolvedValue(1) },
      retrospectiveAction: { count: jest.fn().mockResolvedValue(2) },
    } as unknown as PrismaService;
    const service = new RetrospectiveService(prisma);

    await expect(service.update(
      'retro-1',
      {
        projectId: 'project-1',
        summary: '项目复盘',
        status: 'Closed',
      },
      'manager-1',
    )).rejects.toThrow(
      new BadRequestException('仍有未关闭的整改任务，不能关闭项目复盘'),
    );
  });
});
