import type { PrismaService } from '../../../database/prisma.service';
import type { ApprovalService } from '../../platform/approval.service';
import { TemplateService } from '../template.service';

describe('TemplateService attachment versions', () => {
  it('submits template publishing into approval workflow', async () => {
    const prisma = {
      documentTemplate: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'template-1',
            name: '项目启动模板',
            status: 'Draft',
          })
          .mockResolvedValueOnce({
            id: 'template-1',
            name: '项目启动模板',
            status: 'Reviewing',
          }),
      },
    } as unknown as PrismaService;
    const approval = {
      startBusinessApproval: jest.fn().mockResolvedValue({ id: 'approval-1' }),
    } as unknown as ApprovalService;
    const service = new TemplateService(prisma, approval);

    const result = await service.publish('template-1', 'user-1');

    expect(approval.startBusinessApproval).toHaveBeenCalledWith({
      businessType: 'template',
      businessId: 'template-1',
      businessTitle: '文档模板发布：项目启动模板',
      applicantId: 'user-1',
    });
    expect(result?.status).toBe('Reviewing');
  });

  it('creates a version from a private template attachment', async () => {
    const prisma = {
      documentTemplate: {
        findUnique: jest.fn().mockResolvedValue({ id: 'template-1' }),
        update: jest.fn().mockResolvedValue({ id: 'template-1' }),
      },
      attachment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'attachment-1',
          storagePath: 'attachments/DocumentTemplate/template-1/template.docx',
          fileExt: 'docx',
        }),
      },
      documentTemplateVersion: {
        create: jest.fn().mockResolvedValue({
          id: 'version-1',
          versionNo: 'V1.0',
        }),
      },
    } as unknown as PrismaService;
    const approval = {} as ApprovalService;
    const service = new TemplateService(prisma, approval);

    await service.addVersion('template-1', {
      versionNo: 'V1.0',
      attachmentId: 'attachment-1',
      changeNotes: '初始版本',
    });

    expect(prisma.documentTemplateVersion.create).toHaveBeenCalledWith({
      data: {
        templateId: 'template-1',
        versionNo: 'V1.0',
        storagePath: 'attachments/DocumentTemplate/template-1/template.docx',
        changeNotes: '初始版本',
      },
    });
    expect(prisma.documentTemplate.update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: {
        storagePath: 'attachments/DocumentTemplate/template-1/template.docx',
        fileFormat: 'docx',
      },
    });
  });
});
