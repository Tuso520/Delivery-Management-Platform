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
      canDeleteFile: false,
    });
    expect(result.folders[0].items[0]).not.toHaveProperty('canArchive');
    expect(result.folders[0].items[0]).not.toHaveProperty('canRestore');
  });

  it('does not expose commands retired by Figma 43:317', () => {
    expect(service).not.toHaveProperty('getTemplateDiff');
    expect(service).not.toHaveProperty('syncTemplateAdditions');
    expect(service).not.toHaveProperty('archiveItem');
    expect(service).not.toHaveProperty('restoreItem');
  });

});
