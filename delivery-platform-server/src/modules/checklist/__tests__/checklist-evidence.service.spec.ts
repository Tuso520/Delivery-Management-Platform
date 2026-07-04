import { BadRequestException } from '@nestjs/common';
import { ChecklistItemStatus } from '@prisma/client';

import type { PrismaService } from '../../../database/prisma.service';
import type { ApprovalService } from '../../platform/approval.service';
import type { ProjectAccessService } from '../../project/project-access.service';
import { ChecklistService } from '../checklist.service';

describe('ChecklistService evidence validation', () => {
  const approvalService = {
    startBusinessApproval: jest.fn(),
  } as unknown as ApprovalService;
  const projectAccess = {
    assertProjectAccess: jest.fn(),
  } as unknown as ProjectAccessService;

  it('rejects submission when required evidence count is not met', async () => {
    const prisma = {
      projectChecklistItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'check-item-1',
          itemName: '设备安装检查',
          status: ChecklistItemStatus.Processing,
          project: { projectCode: 'VN-HN-001', countryCode: 'VN' },
          templateItem: {
            minEvidenceCount: 2,
            evidenceTypes: 'photo,file',
            requireLocation: false,
          },
        }),
        update: jest.fn(),
      },
      attachment: {
        count: jest.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaService;
    const service = new ChecklistService(prisma, approvalService, projectAccess);

    await expect(service.submitItem('check-item-1', 'user-1')).rejects.toThrow(
      new BadRequestException('至少需要上传 2 个检查证据，当前仅 1 个'),
    );
    expect(prisma.projectChecklistItem.update).not.toHaveBeenCalled();
  });

  it('submits and records time when evidence requirement is met', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'check-item-1',
      status: ChecklistItemStatus.Submitted,
    });
    const prisma = {
      projectChecklistItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'check-item-1',
          itemName: '设备安装检查',
          status: ChecklistItemStatus.Processing,
          project: { projectCode: 'VN-HN-001', countryCode: 'VN' },
          templateItem: {
            minEvidenceCount: 2,
            evidenceTypes: 'photo,file',
            requireLocation: false,
          },
        }),
        update,
      },
      attachment: {
        count: jest.fn().mockResolvedValue(2),
      },
    } as unknown as PrismaService;
    const service = new ChecklistService(prisma, approvalService, projectAccess);

    await service.submitItem('check-item-1', 'user-1');

    expect(approvalService.startBusinessApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        businessType: 'checklist',
        businessId: 'check-item-1',
        applicantId: 'user-1',
      }),
    );
    expect(update).not.toHaveBeenCalled();
  });
});
