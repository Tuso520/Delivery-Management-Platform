import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import type { ProjectAccessService } from '../../project/project-access.service';
import { ProjectArchiveTargetService } from '../project-archive-target.service';

describe('ProjectArchiveTargetService', () => {
  const actor = {
    sub: 'user-1',
    roles: ['PROJECT_MANAGER'],
    permissions: ['archive:view', 'archive:template:sync', 'archive:item:archive'],
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
    });
  });

  it('refuses to create a review-required temporary item without an approval template', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 'project-1' });
    prisma.projectArchiveFolder.findFirst.mockResolvedValue({ id: 'folder-1' });
    prisma.projectMember.findFirst.mockResolvedValue({ userId: 'owner-1' });

    await expect(
      service.createTemporaryItem(
        'project-1',
        'folder-1',
        {
          name: '临时会签文件',
          reason: '真实审核验收',
          ownerUserId: 'owner-1',
          reviewRequired: true,
        },
        actor,
      ),
    ).rejects.toThrow(new BadRequestException('需要审核的临时档案项必须选择审批模板'));
    expect(prisma.projectArchiveEntry.create).not.toHaveBeenCalled();
  });

  it('returns 404 for an archive item that belongs to another project', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 'project-1' });
    prisma.projectArchiveEntry.findFirst.mockResolvedValue(null);

    await expect(service.archiveItem('project-1', 'other-project-item', {}, actor)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.projectArchiveEntry.findFirst).toHaveBeenCalledWith({
      where: { id: 'other-project-item', projectId: 'project-1' },
    });
    expect(prisma.projectArchiveEntry.update).not.toHaveBeenCalled();
  });

  it('syncs only missing additions and never deletes existing project entries', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: 'project-1',
      archiveTemplateId: 'template-1',
      archiveTemplateVersionId: 'version-1',
      archiveFolders: [
        {
          id: 'project-folder-a',
          sourceStableKey: 'folder-a',
          items: [{ sourceStableKey: 'item-existing' }, { sourceStableKey: 'item-project-only' }],
        },
      ],
      archiveTemplate: {
        currentPublishedVersion: {
          id: 'version-2',
          versionNo: 'V2.0',
          status: 'PUBLISHED',
          folders: [
            {
              id: 'template-folder-a',
              stableKey: 'folder-a',
              name: '文件夹A',
              description: null,
              sortOrder: 10,
              items: [
                {
                  id: 'template-item-existing',
                  stableKey: 'item-existing',
                  name: '已有项',
                  description: null,
                  required: true,
                  reviewRequired: false,
                  approvalTemplateId: null,
                  ownerRoleId: null,
                  allowMultipleFiles: false,
                  allowedExtensions: null,
                  maxFileSize: null,
                  namingRule: null,
                  sortOrder: 10,
                },
                {
                  id: 'template-item-new',
                  stableKey: 'item-new',
                  name: '新增项',
                  description: null,
                  required: true,
                  reviewRequired: false,
                  approvalTemplateId: null,
                  ownerRoleId: null,
                  allowMultipleFiles: false,
                  allowedExtensions: null,
                  maxFileSize: null,
                  namingRule: null,
                  sortOrder: 20,
                },
              ],
            },
            {
              id: 'template-folder-b',
              stableKey: 'folder-b',
              name: '文件夹B',
              description: null,
              sortOrder: 20,
              items: [
                {
                  id: 'template-item-b',
                  stableKey: 'item-b',
                  name: '文件项B',
                  description: null,
                  required: false,
                  reviewRequired: false,
                  approvalTemplateId: null,
                  ownerRoleId: null,
                  allowMultipleFiles: false,
                  allowedExtensions: null,
                  maxFileSize: null,
                  namingRule: null,
                  sortOrder: 10,
                },
              ],
            },
          ],
        },
      },
    });
    prisma.projectArchiveFolder.create.mockResolvedValue({ id: 'project-folder-b' });
    jest.spyOn(service, 'getTemplateDiff').mockResolvedValue({
      sourceVersion: { id: 'version-1', version: 'V1.0' },
      latestVersion: null,
      hasDiff: false,
      canSync: false,
      syncMode: 'ADD_ONLY',
      requiresMigration: false,
      reason: 'test',
      additions: { folders: [], items: [] },
      changes: { folders: [], items: [] },
      projectOnly: { folders: [], items: [] },
    });

    const result = await service.syncTemplateAdditions(
      'project-1',
      { confirmAdditions: true },
      actor,
    );

    expect(prisma.projectArchiveFolder.create).toHaveBeenCalledTimes(1);
    expect(prisma.projectArchiveFolder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceStableKey: 'folder-b',
        sourceTemplateFolderId: 'template-folder-b',
      }),
      select: { id: true },
    });
    const createdEntries = prisma.projectArchiveEntry.createMany.mock.calls
      .flatMap(([call]) => call.data)
      .map((entry: { sourceStableKey: string }) => entry.sourceStableKey);
    expect(createdEntries).toEqual(['item-new', 'item-b']);
    expect(createdEntries).not.toContain('item-existing');
    expect(createdEntries).not.toContain('item-project-only');
    expect(prisma.projectArchiveEntry).not.toHaveProperty('deleteMany');
    expect(result).toEqual(
      expect.objectContaining({
        syncMode: 'ADD_ONLY',
        addedFolderKeys: ['folder-b'],
        addedItemKeys: ['item-new', 'item-b'],
      }),
    );
  });
});
