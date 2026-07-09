import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

import type { PrismaService } from '../../../database/prisma.service';
import type { FileStorageService } from '../../file/file-storage.service';
import type { OperationLogService } from '../../operation-log/operation-log.service';
import type { ProjectAccessService } from '../../project/project-access.service';
import { AttachmentService } from '../attachment.service';

describe('AttachmentService project ownership', () => {
  const storage = {
    upload: jest.fn(),
    getBucketName: jest.fn().mockReturnValue('delivery-platform'),
  } as unknown as FileStorageService;
  const operationLog = { log: jest.fn() } as unknown as OperationLogService;
  const configService = {
    get: jest.fn().mockReturnValue('unit-test-preview-secret-that-is-long-enough'),
  } as unknown as ConfigService;

  it('rejects a projectId that does not match the checklist owner project', async () => {
    const prisma = {
      projectChecklistItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'check-1',
          projectId: 'project-real',
        }),
      },
    } as unknown as PrismaService;
    const projectAccess = {
      assertProjectAccess: jest.fn(),
    } as unknown as ProjectAccessService;
    const service = new AttachmentService(
      prisma,
      storage,
      operationLog,
      projectAccess,
      configService,
    );

    await expect(
      service.uploadMany(
        [{ originalname: 'site.jpg' } as Express.Multer.File],
        {
          ownerType: 'ChecklistItem',
          ownerId: 'check-1',
          projectId: 'project-fake',
        },
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(projectAccess.assertProjectAccess).not.toHaveBeenCalled();
  });

  it('checks the owner project even when attachment query omits projectId', async () => {
    const prisma = {
      projectChecklistItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'check-1',
          projectId: 'project-real',
        }),
      },
    } as unknown as PrismaService;
    const projectAccess = {
      assertProjectAccess: jest
        .fn()
        .mockRejectedValue(new ForbiddenException('没有访问该项目的权限')),
    } as unknown as ProjectAccessService;
    const service = new AttachmentService(
      prisma,
      storage,
      operationLog,
      projectAccess,
      configService,
    );

    await expect(
      service.findAll(
        {
          ownerType: 'ChecklistItem',
          ownerId: 'check-1',
          page: 1,
          pageSize: 20,
        },
        'user-1',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(projectAccess.assertProjectAccess).toHaveBeenCalledWith(
      'project-real',
      'user-1',
    );
  });

  it('rejects album photos when the checklist template disables albums', async () => {
    const prisma = {
      projectChecklistItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'check-1',
          projectId: 'project-real',
          templateItem: {
            evidenceTypes: 'photo',
            allowAlbum: false,
          },
        }),
      },
    } as unknown as PrismaService;
    const projectAccess = {
      assertProjectAccess: jest.fn(),
    } as unknown as ProjectAccessService;
    const service = new AttachmentService(
      prisma,
      storage,
      operationLog,
      projectAccess,
      configService,
    );

    await expect(
      service.uploadMany(
        [
          {
            originalname: 'site.jpg',
            mimetype: 'image/jpeg',
          } as Express.Multer.File,
        ],
        {
          ownerType: 'ChecklistItem',
          ownerId: 'check-1',
          captureSource: 'album',
        },
        'user-1',
      ),
    ).rejects.toThrow('该检查项不允许从相册选择照片');
  });

  it('renders a private knowledge doc attachment as an online preview', async () => {
    const prisma = {
      attachment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'attachment-1',
          ownerType: 'KnowledgeArticle',
          ownerId: 'article-1',
          projectId: null,
          originalName: 'sample.doc',
          fileExt: 'doc',
          fileSize: BigInt(120),
          mimeType: 'application/msword',
          storagePath: 'attachments/KnowledgeArticle/article-1/sample.doc',
        }),
      },
      knowledgeArticle: {
        findFirst: jest.fn().mockResolvedValue({ id: 'article-1' }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          userRoles: [
            {
              role: {
                roleCode: 'SUPER_ADMIN',
                rolePermissions: [],
              },
            },
          ],
        }),
      },
    } as unknown as PrismaService;
    const previewStorage = {
      getObject: jest.fn().mockResolvedValue(
        Readable.from([
          Buffer.from(
            '<html><body><h1>知识库 DOC 预览样例</h1><p>项目管理</p></body></html>',
            'utf8',
          ),
        ]),
      ),
      upload: jest.fn(),
      getBucketName: jest.fn().mockReturnValue('delivery-platform'),
    } as unknown as FileStorageService;
    const service = new AttachmentService(
      prisma,
      previewStorage,
      operationLog,
      { assertProjectAccess: jest.fn() } as unknown as ProjectAccessService,
      configService,
    );

    const preview = await service.getPreview('attachment-1', 'user-1', {});

    expect(preview.previewKind).toBe('html');
    expect(preview.viewer).toBe('document');
    expect(preview.html).toContain('知识库 DOC 预览样例');
    expect(operationLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'preview', targetId: 'attachment-1' }),
    );
  });

  it('audits preview content separately from downloads', async () => {
    const prisma = {
      attachment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'attachment-video',
          ownerType: 'TrainingPlan',
          ownerId: 'training-1',
          projectId: null,
          originalName: 'recording.mp4',
          fileExt: 'mp4',
          fileSize: BigInt(128),
          mimeType: 'video/mp4',
          storagePath: 'attachments/training/recording.mp4',
        }),
      },
      trainingPlan: {
        findUnique: jest.fn().mockResolvedValue({ id: 'training-1' }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          userRoles: [{ role: { roleCode: 'SUPER_ADMIN', rolePermissions: [] } }],
        }),
      },
    } as unknown as PrismaService;
    const stream = Readable.from([Buffer.from('video')]);
    const previewStorage = {
      getObject: jest.fn().mockResolvedValue(stream),
    } as unknown as FileStorageService;
    const log = jest.fn();
    const service = new AttachmentService(
      prisma,
      previewStorage,
      { log } as unknown as OperationLogService,
      { assertProjectAccess: jest.fn() } as unknown as ProjectAccessService,
      configService,
    );

    const result = await service.getPreviewContent('attachment-video', 'user-1', {
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(result.stream).toBe(stream);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'preview_content',
      targetId: 'attachment-video',
    }));
    expect(log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'download' }));
  });
});
