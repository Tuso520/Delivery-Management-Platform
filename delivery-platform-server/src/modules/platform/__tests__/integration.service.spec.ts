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
  identifierType: 'OPEN_ID';
  openId?: string;
  unionId?: string;
  tenantUserId?: string;
  tenantKey?: string;
  realName: string;
  phone?: string;
  email?: string;
  departmentIds: string[];
  active: boolean;
}

interface DirectoryFixture {
  contacts: ContactFixture[];
  departments: Array<{
    externalDepartmentId: string;
    parentExternalDepartmentId?: string;
    name: string;
    order: number;
    active: boolean;
  }>;
  skipped: number;
}

interface ContactSyncLeaseFixture {
  owner: string;
  revision: number;
}

interface IntegrationInternals {
  fetchFeishuDirectory(
    token: string,
    configuration: Record<string, unknown>,
  ): Promise<DirectoryFixture>;
  acquireContactSyncLease(record: IntegrationRecordFixture): Promise<ContactSyncLeaseFixture>;
  persistUnifiedContacts(
    record: IntegrationRecordFixture,
    provider: 'FEISHU',
    directory: DirectoryFixture,
    lease: ContactSyncLeaseFixture,
  ): Promise<{
    total: number;
    added: number;
    updated: number;
    disabled: number;
    skipped: number;
    failed: number;
    departments: number;
  }>;
  encryptSecrets(provider: 'FEISHU', secrets: Record<string, unknown>): string;
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
        oauthRedirectUri: 'https://delivery.example.com/api/v1/auth/feishu/callback',
        isEnabled: true,
      },
      'admin-1',
    );

    const persisted = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(persisted.configValue).toEqual({
      appId: 'app-1',
      oauthRedirectUri: 'https://delivery.example.com/api/v1/auth/feishu/callback',
    });
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

  it('rejects enabling Feishu without the HTTPS OAuth callback required by QR login', async () => {
    const prisma = {
      integrationConfig: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(), operationLog());

    await expect(
      service.update(
        'FEISHU',
        { appId: 'app-1', appSecret: 'real-secret-value', isEnabled: true },
        'admin-1',
      ),
    ).rejects.toThrow('HTTPS 登录回调地址');
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
      department: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      externalIdentity: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: externalIdentityCreate,
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        count: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          status: 'Active',
          departmentId: null,
          userRoles: [],
          departmentMemberships: [],
        }),
        create: userCreate,
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      userDepartmentMembership: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        updateMany: jest.fn(),
      },
      refreshSession: { updateMany: jest.fn() },
    };
    const transaction = jest.fn((run: (client: typeof tx) => Promise<unknown>) => run(tx));
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(), operationLog());
    const internals = service as unknown as IntegrationInternals;

    const result = await internals.persistUnifiedContacts(
      integrationRecordFixture(),
      'FEISHU',
      {
        contacts: [{
          externalUserId: 'open-id-1',
          identifierType: 'OPEN_ID',
          openId: 'open-id-1',
          realName: '同步用户',
          email: 'person@example.com',
          phone: '+8613800000000',
          departmentIds: [],
          active: true,
        }],
        departments: [],
        skipped: 0,
      },
      { owner: 'lease-1', revision: 1 },
    );

    expect(result).toEqual({
      total: 1,
      added: 1,
      updated: 0,
      disabled: 0,
      skipped: 0,
      failed: 0,
      departments: 0,
    });
    expect(transaction).toHaveBeenCalledTimes(4);
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
      select: { id: true },
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

  it('replays the same directory snapshot without duplicating users or identities', async () => {
    let identity: { id: string; userId: string; userProvisioned: boolean } | null = null;
    const integrationUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const userCreate = jest.fn().mockImplementation(async () => ({ id: 'user-1' }));
    const identityCreate = jest.fn().mockImplementation(async () => {
      identity = { id: 'identity-1', userId: 'user-1', userProvisioned: true };
      return { id: 'identity-1' };
    });
    const identityFindMany = jest.fn().mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) => {
        if ('integrationConfigId' in where) return [];
        return identity ? [identity] : [];
      },
    );
    const tx = {
      integrationConfig: { updateMany: integrationUpdateMany },
      department: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      externalIdentity: {
        create: identityCreate,
        findMany: identityFindMany,
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          status: 'Active',
          departmentId: null,
          userRoles: [],
          departmentMemberships: [],
        }),
        create: userCreate,
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn(),
      },
      userDepartmentMembership: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      refreshSession: { updateMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) => run(tx)),
    } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(), operationLog());
    const internals = service as unknown as IntegrationInternals;
    const directory: DirectoryFixture = {
      contacts: [{
        externalUserId: 'open-id-idempotent',
        identifierType: 'OPEN_ID',
        openId: 'open-id-idempotent',
        realName: '幂等用户',
        email: 'idempotent@example.com',
        departmentIds: [],
        active: true,
      }],
      departments: [],
      skipped: 0,
    };

    const first = await internals.persistUnifiedContacts(
      integrationRecordFixture(),
      'FEISHU',
      directory,
      { owner: 'lease-first', revision: 1 },
    );
    const second = await internals.persistUnifiedContacts(
      integrationRecordFixture(),
      'FEISHU',
      directory,
      { owner: 'lease-second', revision: 2 },
    );

    expect(first).toEqual(expect.objectContaining({ added: 1, updated: 0, failed: 0 }));
    expect(second).toEqual(expect.objectContaining({ added: 0, updated: 1, failed: 0 }));
    expect(userCreate).toHaveBeenCalledTimes(1);
    expect(identityCreate).toHaveBeenCalledTimes(1);
  });

  it('continues the batch and reports a failed contact when one user transaction fails', async () => {
    let transactionCall = 0;
    const userCreate = jest.fn().mockResolvedValue({ id: 'user-success' });
    const identityCreate = jest.fn().mockResolvedValue({ id: 'identity-success' });
    const tx = {
      integrationConfig: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      department: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      externalIdentity: {
        create: identityCreate,
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          status: 'Active',
          departmentId: null,
          userRoles: [],
          departmentMemberships: [],
        }),
        create: userCreate,
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn(),
      },
      userDepartmentMembership: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      refreshSession: { updateMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) => {
        transactionCall += 1;
        if (transactionCall === 2) return Promise.reject(new Error('single contact failed'));
        return run(tx);
      }),
      externalIdentity: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(), operationLog());

    const result = await (service as unknown as IntegrationInternals).persistUnifiedContacts(
      integrationRecordFixture(),
      'FEISHU',
      {
        contacts: [
          {
            externalUserId: 'open-id-failed',
            identifierType: 'OPEN_ID',
            openId: 'open-id-failed',
            realName: '失败用户',
            departmentIds: [],
            active: true,
          },
          {
            externalUserId: 'open-id-success',
            identifierType: 'OPEN_ID',
            openId: 'open-id-success',
            realName: '成功用户',
            departmentIds: [],
            active: true,
          },
        ],
        departments: [],
        skipped: 0,
      },
      { owner: 'lease-1', revision: 1 },
    );

    expect(result).toEqual(expect.objectContaining({
      total: 2,
      added: 1,
      failed: 1,
      disabled: 0,
    }));
    expect(userCreate).toHaveBeenCalledTimes(1);
    expect(userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ realName: '成功用户' }),
      select: { id: true },
    });
    expect(identityCreate).toHaveBeenCalledTimes(1);
  });

  it('counts ambiguous exact email or phone matches as conflicts', async () => {
    const tx = {
      integrationConfig: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      department: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
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
      userDepartmentMembership: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        updateMany: jest.fn(),
      },
      refreshSession: { updateMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) => run(tx)),
    } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(), operationLog());

    const result = await (service as unknown as IntegrationInternals).persistUnifiedContacts(
      integrationRecordFixture(),
      'FEISHU',
      {
        contacts: [{
          externalUserId: 'open-id-1',
          identifierType: 'OPEN_ID',
          openId: 'open-id-1',
          realName: '冲突用户',
          email: 'person@example.com',
          phone: '+8613800000000',
          departmentIds: [],
          active: true,
        }],
        departments: [],
        skipped: 0,
      },
      { owner: 'lease-1', revision: 1 },
    );

    expect(result.skipped).toBe(1);
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.externalIdentity.create).not.toHaveBeenCalled();
  });

  it('deactivates only auto-provisioned users with no other active identity', async () => {
    const userUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      integrationConfig: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      department: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      externalIdentity: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ id: 'identity-1', userId: 'user-1' }]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1),
      },
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ userRoles: [] }),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: userUpdateMany,
      },
      userDepartmentMembership: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        updateMany: jest.fn(),
      },
      refreshSession: { updateMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) => run(tx)),
    } as unknown as PrismaService;
    const service = new IntegrationService(prisma, configService(), operationLog());

    const result = await (service as unknown as IntegrationInternals).persistUnifiedContacts(
      integrationRecordFixture(),
      'FEISHU',
      { contacts: [], departments: [], skipped: 0 },
      { owner: 'lease-1', revision: 1 },
    );

    expect(result.disabled).toBe(1);
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        deletedAt: null,
        status: { not: 'Locked' },
      },
      data: { status: 'Inactive', permissionVersion: { increment: 1 } },
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
      configValue: {
        appId: 'app-id',
        oauthRedirectUri: 'https://delivery.example.com/api/v1/auth/feishu/callback',
      },
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

  it('reads the configured root, all children and direct users into one directory snapshot', async () => {
    const service = new IntegrationService(
      {} as PrismaService,
      configService(),
      operationLog(),
    );
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: { department: { open_department_id: '0', name: '根部门' } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            items: [
              {
                open_department_id: 'od-child',
                parent_department_id: '0',
                name: '研发部',
                order: 10,
              },
            ],
            has_more: false,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            items: [{ open_id: 'ou-root', name: '根用户', department_ids: ['0'] }],
            has_more: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            items: [
              {
                open_id: 'ou-child',
                union_id: 'on-child',
                user_id: 'tenant-child',
                name: '研发用户',
                department_ids: ['od-child'],
                status: { is_activated: true },
              },
            ],
            has_more: false,
          },
        }),
      );
    try {
      const snapshot = await (
        service as unknown as IntegrationInternals
      ).fetchFeishuDirectory('tenant-token', { contactDepartmentId: '0' });

      expect(snapshot.departments.map(({ externalDepartmentId }) => externalDepartmentId)).toEqual([
        '0',
        'od-child',
      ]);
      expect(snapshot.contacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ externalUserId: 'ou-root', departmentIds: ['0'] }),
          expect.objectContaining({
            externalUserId: 'ou-child',
            openId: 'ou-child',
            unionId: 'on-child',
            tenantUserId: 'tenant-child',
            departmentIds: ['od-child'],
          }),
        ]),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it.each([41050, 99991672])(
    'maps Feishu contact scope rejection %s to an actionable stable error code',
    async (providerCode) => {
      const service = new IntegrationService(
        {} as PrismaService,
        configService(),
        operationLog(),
      );
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ code: providerCode, msg: 'access denied' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      );
      try {
        await expect(
          (service as unknown as IntegrationInternals).fetchFeishuDirectory(
            'tenant-token',
            { contactDepartmentId: '0' },
          ),
        ).rejects.toMatchObject({ code: 'FEISHU_CONTACT_SCOPE_REQUIRED', retryable: false });
      } finally {
        fetchMock.mockRestore();
      }
    },
  );
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
