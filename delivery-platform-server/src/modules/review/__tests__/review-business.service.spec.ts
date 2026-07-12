import type { Prisma } from '@prisma/client';

import { ReviewBusinessService } from '../review-business.service';

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
});
