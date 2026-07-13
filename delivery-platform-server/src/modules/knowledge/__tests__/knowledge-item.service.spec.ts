import { ConflictException, UnprocessableEntityException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import type { ReviewConfigurationService } from '../../review/review-configuration.service';
import type { ReviewTaskService } from '../../review/review-task.service';
import { CreateKnowledgeVersionDto } from '../dto/knowledge-item.dto';
import { KnowledgeItemService } from '../knowledge-item.service';

interface LockQuery {
  strings: readonly string[];
  values: unknown[];
}

describe('KnowledgeItemService', () => {
  const owner = { sub: 'user-1', permissions: ['knowledge:update_draft'] };
  const reviewConfiguration = {
    resolve: jest.fn(),
  } as unknown as ReviewConfigurationService;
  const createReviewTask = jest.fn();
  const reviewTasks = {
    createTask: createReviewTask,
  } as unknown as ReviewTaskService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enforces mutually exclusive FILE, MARKDOWN and LINK primary content', async () => {
    const prisma = {
      knowledgeCategory: {
        findFirst: jest.fn().mockResolvedValue({ id: 'category-1' }),
      },
    } as unknown as PrismaService;
    const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);

    await expect(
      service.create(
        {
          title: '操作指引',
          categoryId: 'category-1',
          contentType: 'FILE',
          fileVersionId: '61f393a7-f0c0-4bf0-92e8-17482d8d7076',
          markdownContent: '# 重复主内容',
        },
        owner,
      ),
    ).rejects.toThrow(
      new UnprocessableEntityException('FILE、MARKDOWN、LINK 内容必须且只能填写对应的一种主内容'),
    );
  });

  it.each(['ftp://example.com/guide', 'javascript:alert(1)', 'not-a-url'])(
    'rejects a non-http(s) LINK URL in the service boundary: %s',
    async (externalUrl) => {
      const prisma = {
        knowledgeCategory: {
          findFirst: jest.fn().mockResolvedValue({ id: 'category-1' }),
        },
      } as unknown as PrismaService;
      const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);

      await expect(
        service.create(
          {
            title: '操作指引',
            categoryId: 'category-1',
            contentType: 'LINK',
            externalUrl,
          },
          owner,
        ),
      ).rejects.toThrow(new UnprocessableEntityException('知识链接仅允许有效的 HTTP 或 HTTPS URL'));
    },
  );

  it('rejects duplicate supporting versions and primary/supporting overlap without deduping', async () => {
    const prisma = {
      knowledgeCategory: {
        findFirst: jest.fn().mockResolvedValue({ id: 'category-1' }),
      },
    } as unknown as PrismaService;
    const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);
    const fileVersionId = '61f393a7-f0c0-4bf0-92e8-17482d8d7076';

    await expect(
      service.create(
        {
          title: '操作指引',
          categoryId: 'category-1',
          contentType: 'MARKDOWN',
          markdownContent: '# 指引',
          supportingFileVersionIds: [fileVersionId, fileVersionId],
        },
        owner,
      ),
    ).rejects.toThrow(new UnprocessableEntityException('辅助文件版本不能重复'));

    await expect(
      service.create(
        {
          title: '操作指引',
          categoryId: 'category-1',
          contentType: 'FILE',
          fileVersionId,
          supportingFileVersionIds: [fileVersionId],
        },
        owner,
      ),
    ).rejects.toThrow(new UnprocessableEntityException('主文件版本不能同时作为辅助文件版本'));
  });

  it('rejects direct master-data edits after a knowledge version has been published', async () => {
    const update = jest.fn();
    const prisma = {
      knowledgeItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'knowledge-1',
          status: 'PUBLISHED',
          createdBy: 'user-1',
          currentPublishedVersionId: 'version-1',
        }),
        update,
      },
    } as unknown as PrismaService;
    const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);

    await expect(service.update('knowledge-1', { title: '绕过版本的修改' }, owner)).rejects.toThrow(
      new ConflictException('已发布或审核中的知识条目必须通过明确的新版本修改'),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('requires an explicit supporting-file list instead of silently copying attachments', async () => {
    const prisma = {
      knowledgeItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'knowledge-1',
          status: 'PUBLISHED',
          createdBy: 'user-1',
          currentPublishedVersionId: 'version-1',
        }),
      },
      knowledgeVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;
    const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);
    const dto = Object.assign(new CreateKnowledgeVersionDto(), {
      contentType: 'MARKDOWN' as const,
      markdownContent: '# 明确的新版本',
    });

    await expect(service.createVersion('knowledge-1', dto, owner)).rejects.toThrow(
      new UnprocessableEntityException('创建或更新知识版本必须明确提交辅助文件列表'),
    );
    expect(prisma.knowledgeVersion.findUnique).toBeUndefined();
  });

  it('creates a new draft from only the explicitly submitted primary content and attachments', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const createdVersion = knowledgeVersionRecord({
      id: 'version-2',
      version: 'V1.1',
      legacySnapshot: { private: true },
      markdownContent: '# 明确的新版本',
      supportingFiles: [supportingFileRecord('support-2', 'support-two.pdf')],
    });
    const transaction = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([lockedKnowledgeItemRecord()])
        .mockResolvedValueOnce([]),
      knowledgeVersion: {
        create: jest.fn().mockResolvedValue({
          id: 'version-2',
          version: 'V1.1',
          status: 'DRAFT',
        }),
        findUnique: jest.fn().mockResolvedValue(createdVersion),
      },
      knowledgeVersionFile: { createMany },
      fileVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'support-2',
            assetId: 'asset-2',
            logicalFile: {
              id: 'logical-2',
              ownerType: 'KNOWLEDGE',
              ownerId: 'knowledge-1',
              archivedAt: null,
            },
          },
        ]),
      },
      logicalFile: { update: jest.fn() },
      fileAsset: { update: jest.fn() },
      knowledgeItem: { update: jest.fn() },
    };
    const prisma = {
      knowledgeItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'knowledge-1',
          status: 'PUBLISHED',
          createdBy: 'user-1',
          currentPublishedVersionId: 'version-1',
        }),
      },
      knowledgeVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ version: 'V1.0' }]),
      },
      fileVersion: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);

    const result = await service.createVersion(
      'knowledge-1',
      {
        contentType: 'MARKDOWN',
        fileVersionId: null,
        markdownContent: '# 明确的新版本',
        externalUrl: null,
        supportingFileVersionIds: ['support-2'],
      },
      owner,
    );

    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          knowledgeVersionId: 'version-2',
          fileVersionId: 'support-2',
          role: 'SUPPORTING',
          sortOrder: 0,
        },
      ],
    });
    expect(transaction.knowledgeVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contentType: 'MARKDOWN',
        fileVersionId: null,
        markdownContent: '# 明确的新版本',
        externalUrl: null,
      }),
      select: { id: true },
    });
    expect(transaction.knowledgeItem.update).toHaveBeenCalledWith({
      where: { id: 'knowledge-1' },
      data: { updatedBy: 'user-1', updatedAt: expect.any(Date) },
    });
    expect(result).not.toHaveProperty('legacySnapshot');
    expect(result).not.toHaveProperty('supportingFiles.0.fileVersion.idempotencyKey');
    expect(result).not.toHaveProperty('supportingFiles.0.fileVersion.asset.storageBucket');
    expect(result).not.toHaveProperty('supportingFiles.0.fileVersion.asset.storageKey');
  });

  it('serializes differently named draft creations on the knowledge-item row', async () => {
    let activeVersionId: string | null = null;
    let createSequence = 0;
    let transactionTail: Promise<void> = Promise.resolve();
    const queryRaw = jest.fn(async (query: LockQuery) => {
      const sql = query.strings.join(' ');
      if (sql.includes('FROM knowledge_items')) {
        return [lockedKnowledgeItemRecord()];
      }
      if (sql.includes('FROM knowledge_versions_v2')) {
        return activeVersionId
          ? [{ id: activeVersionId, status: 'DRAFT', archived_at: null }]
          : [];
      }
      throw new Error(`Unexpected lock query: ${sql}`);
    });
    const transaction = {
      $queryRaw: queryRaw,
      knowledgeVersion: {
        create: jest.fn().mockImplementation(async () => {
          createSequence += 1;
          activeVersionId = `created-version-${createSequence}`;
          return { id: activeVersionId };
        }),
        findUnique: jest.fn().mockImplementation(async () =>
          knowledgeVersionRecord({
            id: activeVersionId ?? 'missing-version',
            version: 'V1.1',
            markdownContent: '# 并发版本',
          }),
        ),
      },
      knowledgeVersionFile: { createMany: jest.fn() },
      knowledgeItem: { update: jest.fn().mockResolvedValue({ id: 'knowledge-1' }) },
    };
    const prisma = {
      knowledgeItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'knowledge-1',
          status: 'PUBLISHED',
          createdBy: 'user-1',
          currentPublishedVersionId: 'published-version-1',
        }),
      },
      knowledgeVersion: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(
        (callback: (tx: typeof transaction) => Promise<unknown>): Promise<unknown> => {
          const result = transactionTail.then(() => callback(transaction));
          transactionTail = result.then(
            () => undefined,
            () => undefined,
          );
          return result;
        },
      ),
    } as unknown as PrismaService;
    const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);
    const first = service.createVersion(
      'knowledge-1',
      {
        version: 'V1.1',
        contentType: 'MARKDOWN',
        markdownContent: '# 并发版本 A',
        supportingFileVersionIds: [],
      },
      owner,
    );
    const second = service.createVersion(
      'knowledge-1',
      {
        version: 'V1.2',
        contentType: 'MARKDOWN',
        markdownContent: '# 并发版本 B',
        supportingFileVersionIds: [],
      },
      owner,
    );

    const results = await Promise.allSettled([first, second]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejected?.reason).toEqual(
      new ConflictException('该知识条目已有草稿或审核中版本'),
    );
    expect(transaction.knowledgeVersion.create).toHaveBeenCalledTimes(1);
    expect(queryRaw).toHaveBeenCalledTimes(4);
    const lockSql = queryRaw.mock.calls.map(([query]) => query.strings.join(' '));
    expect(lockSql[0]).toMatch(/FROM knowledge_items[\s\S]*WHERE id =[\s\S]*FOR UPDATE/);
    expect(lockSql[1]).toMatch(
      /FROM knowledge_versions_v2[\s\S]*WHERE knowledge_item_id =[\s\S]*ORDER BY id[\s\S]*FOR UPDATE/,
    );
    expect(lockSql[2]).toMatch(/FROM knowledge_items[\s\S]*WHERE id =[\s\S]*FOR UPDATE/);
    expect(lockSql[3]).toMatch(
      /FROM knowledge_versions_v2[\s\S]*WHERE knowledge_item_id =[\s\S]*ORDER BY id[\s\S]*FOR UPDATE/,
    );
    for (const [query] of queryRaw.mock.calls) {
      expect(query.strings.join('')).not.toContain('knowledge-1');
      expect(query.values).toEqual(['knowledge-1']);
    }
  });

  it('rejects a supporting file owned by another knowledge item in the create-version transaction', async () => {
    const transaction = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([lockedKnowledgeItemRecord()])
        .mockResolvedValueOnce([]),
      knowledgeVersion: {
        create: jest.fn().mockResolvedValue({ id: 'version-2' }),
        findUnique: jest.fn(),
      },
      knowledgeVersionFile: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      fileVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'primary-1',
            assetId: 'asset-primary',
            logicalFile: {
              id: 'logical-primary',
              ownerType: 'KNOWLEDGE',
              ownerId: 'knowledge-1',
              archivedAt: null,
            },
          },
          {
            id: 'support-other',
            assetId: 'asset-support',
            logicalFile: {
              id: 'logical-support',
              ownerType: 'KNOWLEDGE',
              ownerId: 'knowledge-other',
              archivedAt: null,
            },
          },
        ]),
      },
      logicalFile: { update: jest.fn() },
      fileAsset: { update: jest.fn() },
      knowledgeItem: { update: jest.fn() },
    };
    const prisma = {
      knowledgeItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'knowledge-1',
          status: 'PUBLISHED',
          createdBy: 'user-1',
          currentPublishedVersionId: 'version-1',
        }),
      },
      knowledgeVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ version: 'V1.0' }]),
      },
      fileVersion: { count: jest.fn().mockResolvedValue(2) },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);

    await expect(
      service.createVersion(
        'knowledge-1',
        {
          contentType: 'FILE',
          fileVersionId: 'primary-1',
          markdownContent: null,
          externalUrl: null,
          supportingFileVersionIds: ['support-other'],
        },
        owner,
      ),
    ).rejects.toThrow(new UnprocessableEntityException('文件不属于当前知识条目或当前用户草稿'));
    expect(transaction.knowledgeItem.update).not.toHaveBeenCalled();
    expect(transaction.knowledgeVersion.findUnique).not.toHaveBeenCalled();
  });

  it('submits a knowledge version through the unified review services', async () => {
    const prisma = {
      knowledgeVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-1',
          version: 'V1.0',
          status: 'DRAFT',
          revision: 4,
          contentType: 'MARKDOWN',
          fileVersionId: null,
          markdownContent: '# 指引',
          externalUrl: null,
          archivedAt: null,
          supportingFiles: [],
          knowledgeItem: {
            id: 'knowledge-1',
            title: '操作指引',
            createdBy: 'user-1',
            archivedAt: null,
          },
        }),
      },
    } as unknown as PrismaService;
    jest.spyOn(reviewConfiguration, 'resolve').mockResolvedValue({
      approvalTemplateId: 'template-1',
      approvalTemplateVersion: '2026-07-11T00:00:00.000Z',
      snapshot: { id: 'template-1' },
      reviewMode: 'SINGLE',
      steps: [{ mode: 'SINGLE', assigneeUserIds: ['reviewer-1'] }],
    });
    createReviewTask.mockResolvedValue({ id: 'task-1', status: 'PENDING' });
    const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);

    const result = await service.submitReview(
      'version-1',
      { approvalTemplateId: 'template-1', revision: 4 },
      owner,
    );

    expect(createReviewTask).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'KNOWLEDGE',
        sourceId: 'version-1',
        sourceVersionId: 'version-1',
        sourceRevision: 4,
        submittedBy: 'user-1',
      }),
    );
    expect(result).toEqual({ id: 'task-1', status: 'PENDING' });
  });

  it('locks item, versions and active review tasks before refusing archive', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([lockedKnowledgeItemRecord({ status: 'DRAFT' })])
      .mockResolvedValueOnce([
        { id: 'version-1', status: 'DRAFT', archived_at: null },
      ])
      .mockResolvedValueOnce([{ id: 'task-1', status: 'PENDING' }]);
    const transaction = {
      $queryRaw: queryRaw,
      knowledgeItem: { updateMany: jest.fn() },
      knowledgeVersion: { updateMany: jest.fn() },
      operationLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);

    await expect(
      service.archive('knowledge-1', {
        sub: 'manager-1',
        permissions: ['knowledge:archive'],
      }),
    ).rejects.toThrow(new ConflictException('知识条目存在审核中版本，不能归档'));

    expect(queryRaw).toHaveBeenCalledTimes(3);
    const lockQueries = queryRaw.mock.calls.map(([query]) => query as LockQuery);
    expect(lockQueries[0].strings.join(' ')).toMatch(
      /FROM knowledge_items[\s\S]*WHERE id =[\s\S]*FOR UPDATE/,
    );
    expect(lockQueries[1].strings.join(' ')).toMatch(
      /FROM knowledge_versions_v2[\s\S]*ORDER BY id[\s\S]*FOR UPDATE/,
    );
    expect(lockQueries[2].strings.join(' ')).toMatch(
      /FROM review_tasks[\s\S]*active_review_key IS NOT NULL[\s\S]*ORDER BY id[\s\S]*FOR UPDATE/,
    );
    expect(lockQueries[0].strings.join('')).not.toContain('knowledge-1');
    expect(lockQueries[1].strings.join('')).not.toContain('knowledge-1');
    expect(lockQueries[2].strings.join('')).not.toContain('knowledge-1');
    expect(lockQueries[0].values).toEqual(['knowledge-1']);
    expect(lockQueries[1].values).toEqual(['knowledge-1']);
    expect(lockQueries[2].values).toEqual([
      'knowledge-1',
      'version-1',
      'version-1',
    ]);
    expect(transaction.knowledgeItem.updateMany).not.toHaveBeenCalled();
    expect(transaction.knowledgeVersion.updateMany).not.toHaveBeenCalled();
    expect(transaction.operationLog.create).not.toHaveBeenCalled();
  });

  it('archives the locked aggregate with item and version compare-and-set updates', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([lockedKnowledgeItemRecord({ status: 'PUBLISHED' })])
      .mockResolvedValueOnce([
        { id: 'draft-version', status: 'DRAFT', archived_at: null },
        { id: 'published-version', status: 'PUBLISHED', archived_at: null },
        { id: 'rejected-version', status: 'REJECTED', archived_at: null },
      ])
      .mockResolvedValueOnce([]);
    const transaction = {
      $queryRaw: queryRaw,
      knowledgeItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      knowledgeVersion: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      operationLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
        ),
    } as unknown as PrismaService;
    const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);

    const result = await service.archive('knowledge-1', {
      sub: 'manager-1',
      permissions: ['knowledge:archive'],
    });

    expect(transaction.knowledgeItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'knowledge-1', archivedAt: null, status: { not: 'IN_REVIEW' } },
      data: {
        status: 'ARCHIVED',
        archivedAt: expect.any(Date),
        updatedBy: 'manager-1',
      },
    });
    expect(transaction.knowledgeVersion.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['draft-version', 'rejected-version'] },
        knowledgeItemId: 'knowledge-1',
        status: { in: ['DRAFT', 'REJECTED'] },
        archivedAt: null,
      },
      data: { status: 'ARCHIVED', archivedAt: expect.any(Date) },
    });
    expect(transaction.operationLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'manager-1',
        module: 'knowledge',
        action: 'archive',
        targetType: 'knowledge_item',
        targetId: 'knowledge-1',
      },
    });
    expect(result).toEqual({
      id: 'knowledge-1',
      status: 'ARCHIVED',
      archivedAt: expect.any(Date),
    });
  });

  it('never exposes snapshots or storage metadata from main and supporting files', async () => {
    const versionFindMany = jest.fn().mockResolvedValue([
      knowledgeVersionRecord({
        legacySnapshot: { internalWorkflow: 'legacy' },
        fileVersionId: 'main-file-version',
        fileVersion: publicFileVersionWithInternalMetadata('main-file-version', 'main-guide.pdf'),
        supportingFiles: [supportingFileRecord('support-file-version', 'attachment.pdf')],
      }),
    ]);
    const prisma = {
      reviewTask: { findMany: jest.fn().mockResolvedValue([]) },
      knowledgeItem: {
        findFirst: jest.fn().mockResolvedValue(
          knowledgeItemRecord({
            legacySnapshot: { internalMasterState: true },
          }),
        ),
      },
      knowledgeVersion: { findMany: versionFindMany },
    } as unknown as PrismaService;
    const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);

    const result = await service.findById('knowledge-1', {
      sub: 'manager-1',
      permissions: ['knowledge:publish'],
    });

    expect(result).not.toHaveProperty('legacySnapshot');
    expect(result).not.toHaveProperty('versions.0.legacySnapshot');
    expect(result).not.toHaveProperty('versions.0.fileVersion.idempotencyKey');
    expect(result).not.toHaveProperty('versions.0.fileVersion.asset.storageBucket');
    expect(result).not.toHaveProperty('versions.0.fileVersion.asset.storageKey');
    expect(result).not.toHaveProperty('versions.0.supportingFiles.0.fileVersion.idempotencyKey');
    expect(result).not.toHaveProperty(
      'versions.0.supportingFiles.0.fileVersion.asset.storageBucket',
    );
    expect(result).not.toHaveProperty('versions.0.supportingFiles.0.fileVersion.asset.storageKey');
    expect(result).toHaveProperty(
      'versions.0.supportingFiles.0.fileVersion.asset.originalName',
      'attachment.pdf',
    );
    expect(versionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          fileVersion: expect.objectContaining({
            select: expect.objectContaining({
              asset: expect.objectContaining({
                select: expect.not.objectContaining({
                  storageBucket: true,
                  storageKey: true,
                  checksum: true,
                }),
              }),
            }),
          }),
          supportingFiles: expect.objectContaining({
            select: expect.objectContaining({
              fileVersion: expect.objectContaining({
                select: expect.objectContaining({
                  asset: expect.objectContaining({
                    select: expect.not.objectContaining({
                      storageBucket: true,
                      storageKey: true,
                      checksum: true,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    );
    expect(versionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ legacySnapshot: true }),
      }),
    );
  });

  it('does not expose draft versions through a published master record', async () => {
    const versionFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      reviewTask: { findMany: jest.fn().mockResolvedValue([]) },
      knowledgeItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'knowledge-1',
          title: '公开知识',
          categoryId: 'category-1',
          summary: null,
          contentType: 'MARKDOWN',
          status: 'PUBLISHED',
          currentPublishedVersionId: 'version-1',
          effectiveAt: null,
          createdBy: 'owner-1',
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          category: { id: 'category-1', name: '交付' },
          creator: { id: 'owner-1', realName: '作者' },
        }),
      },
      knowledgeVersion: { findMany: versionFindMany },
    } as unknown as PrismaService;
    const service = new KnowledgeItemService(prisma, reviewConfiguration, reviewTasks);

    await service.findById('knowledge-1', {
      sub: 'reader-1',
      permissions: ['knowledge:view'],
    });

    expect(versionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          knowledgeItemId: 'knowledge-1',
          OR: [{ status: 'PUBLISHED' }],
        },
      }),
    );
  });
});

