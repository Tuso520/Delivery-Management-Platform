import type { PrismaService } from '../../../database/prisma.service';
import type { ApprovalService } from '../../platform/approval.service';
import { OkrService } from '../okr.service';

describe('OkrService performance approval workflow', () => {
  it('submits a completed manager score to approval', async () => {
    const prisma = {
      performanceScore: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'score-1',
          status: 'Submitted',
          month: '2026-06',
          objective: { title: '海外项目交付目标' },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'score-1',
          status: 'Submitted',
        }),
      },
    } as unknown as PrismaService;
    const approval = {
      startBusinessApproval: jest.fn().mockResolvedValue({ id: 'task-1' }),
    } as unknown as ApprovalService;
    const service = new OkrService(prisma, approval);

    await service.submitScore(
      'score-1',
      { managerScore: 92, nextGoal: '完成项目复盘' },
      'manager-1',
    );

    expect(approval.startBusinessApproval).toHaveBeenCalledWith({
      businessType: 'performance',
      businessId: 'score-1',
      businessTitle: '2026-06 海外项目交付目标绩效评分',
      applicantId: 'manager-1',
    });
  });
});
