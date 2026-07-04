import type { PrismaService } from '../../../database/prisma.service';
import { TemplateService } from '../template.service';

describe('TemplateService attachment versions', () => {
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
    const service = new TemplateService(prisma);

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
