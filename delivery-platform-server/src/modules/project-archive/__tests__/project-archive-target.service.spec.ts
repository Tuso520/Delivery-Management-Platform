import type { PrismaService } from '../../../database/prisma.service';
import type { ProjectAccessService } from '../../project/project-access.service';
import { ProjectArchiveTargetService } from '../project-archive-target.service';

describe('ProjectArchiveTargetService', () => {
  const actor = {
    sub: 'user-1',
    roles: ['PROJECT_MANAGER'],
    permissions: ['archive:view'],
  };

  let service: ProjectArchiveTargetService;
  let prisma: {
    project: Record<string, jest.Mock>;
    archiveTemplate: Record<string, jest.Mock>;
    approvalTemplate: Record<string, jest.Mock>;
    projectMember: Record<string, jest.Mock>;
    projectArchiveFolder: Record<string, jest.Mock>;
    projectArchiveEntry: Record<string, jest.Mock>;
    operationLog: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let projectAccess: { buildProjectWhere: jest.Mock };

  beforeEach(() => {
    prisma = {
      project: { findFirst: jest.fn(), findUnique: jest.fn() },
      archiveTemplate: { findUnique: jest.fn() },
      approvalTemplate: { findFirst: jest.fn() },
      projectMember: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      projectArchiveFolder: { create: jest.fn(), findFirst: jest.fn(), aggregate: jest.fn() },
      projectArchiveEntry: {
        findFirst: jest.fn(),
        aggregate: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      operationLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (operation: (client: typeof prisma) => Promise<unknown>) => operation(prisma),
    );
    projectAccess = {
      buildProjectWhere: jest.fn().mockResolvedValue({ deletedAt: null }),
    };
    service = new ProjectArchiveTargetService(
      prisma as unknown as PrismaService,
      projectAccess as unknown as ProjectAccessService,
    );
  });

  it('returns immutable upload policy with each project archive item', async () => {
    const updatedAt = new Date('2026-07-16T00:00:00.000Z');
    prisma.project.findFirst.mockResolvedValue({
      id: 'project-1',
      projectCode: 'P-001',
      projectName: 'Policy project',
      currentStage: 'EXECUTION',
      archiveTemplateId: null,
      archiveTemplateVersionId: null,
      archiveTemplateVersion: null,
      archiveTemplate: null,
      archiveFolders: [
        {
          id: 'folder-1',
          name: 'Design',
          description: null,
          sortOrder: 10,
          sourceStableKey: 'folder-design',
          isTemporary: false,
          archivedAt: null,
          items: [
            {
              id: 'item-1',
              name: 'Drawing',
              description: null,
              required: true,
              reviewRequired: false,
              approvalTemplateId: null,
              ownerRoleId: null,
              allowMultipleFiles: false,
              allowedExtensions: ['pdf', 'png'],
              maxFileSize: BigInt(10_000),
              namingRule: 'Drawing-{version}',
              sourceStableKey: 'item-drawing',
              isTemporary: false,
              temporaryReason: null,
              archivedAt: null,
              updatedAt,
              ownerUser: null,
              files: [],
            },
          ],
        },
      ],
    });

    const result = await service.getArchiveTree('project-1', {
      ...actor,
      permissions: [...actor.permissions, 'archive:upload'],
    });

    expect(result.folders[0].items[0]).toMatchObject({
      allowedExtensions: ['pdf', 'png'],
      maxFileSize: BigInt(10_000),
      namingRule: 'Drawing-{version}',
      canUpload: true,
      canDownload: false,
      canDeleteFile: false,
    });
    expect(result.folders[0].items[0]).not.toHaveProperty('canArchive');
    expect(result.folders[0].items[0]).not.toHaveProperty('canRestore');
  });

  it('omits empty standard-folder placeholders from rows and folder counts', async () => {
    const updatedAt = new Date('2026-08-24T00:00:00.000Z');
    const placeholderFiles: Array<{
      id: string;
      status: string;
      updatedAt: Date;
      logicalFile: {
        id: string;
        displayName: string;
        status: string;
        currentVersion: null;
        versions: [];
      };
    }> = [];
    prisma.project.findFirst.mockResolvedValue({
      id: 'project-1',
      projectCode: 'P-001',
      projectName: 'Archive project',
      currentStage: 'EXECUTION',
      archiveTemplateId: null,
      archiveTemplateVersionId: null,
      archiveTemplateVersion: null,
      archiveTemplate: null,
      archiveFolders: [
        {
          id: 'folder-1',
          name: '项目启动',
          description: null,
          sortOrder: 0,
          sourceStableKey: 'standard-folder-01',
          isTemporary: false,
          archivedAt: null,
          items: [
            {
              id: 'item-placeholder',
              name: '相关交付文件',
              description: null,
              required: false,
              reviewRequired: false,
              approvalTemplateId: null,
              ownerRoleId: null,
              allowMultipleFiles: true,
              allowedExtensions: [],
              maxFileSize: BigInt(100_000_000),
              namingRule: null,
              sourceStableKey: 'standard-folder-01-files',
              isTemporary: false,
              temporaryReason: null,
              archivedAt: null,
              updatedAt,
              ownerUser: null,
              files: placeholderFiles,
            },
          ],
        },
      ],
    });

    const result = await service.getArchiveTree('project-1', actor);

    expect(result.folders[0]).toMatchObject({
      totalCount: 0,
      completedCount: 0,
      requiredTotalCount: 0,
      items: [
        expect.objectContaining({
          id: 'item-placeholder',
          fileCount: 0,
          allowMultipleFiles: true,
          canUpload: false,
        }),
      ],
    });

    placeholderFiles.push({
      id: 'archive-file-1',
      status: 'DRAFT',
      updatedAt,
      logicalFile: {
        id: 'logical-file-1',
        displayName: '真实交付文件',
        status: 'ACTIVE',
        currentVersion: null,
        versions: [],
      },
    });

    const withFile = await service.getArchiveTree('project-1', actor);

    expect(withFile.folders[0]).toMatchObject({
      totalCount: 1,
      items: [expect.objectContaining({ id: 'item-placeholder', fileCount: 1 })],
    });
  });

  it('returns original file metadata and action permissions for the Figma file row', async () => {
    const uploadedAt = new Date('2026-07-20T00:00:00.000Z');
    prisma.project.findFirst.mockResolvedValue({
      id: 'project-1',
      projectCode: 'P-001',
      projectName: 'Archive project',
      currentStage: 'EXECUTION',
      archiveTemplateId: null,
      archiveTemplateVersionId: null,
      archiveTemplateVersion: null,
      archiveTemplate: null,
      archiveFolders: [
        {
          id: 'folder-1',
          name: 'Temporary files',
          description: null,
          sortOrder: 10,
          sourceStableKey: 'folder-temporary',
          isTemporary: false,
          archivedAt: null,
          items: [
            {
              id: 'item-1',
              name: 'Meeting minutes',
              description: null,
              required: true,
              reviewRequired: false,
              approvalTemplateId: null,
              ownerRoleId: null,
              allowMultipleFiles: false,
              allowedExtensions: ['docx'],
              maxFileSize: BigInt(10_000),
              namingRule: null,
              sourceStableKey: 'item-minutes',
              isTemporary: false,
              temporaryReason: null,
              archivedAt: null,
              updatedAt: uploadedAt,
              ownerUser: null,
              files: [
                {
                  id: 'archive-file-1',
                  status: 'APPROVED',
                  updatedAt: uploadedAt,
                  logicalFile: {
                    id: 'logical-file-1',
                    displayName: 'Meeting minutes',
                    status: 'ACTIVE',
                    currentVersion: {
                      id: 'version-1',
                      version: 'V1.0',
                      status: 'APPROVED',
                      uploadedAt,
                      uploadedBy: 'user-1',
                      asset: {
                        size: BigInt(1024),
                        originalName: '项目启动会议纪要.docx',
                        extension: 'docx',
                      },
                      uploader: { id: 'user-1', realName: '郭宁', username: 'guo' },
                      reviewTasks: [],
                    },
                    versions: [],
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    const result = await service.getArchiveTree('project-1', {
      ...actor,
      permissions: [...actor.permissions, 'archive:upload', 'file:download', 'file:archive'],
    });

    expect(result.folders[0].items[0]).toMatchObject({
      currentVersion: {
        displayName: 'Meeting minutes',
        originalName: '项目启动会议纪要.docx',
        extension: 'docx',
      },
      canUpload: true,
      canDownload: true,
      canDeleteFile: true,
    });
  });

  it('does not expose commands retired by Figma 43:317', () => {
    expect(service).not.toHaveProperty('getTemplateDiff');
    expect(service).not.toHaveProperty('syncTemplateAdditions');
    expect(service).not.toHaveProperty('archiveItem');
    expect(service).not.toHaveProperty('restoreItem');
  });
});
