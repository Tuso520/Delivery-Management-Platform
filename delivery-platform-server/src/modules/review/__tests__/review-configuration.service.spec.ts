import type { PrismaService } from '../../../database/prisma.service';
import { ReviewConfigurationService } from '../review-configuration.service';
import type { ReviewerEligibilityService } from '../reviewer-eligibility.service';

describe('ReviewConfigurationService multi-sign snapshots', () => {
  it('resolves every eligible ANY_N assignee and preserves the configured threshold', async () => {
    const updatedAt = new Date('2026-07-12T00:00:00.000Z');
    const prisma = {
      approvalTemplate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'template-any-n',
          templateCode: 'ARCHIVE_ANY_N',
          templateName: '档案任意两人会签',
          updatedAt,
          steps: [
            {
              stepOrder: 1,
              stepName: '任意两人通过',
              mode: 'ANY_N',
              requiredCount: 2,
              approverType: 'user',
              approverValues: ['reviewer-1', 'reviewer-2', 'reviewer-3'],
            },
          ],
        }),
      },
    } as unknown as PrismaService;
    const eligibility = {
      isEligible: jest.fn().mockResolvedValue(true),
      isEligibleUser: jest.fn().mockResolvedValue(true),
    } as unknown as ReviewerEligibilityService;
    const service = new ReviewConfigurationService(prisma, eligibility);

    const result = await service.resolve('template-any-n', 'submitter-1', 'project-1');

    expect(result.reviewMode).toBe('ANY_N');
    expect(result.steps).toEqual([
      expect.objectContaining({
        mode: 'ANY_N',
        requiredCount: 2,
        assigneeUserIds: ['reviewer-1', 'reviewer-2', 'reviewer-3'],
      }),
    ]);
    expect(result.snapshot).toEqual(
      expect.objectContaining({
        steps: [
          expect.objectContaining({
            mode: 'ANY_N',
            requiredCount: 2,
            approverValues: ['reviewer-1', 'reviewer-2', 'reviewer-3'],
            assigneeUserIds: ['reviewer-1', 'reviewer-2', 'reviewer-3'],
          }),
        ],
      }),
    );
  });
});
