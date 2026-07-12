import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { ProjectArchiveSnapshotService } from '../project-archive-snapshot.service';

describe('ProjectArchiveSnapshotService', () => {
  const publishedVersion = {
    id: 'version-2',
    templateId: 'template-1',
    versionNo: 'V2.0',
    status: 'PUBLISHED',
    template: {
      id: 'template-1',
      templateCode: 'DEFAULT',
      templateName: '默认模板',
      status: 'PUBLISHED',
      currentPublishedVersionId: 'version-2',
    },
    folders: [
      {
        id: 'template-folder-1',
        stableKey: 'folder-contract',
        name: '合同资料',
        description: null,
        sortOrder: 10,
        items: [
          {
            id: 'template-item-1',
            stableKey: 'item-contract',
            name: '合同正文',
            description: null,
            required: true,
            reviewRequired: true,
            approvalTemplateId: null,
            ownerRoleId: 'role-pm',
            allowMultipleFiles: false,
            allowedExtensions: ['pdf'],
            maxFileSize: BigInt(10_000),
            namingRule: null,
            sortOrder: 10,
          },
        ],
      },
    ],
  };

  let service: ProjectArchiveSnapshotService;
  let tx: {
    archiveTemplateVersion: { findFirst: jest.Mock };
    archiveTemplate: { findMany: jest.Mock };
    projectMember: { findMany: jest.Mock };
    projectArchiveFolder: { create: jest.Mock };
    projectArchiveEntry: { createMany: jest.Mock };
    project: { update: jest.Mock };
  };

  beforeEach(() => {
    service = new ProjectArchiveSnapshotService();
    tx = {
      archiveTemplateVersion: {
        findFirst: jest.fn().mockResolvedValue(publishedVersion),
      },
      archiveTemplate: { findMany: jest.fn() },
      projectMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            userId: 'manager-1',
            user: { userRoles: [{ roleId: 'role-pm' }] },
          },
        ]),
      },
      projectArchiveFolder: {
        create: jest.fn().mockResolvedValue({ id: 'project-folder-1' }),
      },
      projectArchiveEntry: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      project: { update: jest.fn().mockResolvedValue({}) },
    };
  });

  it('copies the current published two-level version with stable keys', async () => {
    const result = await service.createProjectSnapshot(
      tx as unknown as Prisma.TransactionClient,
      'project-1',
      {
        countryCode: 'VN',
        archiveTemplateId: 'template-1',
        archiveTemplateVersionId: 'version-2',
      },
    );

    expect(tx.archiveTemplateVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'version-2',
          templateId: 'template-1',
          status: 'PUBLISHED',
        }),
      }),
    );
    expect(tx.projectArchiveFolder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'project-1',
        sourceTemplateFolderId: 'template-folder-1',
        sourceStableKey: 'folder-contract',
      }),
      select: { id: true },
    });
    expect(tx.projectArchiveEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          projectId: 'project-1',
          folderId: 'project-folder-1',
          templateVersionId: 'version-2',
          sourceTemplateItemId: 'template-item-1',
          sourceStableKey: 'item-contract',
          ownerUserId: 'manager-1',
        }),
      ],
    });
    expect(tx.project.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: {
        archiveTemplateId: 'template-1',
        archiveTemplateVersionId: 'version-2',
      },
    });
    expect(result).toEqual({
      templateId: 'template-1',
      templateVersionId: 'version-2',
      source: 'PUBLISHED_VERSION',
      folderCount: 1,
      itemCount: 1,
    });
  });

  it('fails before creating snapshot rows when a published version is empty', async () => {
    tx.archiveTemplateVersion.findFirst.mockResolvedValue({
      ...publishedVersion,
      folders: [],
    });

    await expect(
      service.createProjectSnapshot(tx as unknown as Prisma.TransactionClient, 'project-1', {
        countryCode: 'VN',
        archiveTemplateVersionId: 'version-2',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.projectArchiveFolder.create).not.toHaveBeenCalled();
    expect(tx.project.update).not.toHaveBeenCalled();
  });

  it('rejects an unmigrated legacy template instead of creating a second data track', async () => {
    tx.archiveTemplate.findMany.mockResolvedValue([
      {
        id: 'legacy-template',
        templateCode: 'LEGACY',
        templateName: '兼容模板',
        projectType: null,
        countryCode: null,
        languageCode: 'zh-CN',
        status: 'DRAFT',
        currentPublishedVersionId: null,
        currentPublishedVersion: null,
      },
    ]);

    await expect(
      service.createProjectSnapshot(tx as unknown as Prisma.TransactionClient, 'project-1', {
        countryCode: 'VN',
        languageCode: 'zh-CN',
      }),
    ).rejects.toThrow('请先完成模板迁移并发布');
    expect(tx.projectArchiveFolder.create).not.toHaveBeenCalled();
    expect(tx.projectArchiveEntry.createMany).not.toHaveBeenCalled();
  });
});
