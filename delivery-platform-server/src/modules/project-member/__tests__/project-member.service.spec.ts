import { ConflictException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import type { OperationLogService } from '../../operation-log/operation-log.service';
import type { ProjectAccessService } from '../../project/project-access.service';
import { ProjectMemberService } from '../project-member.service';

describe('ProjectMemberService soft-delete contract', () => {
  const projectAccess = {
    assertProjectAccess: jest.fn().mockResolvedValue(undefined),
  } as unknown as ProjectAccessService;
  const operationLog = {
    log: jest.fn().mockResolvedValue(undefined),
  } as unknown as OperationLogService;

  beforeEach(() => jest.clearAllMocks());

  it('lists only active project memberships', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { projectMember: { findMany } } as unknown as PrismaService;
    const service = new ProjectMemberService(prisma, projectAccess, operationLog);

    await service.findByProject('project-1', 'operator-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'project-1', deletedAt: null } }),
    );
  });

  it('reactivates a removed member and writes the audit record in the same transaction', async () => {
    const restored = {
      id: 'member-1',
      projectId: 'project-1',
      userId: 'user-1',
      projectRole: 'SOFTWARE_ENGINEER',
      permissionLevel: 'Member',
      dataScope: 'PROJECT',
      createdAt: new Date(),
    };
    const tx = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      projectMember: {
        findUnique: jest.fn().mockResolvedValue({ id: 'member-1', deletedAt: new Date() }),
        update: jest.fn().mockResolvedValue(restored),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ProjectMemberService(prisma, projectAccess, operationLog);

    await expect(
      service.addMember(
        'project-1',
        { userId: 'user-1', projectRole: 'SOFTWARE_ENGINEER' },
        'operator-1',
      ),
    ).resolves.toEqual(restored);

    expect(tx.projectMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'member-1' },
        data: expect.objectContaining({ deletedAt: null, projectRole: 'SOFTWARE_ENGINEER' }),
      }),
    );
    expect(operationLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'restore', targetId: 'member-1' }),
      tx,
    );
  });

  it('rejects adding an already-active membership', async () => {
    const tx = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      projectMember: {
        findUnique: jest.fn().mockResolvedValue({ id: 'member-1', deletedAt: null }),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ProjectMemberService(prisma, projectAccess, operationLog);

    await expect(
      service.addMember(
        'project-1',
        { userId: 'user-1', projectRole: 'SOFTWARE_ENGINEER' },
        'operator-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('soft-deletes membership and audits atomically without a physical delete', async () => {
    const tx = {
      projectMember: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'member-1',
          userId: 'user-1',
          projectRole: 'SOFTWARE_ENGINEER',
          dataScope: 'PROJECT',
        }),
        update: jest.fn().mockResolvedValue({ id: 'member-1' }),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ProjectMemberService(prisma, projectAccess, operationLog);

    await service.removeMember('project-1', 'member-1', 'operator-1');

    expect(tx.projectMember.findFirst).toHaveBeenCalledWith({
      where: { id: 'member-1', projectId: 'project-1', deletedAt: null },
    });
    expect(tx.projectMember.update).toHaveBeenCalledWith({
      where: { id: 'member-1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(operationLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'remove', targetId: 'member-1' }),
      tx,
    );
  });
});
