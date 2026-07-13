import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { ReviewBusinessService } from '../review-business.service';

interface FileVersionLockQuery {
  readonly strings: readonly string[];
  readonly values: readonly unknown[];
}

const createFileVersionLockMock = () =>
  jest.fn(async (query: FileVersionLockQuery) => query.values.map((id) => ({ id: String(id) })));

describe('ReviewBusinessService', () => {
  it('submits PROJECT_CREATE only from DRAFT without activating the project', async () => {
    const tx = {
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'project-1' }),
        update: jest.fn(),
      },
    } as unknown as Prisma.TransactionClient;
    const service = new ReviewBusinessService();

    await service.applySubmission(tx, {
      sourceType: 'PROJECT_CREATE',
      sourceId: 'project-1',
      fileVersionId: null,
      sourceRevision: null,
      submittedAt: new Date('2026-07-11T00:00:00.000Z'),
      submittedBy: 'creator-1',
    });

    expect(tx.project.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'project-1',
        deletedAt: null,
        archivedAt: null,
        status: 'DRAFT',
      },
      select: { id: true },
    });
    expect(tx.project.update).not.toHaveBeenCalled();
  });

  it.each([
    ['APPROVED' as const, { status: 'ACTIVE', revision: { increment: 1 } }],
    ['REJECTED' as const, { status: 'DRAFT', revision: { increment: 1 } }],
  ])('writes a %s PROJECT_CREATE decision back to the project', async (decision, data) => {
    const tx = {
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'project-1' }),
        update: jest.fn().mockResolvedValue({ id: 'project-1' }),
      },
    } as unknown as Prisma.TransactionClient;
    const service = new ReviewBusinessService();

    await service.applyDecision(tx, {
      sourceType: 'PROJECT_CREATE',
      sourceId: 'project-1',
      fileVersionId: null,
      decision,
      actorUserId: 'reviewer-1',
      decidedAt: new Date('2026-07-11T00:00:00.000Z'),
    });

    expect(tx.project.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data,
    });
  });

  it('promotes only the approved project archive version to current', async () => {
    const tx = {
      projectArchiveFile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'archive-file-1',
          logicalFileId: 'logical-1',
          logicalFile: { currentVersion: { id: 'version-old', status: 'APPROVED' } },
        }),
        update: jest.fn().mockResolvedValue({ id: 'archive-file-1' }),
      },
      fileVersion: {
        findFirst: jest.fn().mockResolvedValue({ id: 'version-new' }),
        update: jest.fn().mockResolvedValue({ id: 'version-new' }),
      },
      logicalFile: {
        update: jest.fn().mockResolvedValue({ id: 'logical-1' }),
      },
    } as unknown as Prisma.TransactionClient;
    const service = new ReviewBusinessService();

    await service.applyDecision(tx, {
      sourceType: 'PROJECT_ARCHIVE',
      sourceId: 'archive-file-1',
      fileVersionId: 'version-new',
      decision: 'APPROVED',
      actorUserId: 'reviewer-1',
      decidedAt: new Date('2026-07-11T00:00:00.000Z'),
    });

    expect(tx.logicalFile.update).toHaveBeenCalledWith({
      where: { id: 'logical-1' },
      data: { currentVersionId: 'version-new', status: 'APPROVED' },
    });
    expect(tx.projectArchiveFile.update).toHaveBeenCalledWith({
      where: { id: 'archive-file-1' },
      data: { status: 'APPROVED' },
    });
  });

  it('moves both archive template aggregate and version into review atomically', async () => {
    const tx = {
      archiveTemplateVersion: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'DRAFT',
          templateId: 'template-1',
          template: { status: 'DRAFT' },
        }),
        update: jest.fn().mockResolvedValue({ id: 'version-1' }),
      },
      archiveTemplate: {
        update: jest.fn().mockResolvedValue({ id: 'template-1' }),
      },
    } as unknown as Prisma.TransactionClient;
    const service = new ReviewBusinessService();
    const submittedAt = new Date('2026-07-11T00:00:00.000Z');

    await service.applySubmission(tx, {
      sourceType: 'ARCHIVE_TEMPLATE',
      sourceId: 'version-1',
      fileVersionId: null,
      sourceRevision: null,
      submittedAt,
      submittedBy: 'creator-1',
    });

    expect(tx.archiveTemplateVersion.update).toHaveBeenCalledWith({
      where: { id: 'version-1' },
      data: { status: 'IN_REVIEW', submittedAt, revision: { increment: 1 } },
    });
    expect(tx.archiveTemplate.update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: { status: 'IN_REVIEW', updatedBy: 'creator-1' },
    });
  });

  it.each([
    ['APPROVED' as const, 'PUBLISHED'],
    ['REJECTED' as const, 'REJECTED'],
  ])('writes archive template %s to the version and aggregate', async (decision, status) => {
    const tx = {
      archiveTemplateVersion: {
        update: jest.fn().mockResolvedValue({ templateId: 'template-1' }),
      },
      archiveTemplate: {
        update: jest.fn().mockResolvedValue({ id: 'template-1' }),
      },
    } as unknown as Prisma.TransactionClient;
    const service = new ReviewBusinessService();
    const decidedAt = new Date('2026-07-11T00:00:00.000Z');

    await service.applyDecision(tx, {
      sourceType: 'ARCHIVE_TEMPLATE',
      sourceId: 'version-1',
      fileVersionId: null,
      decision,
      actorUserId: 'reviewer-1',
      decidedAt,
    });

    expect(tx.archiveTemplate.update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: expect.objectContaining({ status, updatedBy: 'reviewer-1' }),
    });
  });

  it('atomically claims a STANDARD source revision and only a new DRAFT file', async () => {
    const submittedAt = new Date('2026-07-12T00:00:00.000Z');
    const tx = {
      $queryRaw: createFileVersionLockMock(),
      standardVersion: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'DRAFT',
          revision: 4,
          fileVersionId: 'file-draft',
          standardId: 'standard-1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      standard: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      fileVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'file-draft',
            logicalFileId: 'logical-draft',
            status: 'DRAFT',
            archivedAt: null,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as Prisma.TransactionClient;

    await new ReviewBusinessService().applySubmission(tx, {
      sourceType: 'STANDARD',
      sourceId: 'standard-version-1',
      sourceRevision: 4,
      fileVersionId: 'file-draft',
      submittedAt,
      submittedBy: 'editor-1',
    });

    expect(tx.standardVersion.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'standard-version-1',
        revision: 4,
        status: { in: ['DRAFT', 'REJECTED'] },
        fileVersionId: 'file-draft',
        archivedAt: null,
      },
      data: {
        status: 'IN_REVIEW',
        submittedAt,
        revision: { increment: 1 },
      },
    });
    expect(tx.fileVersion.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['file-draft'] },
        status: { in: ['DRAFT', 'UPLOADED', 'REJECTED'] },
        archivedAt: null,
      },
      data: { status: 'REVIEWING', approvedAt: null },
    });
  });

  it.each([
    ['STANDARD' as const, 'standardVersion', '标准'],
    ['KNOWLEDGE' as const, 'knowledgeVersion', '知识条目'],
  ])('rejects %s submission while its aggregate is archived under lock', async (
    sourceType,
    versionDelegate,
    label,
  ) => {
    const findUnique = jest.fn();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        { id: 'aggregate-1', archived_at: new Date('2026-07-13T00:00:00.000Z') },
      ]),
      [versionDelegate]: { findUnique },
    } as unknown as Prisma.TransactionClient;

    await expect(
      new ReviewBusinessService().applySubmission(tx, {
        sourceType,
        sourceId: 'version-1',
        sourceRevision: 1,
        fileVersionId: 'file-1',
        submittedAt: new Date('2026-07-13T01:00:00.000Z'),
        submittedBy: 'editor-1',
      }),
    ).rejects.toThrow(`${label}已归档或不存在，不能提交审核`);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('keeps an APPROVED STANDARD file immutable when the source is submitted again', async () => {
    const tx = {
      $queryRaw: createFileVersionLockMock(),
      standardVersion: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'DRAFT',
          revision: 2,
          fileVersionId: 'file-approved',
          standardId: 'standard-1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      standard: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      fileVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'file-approved',
            logicalFileId: 'logical-approved',
            status: 'APPROVED',
            archivedAt: null,
          },
        ]),
        updateMany: jest.fn(),
      },
    } as unknown as Prisma.TransactionClient;

    await new ReviewBusinessService().applySubmission(tx, {
      sourceType: 'STANDARD',
      sourceId: 'standard-version-2',
      sourceRevision: 2,
      fileVersionId: 'file-approved',
      submittedAt: new Date('2026-07-12T00:00:00.000Z'),
      submittedBy: 'editor-1',
    });

    expect(tx.fileVersion.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['REVIEWING', null],
    ['ARCHIVED', new Date('2026-07-01T00:00:00.000Z')],
    ['PROCESSING', null],
  ])('fails closed when a submitted STANDARD file is %s', async (status, archivedAt) => {
    const tx = {
      $queryRaw: createFileVersionLockMock(),
      standardVersion: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'DRAFT',
          revision: 2,
          fileVersionId: 'file-1',
          standardId: 'standard-1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      fileVersion: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'file-1', logicalFileId: 'logical-1', status, archivedAt }]),
        updateMany: jest.fn(),
      },
      standard: { updateMany: jest.fn() },
    } as unknown as Prisma.TransactionClient;

    await expect(
      new ReviewBusinessService().applySubmission(tx, {
        sourceType: 'STANDARD',
        sourceId: 'standard-version-1',
        sourceRevision: 2,
        fileVersionId: 'file-1',
        submittedAt: new Date('2026-07-12T00:00:00.000Z'),
        submittedBy: 'editor-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.fileVersion.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a missing or stale STANDARD revision snapshot before claiming files', async () => {
    const updateMany = jest.fn();
    const tx = {
      $queryRaw: createFileVersionLockMock(),
      standardVersion: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'DRAFT',
          revision: 3,
          fileVersionId: 'file-1',
          standardId: 'standard-1',
        }),
        updateMany,
      },
    } as unknown as Prisma.TransactionClient;
    const service = new ReviewBusinessService();
    const baseInput = {
      sourceType: 'STANDARD',
      sourceId: 'standard-version-1',
      fileVersionId: 'file-1',
      submittedAt: new Date('2026-07-12T00:00:00.000Z'),
      submittedBy: 'editor-1',
    };

    await expect(
      service.applySubmission(tx, { ...baseInput, sourceRevision: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.applySubmission(tx, { ...baseInput, sourceRevision: 2 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rolls back on a conditional file claim lost to another review task', async () => {
    const tx = {
      $queryRaw: createFileVersionLockMock(),
      standardVersion: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'DRAFT',
          revision: 1,
          fileVersionId: 'file-1',
          standardId: 'standard-1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      fileVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'file-1',
            logicalFileId: 'logical-1',
            status: 'UPLOADED',
            archivedAt: null,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      standard: { updateMany: jest.fn() },
    } as unknown as Prisma.TransactionClient;

    await expect(
      new ReviewBusinessService().applySubmission(tx, {
        sourceType: 'STANDARD',
        sourceId: 'standard-version-1',
        sourceRevision: 1,
        fileVersionId: 'file-1',
        submittedAt: new Date('2026-07-12T00:00:00.000Z'),
        submittedBy: 'editor-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.standard.updateMany).not.toHaveBeenCalled();
  });

  it('claims KNOWLEDGE primary and supporting files together while reusing approved content', async () => {
    const queryRaw = createFileVersionLockMock();
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'file-a-rejected',
        logicalFileId: 'logical-support-b',
        status: 'REJECTED',
        archivedAt: null,
      },
      {
        id: 'file-m-draft',
        logicalFileId: 'logical-support-a',
        status: 'DRAFT',
        archivedAt: null,
      },
      {
        id: 'file-z-approved',
        logicalFileId: 'logical-primary',
        status: 'APPROVED',
        archivedAt: null,
      },
    ]);
    const tx = {
      $queryRaw: queryRaw,
      knowledgeVersion: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'REJECTED',
          revision: 5,
          fileVersionId: 'file-z-approved',
          knowledgeItemId: 'knowledge-1',
          supportingFiles: [
            { fileVersionId: 'file-m-draft' },
            { fileVersionId: 'file-a-rejected' },
          ],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      knowledgeItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      fileVersion: {
        findMany,
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    } as unknown as Prisma.TransactionClient;

    await new ReviewBusinessService().applySubmission(tx, {
      sourceType: 'KNOWLEDGE',
      sourceId: 'knowledge-version-1',
      sourceRevision: 5,
      fileVersionId: 'file-z-approved',
      submittedAt: new Date('2026-07-12T00:00:00.000Z'),
      submittedBy: 'editor-1',
    });

    expect(queryRaw).toHaveBeenCalledTimes(2);
    const masterLockSql = queryRaw.mock.calls[0][0].strings.join('');
    expect(masterLockSql).toContain('FROM knowledge_items');
    expect(masterLockSql).toContain('FROM knowledge_versions_v2');
    const lockQuery = queryRaw.mock.calls[1][0];
    expect(lockQuery.strings.join(' ? ')).toMatch(
      /SELECT id[\s\S]*FROM file_versions[\s\S]*WHERE id IN[\s\S]*ORDER BY id[\s\S]*FOR UPDATE/,
    );
    expect(lockQuery.strings.join('')).not.toContain('file-a-rejected');
    expect(lockQuery.values).toEqual(['file-a-rejected', 'file-m-draft', 'file-z-approved']);
    expect(queryRaw.mock.invocationCallOrder[1]).toBeLessThan(findMany.mock.invocationCallOrder[0]);
    expect(tx.fileVersion.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['file-a-rejected', 'file-m-draft', 'file-z-approved'],
        },
      },
      select: { id: true, logicalFileId: true, status: true, archivedAt: true },
      orderBy: { id: 'asc' },
    });
    expect(tx.fileVersion.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['file-a-rejected', 'file-m-draft'] },
        status: { in: ['DRAFT', 'UPLOADED', 'REJECTED'] },
        archivedAt: null,
      },
      data: { status: 'REVIEWING', approvedAt: null },
    });
  });

  it.each(['APPROVED', 'REJECTED'] as const)(
    'never mutates an already APPROVED STANDARD file on a %s decision',
    async (decision) => {
      const tx = {
        $queryRaw: createFileVersionLockMock(),
        standardVersion: {
          findUnique: jest.fn().mockResolvedValue({
            status: 'IN_REVIEW',
            standardId: 'standard-1',
            fileVersionId: 'file-approved',
            effectiveAt: null,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        standard: {
          update: jest.fn().mockResolvedValue({ id: 'standard-1' }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        fileVersion: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'file-approved',
              logicalFileId: 'logical-approved',
              status: 'APPROVED',
              archivedAt: null,
            },
          ]),
          updateMany: jest.fn(),
        },
        logicalFile: { updateMany: jest.fn() },
      } as unknown as Prisma.TransactionClient;

      await new ReviewBusinessService().applyDecision(tx, {
        sourceType: 'STANDARD',
        sourceId: 'standard-version-2',
        fileVersionId: 'file-approved',
        decision,
        actorUserId: 'reviewer-1',
        decidedAt: new Date('2026-07-12T00:00:00.000Z'),
      });

      expect(tx.fileVersion.updateMany).not.toHaveBeenCalled();
      expect(tx.logicalFile.updateMany).not.toHaveBeenCalled();
    },
  );

  it('rejects only the REVIEWING STANDARD file and preserves the approved logical current', async () => {
    const tx = {
      $queryRaw: createFileVersionLockMock(),
      standardVersion: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'IN_REVIEW',
          standardId: 'standard-1',
          fileVersionId: 'file-new',
          effectiveAt: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      standard: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      fileVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'file-new',
            logicalFileId: 'logical-1',
            status: 'REVIEWING',
            archivedAt: null,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      logicalFile: {
        findUnique: jest.fn().mockResolvedValue({
          currentVersionId: 'file-approved-current',
          archivedAt: null,
          currentVersion: { status: 'APPROVED' },
        }),
        updateMany: jest.fn(),
      },
    } as unknown as Prisma.TransactionClient;

    await new ReviewBusinessService().applyDecision(tx, {
      sourceType: 'STANDARD',
      sourceId: 'standard-version-new',
      fileVersionId: 'file-new',
      decision: 'REJECTED',
      actorUserId: 'reviewer-1',
      decidedAt: new Date('2026-07-12T00:00:00.000Z'),
    });

    expect(tx.fileVersion.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['file-new'] },
        status: 'REVIEWING',
        archivedAt: null,
      },
      data: { status: 'REJECTED', approvedAt: null },
    });
    expect(tx.logicalFile.findUnique).toHaveBeenCalledWith({
      where: { id: 'logical-1' },
      select: {
        currentVersionId: true,
        archivedAt: true,
        currentVersion: { select: { status: true } },
      },
    });
    expect(tx.logicalFile.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    {
      caseLabel: 'has no current version',
      currentVersionId: null,
      currentVersion: null,
    },
    {
      caseLabel: 'has only a non-approved current version',
      currentVersionId: 'file-old-draft',
      currentVersion: { status: 'DRAFT' },
    },
  ])(
    'marks the logical file REJECTED without adopting the rejected version when it $caseLabel',
    async ({ currentVersionId, currentVersion }) => {
      const logicalFileUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const tx = {
        $queryRaw: createFileVersionLockMock(),
        standardVersion: {
          findUnique: jest.fn().mockResolvedValue({
            status: 'IN_REVIEW',
            standardId: 'standard-1',
            fileVersionId: 'file-new',
            effectiveAt: null,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        standard: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        fileVersion: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'file-new',
              logicalFileId: 'logical-1',
              status: 'REVIEWING',
              archivedAt: null,
            },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        logicalFile: {
          findUnique: jest.fn().mockResolvedValue({
            currentVersionId,
            archivedAt: null,
            currentVersion,
          }),
          updateMany: logicalFileUpdateMany,
        },
      } as unknown as Prisma.TransactionClient;

      await new ReviewBusinessService().applyDecision(tx, {
        sourceType: 'STANDARD',
        sourceId: 'standard-version-new',
        fileVersionId: 'file-new',
        decision: 'REJECTED',
        actorUserId: 'reviewer-1',
        decidedAt: new Date('2026-07-12T00:00:00.000Z'),
      });

      expect(logicalFileUpdateMany).toHaveBeenCalledWith({
        where: {
          id: 'logical-1',
          archivedAt: null,
          currentVersionId,
        },
        data: { status: 'REJECTED' },
      });
      expect(logicalFileUpdateMany.mock.calls[0][0].data).not.toHaveProperty('currentVersionId');
    },
  );

  it('approves only KNOWLEDGE files claimed by this review and promotes their logical file', async () => {
    const decidedAt = new Date('2026-07-12T00:00:00.000Z');
    const tx = {
      $queryRaw: createFileVersionLockMock(),
      knowledgeVersion: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'IN_REVIEW',
          knowledgeItemId: 'knowledge-1',
          fileVersionId: 'primary-approved',
          contentType: 'FILE',
          supportingFiles: [{ fileVersionId: 'support-new' }],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      knowledgeItem: { update: jest.fn().mockResolvedValue({ id: 'knowledge-1' }) },
      fileVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'primary-approved',
            logicalFileId: 'logical-primary',
            status: 'APPROVED',
            archivedAt: null,
          },
          {
            id: 'support-new',
            logicalFileId: 'logical-support',
            status: 'REVIEWING',
            archivedAt: null,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      logicalFile: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as Prisma.TransactionClient;

    await new ReviewBusinessService().applyDecision(tx, {
      sourceType: 'KNOWLEDGE',
      sourceId: 'knowledge-version-1',
      fileVersionId: 'primary-approved',
      decision: 'APPROVED',
      actorUserId: 'reviewer-1',
      decidedAt,
    });

    expect(tx.fileVersion.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['support-new'] },
        status: 'REVIEWING',
        archivedAt: null,
      },
      data: { status: 'APPROVED', approvedAt: decidedAt },
    });
    expect(tx.logicalFile.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.logicalFile.updateMany).toHaveBeenCalledWith({
      where: { id: 'logical-support', archivedAt: null },
      data: { currentVersionId: 'support-new', status: 'APPROVED' },
    });
    expect(tx.knowledgeItem.update).toHaveBeenCalledWith({
      where: { id: 'knowledge-1' },
      data: {
        status: 'PUBLISHED',
        currentPublishedVersionId: 'knowledge-version-1',
        effectiveAt: decidedAt,
        contentType: 'FILE',
        updatedBy: 'reviewer-1',
      },
    });
  });
});
