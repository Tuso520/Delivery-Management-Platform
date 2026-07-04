import type { PrismaService } from '../../../database/prisma.service';
import type { ApprovalService } from '../../platform/approval.service';
import type { ProjectAccessService } from '../../project/project-access.service';
import { ReportService } from '../report.service';

describe('ReportService approval workflow', () => {
  it('starts configured approval when the author submits a draft', async () => {
    const prisma = {
      dailyReport: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'report-1',
          authorId: 'user-1',
          reportType: 'weekly',
          reportDate: new Date('2026-06-24'),
          status: 'Draft',
          project: {
            projectCode: 'VN-HN-001',
            countryCode: 'VN',
          },
        }),
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    const approval = {
      startBusinessApproval: jest.fn().mockResolvedValue({ id: 'task-1' }),
    } as unknown as ApprovalService;
    const projectAccess = {
      assertProjectAccess: jest.fn(),
    } as unknown as ProjectAccessService;
    const service = new ReportService(prisma, approval, projectAccess);

    await service.submit('report-1', 'user-1');

    expect(approval.startBusinessApproval).toHaveBeenCalledWith({
      businessType: 'report',
      businessId: 'report-1',
      businessTitle: 'VN-HN-001 周报 2026-06-24',
      applicantId: 'user-1',
      countryCode: 'VN',
    });
    expect(prisma.dailyReport.update).not.toHaveBeenCalled();
  });
});