function knowledgeItemRecord(overrides: Record<string, unknown> = {}) {
  const timestamp = new Date('2026-07-13T00:00:00.000Z');
  return {
    id: 'knowledge-1',
    title: '操作指引',
    categoryId: 'category-1',
    summary: null,
    contentType: 'FILE',
    status: 'DRAFT',
    currentPublishedVersionId: null,
    currentPublishedVersion: null,
    effectiveAt: null,
    createdBy: 'owner-1',
    updatedBy: 'owner-1',
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    category: { id: 'category-1', name: '交付' },
    creator: { id: 'owner-1', realName: '创建人' },
    updater: { id: 'owner-1', realName: '创建人' },
    ...overrides,
  };
}

function lockedKnowledgeItemRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'knowledge-1',
    status: 'PUBLISHED',
    created_by: 'user-1',
    current_published_version_id: 'published-version-1',
    archived_at: null,
    ...overrides,
  };
}

function knowledgeVersionRecord(overrides: Record<string, unknown> = {}) {
  const timestamp = new Date('2026-07-13T00:00:00.000Z');
  return {
    id: 'version-1',
    knowledgeItemId: 'knowledge-1',
    version: 'V1.0',
    contentType: 'MARKDOWN',
    fileVersionId: null,
    fileVersion: null,
    markdownContent: '# 操作指引',
    externalUrl: null,
    supportingFiles: [],
    status: 'DRAFT',
    revision: 1,
    changeDescription: null,
    submittedBy: 'owner-1',
    submitter: { id: 'owner-1', realName: '创建人' },
    publishedAt: null,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function supportingFileRecord(fileVersionId: string, originalName: string, sortOrder = 0) {
  return {
    id: `supporting-${fileVersionId}`,
    fileVersionId,
    role: 'SUPPORTING',
    sortOrder,
    internalNote: 'private relation metadata',
    fileVersion: publicFileVersionWithInternalMetadata(fileVersionId, originalName),
  };
}

function publicFileVersionWithInternalMetadata(id: string, originalName: string) {
  return {
    id,
    logicalFileId: `logical-${id}`,
    version: 1,
    status: 'APPROVED',
    idempotencyKey: `internal-${id}`,
    uploadedBy: 'owner-1',
    asset: {
      id: `asset-${id}`,
      originalName,
      extension: 'pdf',
      mimeType: 'application/pdf',
      size: BigInt(1024),
      storageBucket: 'private-bucket',
      storageKey: `private/${originalName}`,
      checksum: 'private-checksum',
    },
  };
}
