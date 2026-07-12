import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import type { PrismaService } from '../../../database/prisma.service';
import type { OperationLogService } from '../../operation-log/operation-log.service';
import { IntegrationService, type ExternalNotificationReceipt } from '../integration.service';

interface IntegrationRecordFixture {
  id: string;
  provider: string;
  configName: string;
  configValue: Prisma.JsonValue;
  encryptedConfig: string | null;
  isEnabled: boolean;
  description: string | null;
  contactSyncLeaseOwner: string | null;
  contactSyncLeaseExpiresAt: Date | null;
  contactSyncRevision: number;
  lastContactSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ContactFixture {
  externalUserId: string;
  identifierType: 'OPEN_ID' | 'USER_ID';
  realName: string;
  phone?: string;
  email?: string;
}

interface ContactSyncLeaseFixture {
  owner: string;
  revision: number;
}

interface IntegrationInternals {
  acquireContactSyncLease(record: IntegrationRecordFixture): Promise<ContactSyncLeaseFixture>;
  persistUnifiedContacts(
    record: IntegrationRecordFixture,
    provider: 'FEISHU' | 'WECOM',
    contacts: ContactFixture[],
    lease: ContactSyncLeaseFixture,
  ): Promise<{
    total: number;
    added: number;
    updated: number;
    disabled: number;
    conflicts: number;
  }>;
  encryptSecrets(provider: 'FEISHU' | 'WECOM', secrets: Record<string, unknown>): string;
}

describe('IntegrationService secured configuration', () => {
  const encryptionKey = Buffer.alloc(32, 7).toString('base64');

  function configService(value = encryptionKey): ConfigService {
    return {
      get: jest.fn().mockReturnValue(value),
    } as unknown as ConfigService;
  }

  function operationLog(): OperationLogService {
    return {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as OperationLogService;
  }

  it('stores secrets only in AES-GCM ciphertext and returns a mask', async () => {
    const create = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'integration-1',
      description: null,
      updatedAt: new Date('2026-07-11T00:00:00.000Z'),
      ...data,
    }));
    const prisma = {
      integrationConfig: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
      },
    } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(), operationLog());

    const result = await service.update(
      'FEISHU',
      {
        configName: '飞书集成',
        appId: 'app-1',
        appSecret: 'real-secret-value',
        isEnabled: true,
      },
      'admin-1',
    );

    const persisted = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(persisted.configValue).toEqual({ appId: 'app-1' });
    expect(String(persisted.encryptedConfig)).toMatch(/^v1:/);
    expect(String(persisted.encryptedConfig)).not.toContain('real-secret-value');
    expect(result.configuration).toEqual(
      expect.objectContaining({ appId: 'app-1', appSecret: '******' }),
    );
    expect(JSON.stringify(result)).not.toContain('real-secret-value');
  });

  it('does not treat retired plaintext fields as an active secret configuration', async () => {
    const prisma = {
      integrationConfig: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'integration-1',
            provider: 'FEISHU',
            configName: '飞书集成',
            configValue: { appId: 'app-1', appSecret: 'legacy-secret' },
            encryptedConfig: null,
            isEnabled: false,
            description: null,
            updatedAt: new Date('2026-07-11T00:00:00.000Z'),
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(''), operationLog());

    const result = await service.findAll();

    expect(result[0].configuration).toEqual(
      expect.objectContaining({ appId: 'app-1', appSecret: null }),
    );
    expect(JSON.stringify(result)).not.toContain('legacy-secret');
  });

  it('rejects a masked placeholder as a Secret update', async () => {
    const prisma = {
      integrationConfig: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(), operationLog());

    await expect(
      service.update('FEISHU', { appId: 'app-1', appSecret: '******' }, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails a sensitive test safely when the encryption key is unavailable', async () => {
    const syncLogCreate = jest.fn().mockResolvedValue({ id: 'sync-log-1' });
    const prisma = {
      integrationConfig: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'integration-1',
          provider: 'FEISHU',
          configName: '飞书集成',
          configValue: { appId: 'app-1' },
          encryptedConfig: 'v1:invalid:invalid:invalid',
          isEnabled: true,
          description: null,
          updatedAt: new Date('2026-07-11T00:00:00.000Z'),
        }),
      },
      integrationSyncLog: { create: syncLogCreate },
    } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(''), operationLog());

    await expect(service.testConnection('FEISHU', 'admin-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(syncLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'FAILED', provider: 'FEISHU' }),
    });
  });

  it('rejects retired provider aliases at the runtime boundary', async () => {
    const prisma = {
      integrationConfig: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(), operationLog());

    await expect(service.findByProvider('enterprise_wechat')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.integrationConfig.findFirst).not.toHaveBeenCalled();
  });

  it('returns sync logs with the target flat pagination contract', async () => {
    const item = {
      id: 'log-1',
      provider: 'FEISHU',
      action: 'CONTACT_SYNC',
      status: 'SUCCESS',
    };
    const prisma = {
      integrationSyncLog: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([item]),
      },
    } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(), operationLog());

    await expect(service.findSyncLogs('FEISHU', { page: 2, pageSize: 5 })).resolves.toEqual({
      items: [item],
      page: 2,
      pageSize: 5,
      total: 1,
    });
  });

  it('uses a revisioned compare-and-set lease to reject concurrent contact sync', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const prisma = {
      integrationConfig: { updateMany },
    } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(), operationLog());
    const internals = service as unknown as IntegrationInternals;
    const record = integrationRecordFixture();

    const firstLease = await internals.acquireContactSyncLease(record);
    await expect(internals.acquireContactSyncLease(record)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(firstLease).toEqual({ owner: expect.any(String), revision: 1 });
    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: record.id,
          contactSyncRevision: 0,
        }),
        data: expect.objectContaining({ contactSyncRevision: { increment: 1 } }),
      }),
    );
  });

  it('transactionally provisions the unified user and external identity without candidate writes', async () => {
    const integrationUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const externalIdentityCreate = jest.fn().mockResolvedValue({ id: 'identity-1' });
    const userCreate = jest.fn().mockResolvedValue({ id: 'user-1' });
    const tx = {
      integrationConfig: { updateMany: integrationUpdateMany },
      externalIdentity: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: externalIdentityCreate,
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        count: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        create: userCreate,
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const transaction = jest.fn((run: (client: typeof tx) => Promise<unknown>) => run(tx));
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(), operationLog());
    const internals = service as unknown as IntegrationInternals;

    const result = await internals.persistUnifiedContacts(
      integrationRecordFixture(),
      'FEISHU',
      [
        {
          externalUserId: 'open-id-1',
          identifierType: 'OPEN_ID',
          realName: '同步用户',
          email: 'person@example.com',
          phone: '+8613800000000',
        },
      ],
      { owner: 'lease-1', revision: 1 },
    );

    expect(result).toEqual({
      total: 1,
      added: 1,
      updated: 0,
      disabled: 0,
      conflicts: 0,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: expect.stringMatching(/^fs_[a-f0-9]{40}$/),
        realName: '同步用户',
        status: 'Active',
      }),
      select: { id: true },
    });
    expect(externalIdentityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        provider: 'FEISHU',
        externalUserId: 'open-id-1',
        identifierType: 'OPEN_ID',
        userProvisioned: true,
      }),
    });
    expect(integrationUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactSyncLeaseOwner: null,
          lastContactSyncAt: expect.any(Date),
        }),
      }),
    );
  });

  it('counts ambiguous exact email or phone matches as conflicts', async () => {
    const tx = {
      integrationConfig: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      externalIdentity: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        count: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'user-email', email: 'person@example.com', phone: null },
          { id: 'user-phone', email: null, phone: '+8613800000000' },
        ]),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) => run(tx)),
    } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(), operationLog());

    const result = await (service as unknown as IntegrationInternals).persistUnifiedContacts(
      integrationRecordFixture(),
      'FEISHU',
      [
        {
          externalUserId: 'open-id-1',
          identifierType: 'OPEN_ID',
          realName: '冲突用户',
          email: 'person@example.com',
          phone: '+8613800000000',
        },
      ],
      { owner: 'lease-1', revision: 1 },
    );

    expect(result.conflicts).toBe(1);
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.externalIdentity.create).not.toHaveBeenCalled();
  });

  it('deactivates only auto-provisioned users with no other active identity', async () => {
    const userUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      integrationConfig: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      externalIdentity: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ id: 'identity-1', userId: 'user-1' }]),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1),
      },
      user: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: userUpdateMany,
      },
    };
    const prisma = {
      $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) => run(tx)),
    } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(), operationLog());

    const result = await (service as unknown as IntegrationInternals).persistUnifiedContacts(
      integrationRecordFixture(),
      'FEISHU',
      [],
      { owner: 'lease-1', revision: 1 },
    );

    expect(result.disabled).toBe(1);
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        deletedAt: null,
        status: { not: 'Locked' },
      },
      data: { status: 'Inactive' },
    });
  });

  it('uses a stable bounded Feishu uuid for provider-side idempotency', async () => {
    const prisma = {
      integrationConfig: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(), operationLog());
    const internals = service as unknown as IntegrationInternals;
    const record = integrationRecordFixture({
      provider: 'FEISHU',
      configValue: { appId: 'app-id' },
      encryptedConfig: internals.encryptSecrets('FEISHU', {
        appSecret: 'test-secret',
      }),
      isEnabled: true,
    });
    (
      prisma.integrationConfig.findFirst as jest.MockedFunction<
        typeof prisma.integrationConfig.findFirst
      >
    ).mockResolvedValue(record);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'token-1' }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { message_id: 'msg-1' } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'token-2' }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { message_id: 'msg-1' } }));
    try {
      const receipts: ExternalNotificationReceipt[] = [];
      receipts.push(
        await service.sendNotification({
          provider: 'FEISHU',
          recipientId: 'open-id-1',
          identifierType: 'OPEN_ID',
          title: '待审核',
          content: '请处理',
          idempotencyKey: 'event-1:user-1:FEISHU',
        }),
      );
      receipts.push(
        await service.sendNotification({
          provider: 'FEISHU',
          recipientId: 'open-id-1',
          identifierType: 'OPEN_ID',
          title: '待审核',
          content: '请处理',
          idempotencyKey: 'event-1:user-1:FEISHU',
        }),
      );

      const messageBodies = fetchMock.mock.calls
        .filter(([url]) => String(url).includes('/im/v1/messages'))
        .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
      expect(messageBodies).toHaveLength(2);
      expect(messageBodies[0].uuid).toBe(messageBodies[1].uuid);
      expect(String(messageBodies[0].uuid)).toHaveLength(50);
      expect(receipts).toEqual([
        { provider: 'FEISHU', receiptId: 'msg-1' },
        { provider: 'FEISHU', receiptId: 'msg-1' },
      ]);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('enables Enterprise WeChat duplicate checking for retry safety', async () => {
    const prisma = {
      integrationConfig: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(), operationLog());
    const internals = service as unknown as IntegrationInternals;
    const record = integrationRecordFixture({
      provider: 'WECOM',
      configValue: { corpId: 'corp-id', agentId: '1000001' },
      encryptedConfig: internals.encryptSecrets('WECOM', {
        secret: 'test-secret',
      }),
      isEnabled: true,
    });
    (
      prisma.integrationConfig.findFirst as jest.MockedFunction<
        typeof prisma.integrationConfig.findFirst
      >
    ).mockResolvedValue(record);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ errcode: 0, access_token: 'token-1' }))
      .mockResolvedValueOnce(jsonResponse({ errcode: 0, msgid: 'msg-1' }));
    try {
      await service.sendNotification({
        provider: 'WECOM',
        recipientId: 'wecom-user-1',
        identifierType: 'USER_ID',
        title: '待审核',
        content: '请处理',
        idempotencyKey: 'event-1:user-1:WECOM',
      });

      const [, request] = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/message/send'),
      ) ?? [undefined, undefined];
      const body = JSON.parse(String(request?.body)) as Record<string, unknown>;
      expect(body).toEqual(
        expect.objectContaining({
          enable_duplicate_check: 1,
          duplicate_check_interval: 1800,
        }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });
});

function integrationRecordFixture(
  overrides: Partial<IntegrationRecordFixture> = {},
): IntegrationRecordFixture {
  return {
    id: 'integration-1',
    provider: 'FEISHU',
    configName: '接口集成',
    configValue: {},
    encryptedConfig: null,
    isEnabled: true,
    description: null,
    contactSyncLeaseOwner: null,
    contactSyncLeaseExpiresAt: null,
    contactSyncRevision: 0,
    lastContactSyncAt: null,
    createdAt: new Date('2026-07-12T00:00:00.000Z'),
    updatedAt: new Date('2026-07-12T00:00:00.000Z'),
    ...overrides,
  };
}

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
