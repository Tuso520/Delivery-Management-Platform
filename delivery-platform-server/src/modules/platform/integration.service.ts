import { createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../database/prisma.service';
import { OperationLogService } from '../operation-log/operation-log.service';

import {
  QueryIntegrationRecipientDto,
  QueryIntegrationSyncLogDto,
  TARGET_INTEGRATION_PROVIDERS,
  TargetIntegrationProvider,
  UpdateTargetIntegrationDto,
} from './dto/integration.dto';

const MASK = '******';
const ACTION_CONNECTION_TEST = 'CONNECTION_TEST';
const ACTION_CONTACT_SYNC = 'CONTACT_SYNC';
const ACTION_NOTIFICATION_TEST = 'NOTIFICATION_TEST';
const CONTACT_SYNC_LEASE_MS = 5 * 60_000;
const FEISHU_ROOT_DEPARTMENT_ID = '0';
const FEISHU_ROOT_DEPARTMENT_NAME = '企业根部门';

const PUBLIC_FIELDS: Record<TargetIntegrationProvider, readonly string[]> = {
  FEISHU: [
    'appId',
    'contactDepartmentId',
    'oauthRedirectUri',
    'testRecipient',
    'testRecipientEmail',
    'testRecipientUserId',
  ],
};

const SECRET_FIELDS: Record<TargetIntegrationProvider, readonly string[]> = {
  FEISHU: ['appSecret'],
};

interface IntegrationRecord {
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
  updatedAt: Date;
}

interface NormalizedExternalContact {
  externalUserId: string;
  identifierType: 'OPEN_ID' | 'UNION_ID' | 'USER_ID';
  openId?: string;
  unionId?: string;
  tenantUserId?: string;
  tenantKey?: string;
  realName: string;
  phone?: string;
  email?: string;
  avatarUrl?: string;
  departmentIds: string[];
  active: boolean;
}

interface NormalizedExternalDepartment {
  externalDepartmentId: string;
  parentExternalDepartmentId?: string;
  name: string;
  order: number;
  active: boolean;
}

interface FeishuDirectorySnapshot {
  contacts: NormalizedExternalContact[];
  departments: NormalizedExternalDepartment[];
  skipped: number;
}

interface ContactSyncSummary {
  total: number;
  added: number;
  updated: number;
  disabled: number;
  skipped: number;
  failed: number;
  departments: number;
}

export interface FeishuOAuthSettings {
  integrationConfigId: string;
  appId: string;
  redirectUri: string;
}

export interface FeishuOAuthIdentity {
  openId?: string;
  unionId?: string;
  tenantUserId?: string;
  tenantKey?: string;
  avatarUrl?: string;
}

interface ContactSyncLease {
  owner: string;
  revision: number;
}

export interface ExternalNotificationInput {
  provider: TargetIntegrationProvider;
  recipientId: string;
  identifierType: string;
  title: string;
  content: string;
  idempotencyKey: string;
}

export interface ExternalNotificationReceipt {
  provider: TargetIntegrationProvider;
  receiptId: string | null;
}

export class IntegrationDeliveryError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'IntegrationDeliveryError';
  }
}

@Injectable()
export class IntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly operationLog: OperationLogService,
  ) {}

  async findAll() {
    const records = await this.prisma.integrationConfig.findMany({
      where: {
        provider: { in: [...TARGET_INTEGRATION_PROVIDERS] },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const selected = new Map<TargetIntegrationProvider, IntegrationRecord>();
    for (const record of records) {
      const provider = this.normalizeProvider(record.provider);
      if (!selected.has(provider)) selected.set(provider, record);
    }
    return Array.from(selected.entries()).map(([provider, record]) =>
      this.toResponse(provider, record),
    );
  }

  async findByProvider(providerValue: string) {
    const provider = this.normalizeProvider(providerValue);
    const record = await this.findRecordByProvider(provider);
    if (!record) throw new NotFoundException('接口集成配置不存在');
    return this.toResponse(provider, record);
  }

  async findNotificationRecipients(
    providerValue: string,
    query: QueryIntegrationRecipientDto,
  ) {
    const provider = this.normalizeProvider(providerValue);
    const record = await this.findRecordByProvider(provider);
    if (!record) throw new NotFoundException('接口集成配置不存在');

    const { page = 1, keyword } = query;
    const pageSize = Math.min(query.pageSize ?? 20, 500);
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      status: 'Active',
      externalIdentities: {
        some: {
          integrationConfigId: record.id,
          provider,
          isActive: true,
          deactivatedAt: null,
          openId: { not: null },
        },
      },
      ...(keyword && {
        OR: [
          { username: { contains: keyword } },
          { realName: { contains: keyword } },
          { email: { contains: keyword } },
        ],
      }),
    };
    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          realName: true,
          email: true,
          department: { select: { id: true, departmentName: true } },
        },
        orderBy: [{ realName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, page, pageSize, total };
  }

  async getFeishuOAuthSettings(): Promise<FeishuOAuthSettings> {
    const record = await this.findRecordByProvider('FEISHU');
    if (!record || !record.isEnabled) {
      throw new ServiceUnavailableException('飞书登录尚未启用');
    }
    const configuration = await this.loadSecureConfiguration('FEISHU', record);
    const redirectUri = this.requiredString(configuration, 'oauthRedirectUri');
    let parsed: URL;
    try {
      parsed = new URL(redirectUri);
    } catch {
      throw new ServiceUnavailableException('飞书登录回调地址无效');
    }
    if (parsed.protocol !== 'https:') {
      throw new ServiceUnavailableException('飞书登录回调地址必须使用 HTTPS');
    }
    return {
      integrationConfigId: record.id,
      appId: this.requiredString(configuration, 'appId'),
      redirectUri: parsed.toString(),
    };
  }

  async exchangeFeishuOAuthCode(
    integrationConfigId: string,
    code: string,
  ): Promise<FeishuOAuthIdentity> {
    const record = await this.findRecordByProvider('FEISHU');
    if (!record || record.id !== integrationConfigId || !record.isEnabled) {
      throw new IntegrationDeliveryError('FEISHU_LOGIN_CONFIGURATION_CHANGED', false);
    }
    const configuration = await this.loadSecureConfiguration('FEISHU', record);
    const tokenPayload = await this.fetchJson(
      'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: this.requiredString(configuration, 'appId'),
          client_secret: this.requiredString(configuration, 'appSecret'),
          code,
          redirect_uri: this.requiredString(configuration, 'oauthRedirectUri'),
        }),
      },
    );
    if (this.numberFrom(tokenPayload.code, -1) !== 0) {
      throw new IntegrationDeliveryError('FEISHU_LOGIN_CODE_REJECTED', false);
    }
    const accessToken = this.stringFrom(tokenPayload.access_token);
    if (!accessToken) {
      throw new IntegrationDeliveryError('FEISHU_LOGIN_TOKEN_INVALID', false);
    }

    const userPayload = await this.fetchJson(
      'https://open.feishu.cn/open-apis/authen/v1/user_info',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (this.numberFrom(userPayload.code, -1) !== 0) {
      throw new IntegrationDeliveryError('FEISHU_LOGIN_USER_INFO_REJECTED', false);
    }
    const data = this.asRecord(userPayload.data);
    const identity: FeishuOAuthIdentity = {
      openId: this.optionalString(data.open_id),
      unionId: this.optionalString(data.union_id),
      tenantUserId: this.optionalString(data.user_id),
      tenantKey: this.optionalString(data.tenant_key),
      avatarUrl: this.optionalString(
        data.avatar_url ?? data.avatar_big ?? data.avatar_middle ?? data.avatar_thumb,
      ),
    };
    if (!identity.openId && !identity.unionId && !identity.tenantUserId) {
      throw new IntegrationDeliveryError('FEISHU_LOGIN_IDENTITY_INVALID', false);
    }
    return identity;
  }

  async update(providerValue: string, dto: UpdateTargetIntegrationDto, userId: string) {
    const provider = this.normalizeProvider(providerValue);
    this.assertProviderFields(provider, dto);
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('至少需要提供一个集成配置字段');
    }
    const existing = await this.findRecordByProvider(provider);
    const existingRaw = existing ? this.asRecord(existing.configValue) : {};
    const currentPublic = existing ? this.pickFields(existingRaw, PUBLIC_FIELDS[provider]) : {};
    const incoming = dto as Record<string, unknown>;
    const publicPatch = this.pickDefinedFields(incoming, PUBLIC_FIELDS[provider]);
    const secretPatch = this.pickDefinedFields(incoming, SECRET_FIELDS[provider]);
    this.assertSecretsArePlaintext(secretPatch);

    const nextPublic = { ...currentPublic, ...publicPatch };
    const selectedRecipientField = [
      'testRecipientUserId',
      'testRecipient',
      'testRecipientEmail',
    ].find((field) => this.optionalString(publicPatch[field]));
    if (selectedRecipientField) {
      for (const field of ['testRecipientUserId', 'testRecipient', 'testRecipientEmail']) {
        if (field !== selectedRecipientField) delete nextPublic[field];
      }
    }
    let encryptedConfig = existing?.encryptedConfig ?? null;
    const enabled = dto.isEnabled ?? existing?.isEnabled ?? false;
    const shouldReencrypt = Object.keys(secretPatch).length > 0;
    const mustReadEncryptedSecrets = Boolean(encryptedConfig) && (enabled || shouldReencrypt);
    const currentSecrets =
      mustReadEncryptedSecrets && encryptedConfig
        ? this.decryptSecrets(provider, encryptedConfig)
        : {};
    const nextSecrets = { ...currentSecrets, ...secretPatch };
    if (shouldReencrypt) {
      encryptedConfig = this.encryptSecrets(provider, nextSecrets);
    }

    if (enabled) {
      this.assertRequiredConfiguration(provider, nextPublic, nextSecrets);
    }

    const record = existing
      ? await this.prisma.integrationConfig.update({
          where: { id: existing.id },
          data: {
            provider,
            configName: dto.configName ?? existing.configName,
            configValue: nextPublic as Prisma.InputJsonValue,
            encryptedConfig,
            isEnabled: enabled,
            ...(dto.description !== undefined && {
              description: dto.description || null,
            }),
          },
        })
      : await this.prisma.integrationConfig.create({
          data: {
            provider,
            configName: dto.configName ?? this.defaultConfigName(provider),
            configValue: nextPublic as Prisma.InputJsonValue,
            encryptedConfig,
            isEnabled: enabled,
            description: dto.description ?? null,
          },
        });

    await this.operationLog.log({
      userId,
      module: 'integration',
      action: existing ? 'update' : 'create',
      targetType: 'integration',
      targetId: record.id,
      afterData: {
        provider,
        isEnabled: record.isEnabled,
        updatedFields: Object.keys(dto),
      },
    });
    return this.toResponse(provider, record);
  }

  async testConnection(providerValue: string, userId: string) {
    const provider = this.normalizeProvider(providerValue);
    return this.runLoggedAction(
      provider,
      ACTION_CONNECTION_TEST,
      userId,
      async (record, configuration) => {
        await this.acquireAccessToken(provider, configuration);
        return { connected: true, provider, integrationId: record.id };
      },
    );
  }

  async syncContacts(providerValue: string, userId: string) {
    const provider = this.normalizeProvider(providerValue);
    return this.runLoggedAction(
      provider,
      ACTION_CONTACT_SYNC,
      userId,
      async (record, configuration) => {
        const lease = await this.acquireContactSyncLease(record);
        try {
          const directory = await this.fetchContacts(provider, configuration);
          return await this.persistUnifiedContacts(record, provider, directory, lease);
        } finally {
          await this.releaseContactSyncLease(record.id, lease);
        }
      },
    );
  }

  async testNotification(providerValue: string, userId: string) {
    const provider = this.normalizeProvider(providerValue);
    return this.runLoggedAction(
      provider,
      ACTION_NOTIFICATION_TEST,
      userId,
      async (record, configuration) => {
        const recipientId = await this.resolveFeishuNotificationRecipient(configuration);
        await this.sendNotificationWithConfiguration(configuration, {
          provider,
          recipientId,
          identifierType: 'OPEN_ID',
          title: '交付管理平台',
          content: '接口集成测试成功。',
          idempotencyKey: `test:${record.id}:${Date.now()}`,
        });
        return { sent: true, provider, integrationId: record.id };
      },
    );
  }

  async sendNotification(input: ExternalNotificationInput): Promise<ExternalNotificationReceipt> {
    const provider = this.normalizeProvider(input.provider);
    if (input.identifierType !== 'OPEN_ID') {
      throw new IntegrationDeliveryError('EXTERNAL_IDENTITY_TYPE_UNSUPPORTED', false);
    }
    const record = await this.findRecordByProvider(provider);
    if (!record || !record.isEnabled) {
      throw new IntegrationDeliveryError('INTEGRATION_CONFIG_UNAVAILABLE', false);
    }
    let configuration: Record<string, unknown>;
    try {
      configuration = await this.loadSecureConfiguration(provider, record);
    } catch {
      throw new IntegrationDeliveryError('INTEGRATION_CONFIG_INVALID', false);
    }
    return this.sendNotificationWithConfiguration(configuration, {
      ...input,
      provider,
    });
  }

  async findSyncLogs(providerValue: string, query: QueryIntegrationSyncLogDto) {
    const provider = this.normalizeProvider(providerValue);
    const { page = 1, pageSize = 20, action, status } = query;
    const where: Prisma.IntegrationSyncLogWhereInput = {
      provider,
      ...(action && { action }),
      ...(status && { status }),
    };
    const [total, list] = await Promise.all([
      this.prisma.integrationSyncLog.count({ where }),
      this.prisma.integrationSyncLog.findMany({
        where,
        select: {
          id: true,
          provider: true,
          action: true,
          status: true,
          summary: true,
          errorReason: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          requester: {
            select: { id: true, username: true, realName: true },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      items: list,
      page,
      pageSize,
      total,
    };
  }

  private async runLoggedAction(
    provider: TargetIntegrationProvider,
    action: string,
    userId: string,
    run: (
      record: IntegrationRecord,
      configuration: Record<string, unknown>,
    ) => Promise<Record<string, unknown> | ContactSyncSummary>,
  ) {
    const startedAt = new Date();
    let record: IntegrationRecord | null = null;
    try {
      record = await this.findRecordByProvider(provider);
      if (!record) throw new NotFoundException('接口集成配置不存在');
      if (!record.isEnabled) throw new BadRequestException('请先启用该集成配置');
      const configuration = await this.loadSecureConfiguration(provider, record);
      const summary = await run(record, configuration);
      const completedAt = new Date();
      await this.prisma.integrationSyncLog.create({
        data: {
          integrationConfigId: record.id,
          provider,
          action,
          status: 'SUCCESS',
          summary: summary as unknown as Prisma.InputJsonValue,
          requestedBy: userId,
          startedAt,
          completedAt,
        },
      });
      await this.operationLog.log({
        userId,
        module: 'integration',
        action: action.toLowerCase(),
        targetType: 'integration',
        targetId: record.id,
        result: 'success',
        afterData: { provider, ...summary },
      });
      return { success: true, provider, ...summary, completedAt };
    } catch (error) {
      const completedAt = new Date();
      const errorReason = this.safeErrorReason(error);
      await this.prisma.integrationSyncLog
        .create({
          data: {
            integrationConfigId: record?.id ?? null,
            provider,
            action,
            status: 'FAILED',
            errorReason,
            requestedBy: userId,
            startedAt,
            completedAt,
          },
        })
        .catch(() => undefined);
      await this.operationLog
        .log({
          userId,
          module: 'integration',
          action: action.toLowerCase(),
          targetType: 'integration',
          targetId: record?.id ?? provider,
          result: 'failure',
          errorReason,
          afterData: { provider },
        })
        .catch(() => undefined);
      throw this.toHttpException(error);
    }
  }

  private async loadSecureConfiguration(
    provider: TargetIntegrationProvider,
    record: IntegrationRecord,
  ): Promise<Record<string, unknown>> {
    const raw = this.asRecord(record.configValue);
    const publicConfig = this.pickFields(raw, PUBLIC_FIELDS[provider]);
    const secrets = record.encryptedConfig
      ? this.decryptSecrets(provider, record.encryptedConfig)
      : {};
    const configuration = { ...publicConfig, ...secrets };
    this.assertRequiredConfiguration(provider, publicConfig, secrets);
    return configuration;
  }

  private async acquireAccessToken(
    _provider: TargetIntegrationProvider,
    configuration: Record<string, unknown>,
  ): Promise<string> {
    const payload = await this.fetchJson(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          app_id: this.requiredString(configuration, 'appId'),
          app_secret: this.requiredString(configuration, 'appSecret'),
        }),
      },
    );
    const code = this.numberFrom(payload.code, -1);
    const token = this.stringFrom(payload.tenant_access_token);
    if (code !== 0 || !token) {
      throw new IntegrationDeliveryError('INTEGRATION_AUTH_REJECTED', false);
    }
    return token;
  }

  private async fetchContacts(
    provider: TargetIntegrationProvider,
    configuration: Record<string, unknown>,
  ): Promise<FeishuDirectorySnapshot> {
    const token = await this.acquireAccessToken(provider, configuration);
    return this.fetchFeishuDirectory(token, configuration);
  }

  private async fetchFeishuDirectory(
    token: string,
    configuration: Record<string, unknown>,
  ): Promise<FeishuDirectorySnapshot> {
    const rootDepartmentId = this.optionalString(configuration.contactDepartmentId) ?? '0';
    const departments = await this.fetchFeishuDepartments(token, rootDepartmentId);
    const contactDepartments = [
      rootDepartmentId,
      ...departments.map(({ externalDepartmentId }) => externalDepartmentId),
    ];
    const contacts = new Map<string, NormalizedExternalContact>();
    let skipped = 0;
    for (const departmentId of new Set(contactDepartments)) {
      const result = await this.fetchFeishuDepartmentContacts(token, departmentId);
      skipped += result.skipped;
      for (const contact of result.contacts) {
        const existing = contacts.get(contact.externalUserId);
        if (!existing) {
          contacts.set(contact.externalUserId, contact);
          continue;
        }
        existing.departmentIds = [
          ...new Set([...existing.departmentIds, ...contact.departmentIds]),
        ];
        existing.active = existing.active || contact.active;
      }
    }
    return { contacts: [...contacts.values()], departments, skipped };
  }

  private async fetchFeishuDepartments(
    token: string,
    rootDepartmentId: string,
  ): Promise<NormalizedExternalDepartment[]> {
    const departments = new Map<string, NormalizedExternalDepartment>();
    const rootDepartment = await this.fetchFeishuDepartment(token, rootDepartmentId);
    departments.set(rootDepartment.externalDepartmentId, rootDepartment);
    const queue = [rootDepartmentId];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      if (visited.has(parentId)) continue;
      visited.add(parentId);
      if (visited.size > 10_000) {
        throw new IntegrationDeliveryError('INTEGRATION_DEPARTMENT_LIMIT_EXCEEDED', false);
      }
      let pageToken = '';
      for (let page = 0; page < 100; page += 1) {
        const url = new URL(
          `https://open.feishu.cn/open-apis/contact/v3/departments/${encodeURIComponent(parentId)}/children`,
        );
        url.searchParams.set('department_id_type', 'open_department_id');
        url.searchParams.set('user_id_type', 'user_id');
        url.searchParams.set('page_size', '50');
        if (pageToken) url.searchParams.set('page_token', pageToken);
        const payload = await this.fetchJson(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (this.numberFrom(payload.code, -1) !== 0) {
          throw new IntegrationDeliveryError('INTEGRATION_DEPARTMENT_SYNC_REJECTED', false);
        }
        const data = this.asRecord(payload.data);
        const items = Array.isArray(data.items) ? data.items : [];
        for (const item of items) {
          const department = this.normalizeFeishuDepartment(item, parentId);
          if (!department) continue;
          departments.set(department.externalDepartmentId, department);
          queue.push(department.externalDepartmentId);
        }
        if (data.has_more !== true) break;
        pageToken = this.stringFrom(data.page_token);
        if (!pageToken || page === 99) {
          throw new IntegrationDeliveryError('INTEGRATION_DEPARTMENT_RESPONSE_INVALID', true);
        }
      }
    }
    return [...departments.values()];
  }

  private async fetchFeishuDepartment(
    token: string,
    departmentId: string,
  ): Promise<NormalizedExternalDepartment> {
    const url = new URL(
      `https://open.feishu.cn/open-apis/contact/v3/departments/${encodeURIComponent(departmentId)}`,
    );
    url.searchParams.set('department_id_type', 'open_department_id');
    url.searchParams.set('user_id_type', 'user_id');
    const payload = await this.fetchJson(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (this.numberFrom(payload.code, -1) !== 0) {
      throw new IntegrationDeliveryError('INTEGRATION_ROOT_DEPARTMENT_REJECTED', false);
    }
    const data = this.asRecord(payload.data);
    const department = this.normalizeFeishuDepartment(data.department ?? data, '0');
    if (department) return department;
    if (departmentId === FEISHU_ROOT_DEPARTMENT_ID) {
      return {
        externalDepartmentId: FEISHU_ROOT_DEPARTMENT_ID,
        name: FEISHU_ROOT_DEPARTMENT_NAME,
        order: 0,
        active: true,
      };
    }
    throw new IntegrationDeliveryError('INTEGRATION_ROOT_DEPARTMENT_INVALID', false);
  }

  private async fetchFeishuDepartmentContacts(
    token: string,
    departmentId: string,
  ): Promise<{ contacts: NormalizedExternalContact[]; skipped: number }> {
    const contacts: NormalizedExternalContact[] = [];
    let skipped = 0;
    let pageToken = '';
    for (let page = 0; page < 100; page += 1) {
      const url = new URL('https://open.feishu.cn/open-apis/contact/v3/users/find_by_department');
      url.searchParams.set('department_id', departmentId);
      url.searchParams.set('department_id_type', 'open_department_id');
      url.searchParams.set('user_id_type', 'user_id');
      url.searchParams.set('page_size', '50');
      if (pageToken) url.searchParams.set('page_token', pageToken);
      const payload = await this.fetchJson(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const code = this.numberFrom(payload.code, -1);
      if (code !== 0) {
        throw new IntegrationDeliveryError('INTEGRATION_CONTACT_SYNC_REJECTED', false);
      }
      const data = this.asRecord(payload.data);
      const items = Array.isArray(data.items) ? data.items : [];
      for (const item of items) {
        const contact = this.normalizeFeishuContact(item, departmentId);
        if (contact) contacts.push(contact);
        else skipped += 1;
      }
      if (data.has_more !== true) break;
      pageToken = this.stringFrom(data.page_token);
      if (!pageToken) {
        throw new IntegrationDeliveryError('INTEGRATION_CONTACT_SYNC_RESPONSE_INVALID', true);
      }
      if (page === 99) {
        throw new IntegrationDeliveryError('INTEGRATION_CONTACT_SYNC_PAGE_LIMIT_EXCEEDED', false);
      }
    }
    return { contacts, skipped };
  }

  private async sendNotificationWithConfiguration(
    configuration: Record<string, unknown>,
    input: ExternalNotificationInput,
  ): Promise<ExternalNotificationReceipt> {
    const message = this.truncateExternalMessage(`${input.title}\n${input.content}`);
    const provider = input.provider;
    const token = await this.acquireAccessToken(provider, configuration);
    const url = new URL('https://open.feishu.cn/open-apis/im/v1/messages');
    url.searchParams.set('receive_id_type', 'open_id');
    const payload = await this.fetchJson(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        receive_id: input.recipientId,
        msg_type: 'text',
        content: JSON.stringify({ text: message }),
        uuid: this.feishuDeliveryUuid(input.idempotencyKey),
      }),
    });
    const code = this.numberFrom(payload.code, -1);
    if (code !== 0) {
      throw new IntegrationDeliveryError('INTEGRATION_DELIVERY_REJECTED', false);
    }
    const data = this.asRecord(payload.data);
    return {
      provider,
      receiptId: this.optionalString(data.message_id) ?? null,
    };
  }

  private async resolveFeishuNotificationRecipient(
    configuration: Record<string, unknown>,
  ): Promise<string> {
    const configuredUserId = this.optionalString(configuration.testRecipientUserId);
    if (configuredUserId) {
      const identities = await this.prisma.externalIdentity.findMany({
        where: {
          provider: 'FEISHU',
          userId: configuredUserId,
          isActive: true,
          deactivatedAt: null,
          openId: { not: null },
          user: { is: { deletedAt: null, status: 'Active' } },
        },
        select: { openId: true },
        take: 2,
      });
      const openIds = [
        ...new Set(
          identities
            .map((identity) => this.optionalString(identity.openId))
            .filter((value): value is string => Boolean(value)),
        ),
      ];
      if (openIds.length !== 1 || !openIds[0].startsWith('ou_')) {
        throw new IntegrationDeliveryError('INTEGRATION_TEST_RECIPIENT_NOT_FOUND', false);
      }
      return openIds[0];
    }

    const configuredOpenId = this.optionalString(configuration.testRecipient);
    if (configuredOpenId) return configuredOpenId;

    const email = this.optionalString(configuration.testRecipientEmail);
    if (!email) {
      throw new IntegrationDeliveryError('INTEGRATION_TEST_RECIPIENT_REQUIRED', false);
    }

    const token = await this.acquireAccessToken('FEISHU', configuration);
    const url = new URL('https://open.feishu.cn/open-apis/contact/v3/users/batch_get_id');
    url.searchParams.set('user_id_type', 'open_id');
    const payload = await this.fetchJson(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ emails: [email], include_resigned: false }),
    });
    if (this.numberFrom(payload.code, -1) !== 0) {
      throw new IntegrationDeliveryError('INTEGRATION_RECIPIENT_LOOKUP_REJECTED', false);
    }

    const data = this.asRecord(payload.data);
    const users = Array.isArray(data.user_list) ? data.user_list : [];
    const matches = users
      .map((item) => this.asRecord(item))
      .filter((item) => {
        const status = this.asRecord(item.status);
        return (
          status.is_resigned !== true &&
          status.is_exited !== true &&
          status.is_unjoin !== true &&
          status.is_activated !== false
        );
      })
      .map((item) => this.optionalString(item.user_id))
      .filter((value): value is string => Boolean(value));
    const uniqueOpenIds = [...new Set(matches)];
    if (uniqueOpenIds.length !== 1 || !uniqueOpenIds[0].startsWith('ou_')) {
      throw new IntegrationDeliveryError('INTEGRATION_TEST_RECIPIENT_NOT_FOUND', false);
    }
    return uniqueOpenIds[0];
  }

  private async acquireContactSyncLease(record: IntegrationRecord): Promise<ContactSyncLease> {
    const now = new Date();
    const owner = randomUUID();
    const acquired = await this.prisma.integrationConfig.updateMany({
      where: {
        id: record.id,
        contactSyncRevision: record.contactSyncRevision,
        OR: [
          { contactSyncLeaseOwner: null },
          { contactSyncLeaseExpiresAt: null },
          { contactSyncLeaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        contactSyncLeaseOwner: owner,
        contactSyncLeaseExpiresAt: new Date(now.getTime() + CONTACT_SYNC_LEASE_MS),
        contactSyncRevision: { increment: 1 },
      },
    });
    if (acquired.count !== 1) {
      throw new ConflictException('该集成的通讯录同步正在执行，请稍后重试');
    }
    return { owner, revision: record.contactSyncRevision + 1 };
  }

  private async releaseContactSyncLease(
    integrationConfigId: string,
    lease: ContactSyncLease,
  ): Promise<void> {
    await this.prisma.integrationConfig.updateMany({
      where: {
        id: integrationConfigId,
        contactSyncLeaseOwner: lease.owner,
        contactSyncRevision: lease.revision,
      },
      data: {
        contactSyncLeaseOwner: null,
        contactSyncLeaseExpiresAt: null,
        contactSyncRevision: { increment: 1 },
      },
    });
  }

  private async persistUnifiedContacts(
    record: IntegrationRecord,
    provider: TargetIntegrationProvider,
    directory: FeishuDirectorySnapshot,
    lease: ContactSyncLease,
  ): Promise<ContactSyncSummary> {
    const uniqueContacts = new Map<string, NormalizedExternalContact>();
    let skipped = directory.skipped;
    for (const contact of directory.contacts) {
      const existing = uniqueContacts.get(contact.externalUserId);
      if (existing) {
        existing.departmentIds = [
          ...new Set([...existing.departmentIds, ...contact.departmentIds]),
        ];
        skipped += 1;
      } else {
        uniqueContacts.set(contact.externalUserId, contact);
      }
    }
    const provisionedPasswordHash =
      uniqueContacts.size > 0 ? await bcrypt.hash(randomBytes(32).toString('base64url'), 10) : null;
    const syncTime = new Date();
    const departmentMap = await this.persistExternalDepartments(
      record,
      provider,
      directory.departments,
      lease,
      syncTime,
    );
    const touchedIdentityIds = new Set<string>();
    const protectedIdentityIds = new Set<string>();
    let added = 0;
    let updated = 0;
    let failed = 0;

    for (const contact of uniqueContacts.values()) {
      try {
        const result = await this.prisma.$transaction((tx) =>
          this.persistOneContact(
            tx,
            record,
            provider,
            contact,
            lease,
            syncTime,
            departmentMap,
            provisionedPasswordHash,
          ),
        );
        result.identityIds.forEach((id) => touchedIdentityIds.add(id));
        if (result.action === 'added') added += 1;
        else if (result.action === 'updated') updated += 1;
        else skipped += 1;
      } catch {
        failed += 1;
        const identities = await this.findExistingIdentities(this.prisma, provider, contact);
        identities.forEach(({ id }) => protectedIdentityIds.add(id));
      }
    }

    const disabled = await this.disableMissingIdentities(
      record,
      provider,
      lease,
      syncTime,
      [...touchedIdentityIds, ...protectedIdentityIds],
    );

    await this.prisma.$transaction(async (tx) => {
      const released = await tx.integrationConfig.updateMany({
        where: {
          id: record.id,
          contactSyncLeaseOwner: lease.owner,
          contactSyncRevision: lease.revision,
        },
        data: {
          contactSyncLeaseOwner: null,
          contactSyncLeaseExpiresAt: null,
          contactSyncRevision: { increment: 1 },
          lastContactSyncAt: syncTime,
        },
      });
      if (released.count !== 1) {
        throw new ConflictException('通讯录同步租约已被其他任务接管');
      }
    });

    return {
      total: uniqueContacts.size,
      added,
      updated,
      disabled,
      skipped,
      failed,
      departments: departmentMap.size,
    };
  }

  private async persistExternalDepartments(
    record: IntegrationRecord,
    provider: TargetIntegrationProvider,
    departments: NormalizedExternalDepartment[],
    lease: ContactSyncLease,
    syncTime: Date,
  ): Promise<Map<string, string>> {
    return this.prisma.$transaction(async (tx) => {
      await this.guardContactSyncLease(tx, record.id, lease, syncTime);
      const existing = await tx.department.findMany({
        where: { externalProvider: provider },
        select: { id: true, externalDepartmentId: true },
      });
      const mapped = new Map(
        existing
          .filter(({ externalDepartmentId }) => Boolean(externalDepartmentId))
          .map(({ id, externalDepartmentId }) => [externalDepartmentId!, id]),
      );
      const pending = new Map(
        departments.map((department) => [department.externalDepartmentId, department]),
      );
      for (let depth = 0; pending.size > 0 && depth < 100; depth += 1) {
        let progressed = false;
        for (const [externalId, department] of [...pending]) {
          const parentExternalId = department.parentExternalDepartmentId;
          if (parentExternalId && pending.has(parentExternalId)) continue;
          const saved = await tx.department.upsert({
            where: {
              externalProvider_externalDepartmentId: {
                externalProvider: provider,
                externalDepartmentId: externalId,
              },
            },
            create: {
              departmentCode: this.externalDepartmentCode(provider, externalId),
              departmentName: department.name,
              parentId: parentExternalId ? mapped.get(parentExternalId) ?? null : null,
              status: department.active ? 'Active' : 'Inactive',
              sortOrder: department.order,
              externalProvider: provider,
              externalDepartmentId: externalId,
              externalManaged: true,
              lastSyncedAt: syncTime,
            },
            update: {
              departmentName: department.name,
              parentId: parentExternalId ? mapped.get(parentExternalId) ?? null : null,
              status: department.active ? 'Active' : 'Inactive',
              sortOrder: department.order,
              externalManaged: true,
              lastSyncedAt: syncTime,
            },
            select: { id: true },
          });
          mapped.set(externalId, saved.id);
          pending.delete(externalId);
          progressed = true;
        }
        if (!progressed) throw new ConflictException('飞书部门层级存在环或缺失父部门');
      }
      if (pending.size > 0) throw new ConflictException('飞书部门层级超过安全上限');
      const returnedIds = departments.map(({ externalDepartmentId }) => externalDepartmentId);
      await tx.department.updateMany({
        where: {
          externalProvider: provider,
          externalManaged: true,
          ...(returnedIds.length > 0 && { externalDepartmentId: { notIn: returnedIds } }),
        },
        data: { status: 'Inactive', lastSyncedAt: syncTime },
      });
      return mapped;
    });
  }

  private async persistOneContact(
    tx: Prisma.TransactionClient,
    record: IntegrationRecord,
    provider: TargetIntegrationProvider,
    contact: NormalizedExternalContact,
    lease: ContactSyncLease,
    syncTime: Date,
    departmentMap: Map<string, string>,
    provisionedPasswordHash: string | null,
  ): Promise<{ action: 'added' | 'updated' | 'skipped'; identityIds: string[] }> {
    await this.guardContactSyncLease(tx, record.id, lease, syncTime);
    const identities = await this.findExistingIdentities(tx, provider, contact);
    const identityUserIds = [...new Set(identities.map(({ userId }) => userId))];
    if (identityUserIds.length > 1 || identities.length > 1) {
      return { action: 'skipped', identityIds: identities.map(({ id }) => id) };
    }

    let userId: string;
    let userProvisioned = false;
    let action: 'added' | 'updated' = 'updated';
    if (identities.length === 1) {
      userId = identities[0].userId;
      userProvisioned = identities[0].userProvisioned;
      const conflicts = await this.findExactUserMatches(tx, contact, userId);
      if (conflicts.length > 0) {
        return { action: 'skipped', identityIds: [identities[0].id] };
      }
    } else {
      const matches = await this.findExactUserMatches(tx, contact);
      if (matches.length > 1 || !contact.active) {
        return { action: 'skipped', identityIds: [] };
      }
      if (matches.length === 1) {
        userId = matches[0].id;
      } else {
        if (!provisionedPasswordHash) {
          throw new ServiceUnavailableException('自动创建用户凭据初始化失败');
        }
        const created = await tx.user.create({
          data: {
            username: this.provisionedUsername(provider, contact.externalUserId),
            password: provisionedPasswordHash,
            realName: contact.realName,
            email: contact.email ?? null,
            phone: contact.phone ?? null,
            avatarUrl: contact.avatarUrl ?? null,
            status: 'Active',
          },
          select: { id: true },
        });
        userId = created.id;
        userProvisioned = true;
        action = 'added';
      }
    }

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        departmentId: true,
        userRoles: { select: { role: { select: { roleCode: true } } } },
        departmentMemberships: {
          where: { source: 'FEISHU' },
          select: { departmentId: true },
        },
      },
    });
    if (!user) throw new NotFoundException('同步目标用户不存在');
    const isSuperAdmin = user.userRoles.some(({ role }) => role.roleCode === 'SUPER_ADMIN');
    const mappedDepartments = [
      ...new Set(
        contact.departmentIds
          .map((externalId) => departmentMap.get(externalId))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const currentMemberships = new Set(
      user.departmentMemberships.map(({ departmentId }) => departmentId),
    );
    const membershipChanged =
      mappedDepartments.length !== currentMemberships.size ||
      mappedDepartments.some((id) => !currentMemberships.has(id));
    const nextStatus =
      !contact.active && userProvisioned && !isSuperAdmin
        ? 'Inactive'
        : contact.active && userProvisioned && user.status === 'Inactive'
          ? 'Active'
          : user.status;
    const primaryDepartmentId = mappedDepartments[0] ?? null;
    const securityChanged =
      membershipChanged || user.departmentId !== primaryDepartmentId || user.status !== nextStatus;

    await tx.user.update({
      where: { id: userId },
      data: {
        realName: contact.realName,
        ...(contact.email !== undefined && { email: contact.email }),
        ...(contact.phone !== undefined && { phone: contact.phone }),
        ...(contact.avatarUrl !== undefined && { avatarUrl: contact.avatarUrl }),
        ...(mappedDepartments.length > 0 || userProvisioned
          ? { departmentId: primaryDepartmentId }
          : {}),
        status: nextStatus,
        ...(securityChanged && { permissionVersion: { increment: 1 } }),
      },
    });
    await tx.userDepartmentMembership.deleteMany({
      where: {
        userId,
        source: 'FEISHU',
        ...(mappedDepartments.length > 0 && { departmentId: { notIn: mappedDepartments } }),
      },
    });
    if (mappedDepartments.length > 0) {
      await tx.userDepartmentMembership.createMany({
        data: mappedDepartments.map((departmentId, index) => ({
          userId,
          departmentId,
          source: 'FEISHU',
          isPrimary: index === 0,
        })),
        skipDuplicates: true,
      });
      await tx.userDepartmentMembership.updateMany({
        where: { userId, source: 'FEISHU' },
        data: { isPrimary: false },
      });
      await tx.userDepartmentMembership.updateMany({
        where: { userId, source: 'FEISHU', departmentId: primaryDepartmentId! },
        data: { isPrimary: true },
      });
    }

    let identityId: string;
    if (identities.length === 1) {
      identityId = identities[0].id;
      await tx.externalIdentity.update({
        where: { id: identityId },
        data: this.externalIdentityUpdate(record.id, contact, syncTime),
      });
    } else {
      const identity = await tx.externalIdentity.create({
        data: {
          integrationConfigId: record.id,
          userId,
          provider,
          externalUserId: contact.externalUserId,
          identifierType: contact.identifierType,
          openId: contact.openId,
          unionId: contact.unionId,
          tenantUserId: contact.tenantUserId,
          tenantKey: contact.tenantKey,
          isActive: contact.active,
          userProvisioned,
          lastSeenAt: syncTime,
          deactivatedAt: contact.active ? null : syncTime,
        },
        select: { id: true },
      });
      identityId = identity.id;
    }
    if (!contact.active && userProvisioned && !isSuperAdmin) {
      await tx.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: syncTime, revokeReason: 'FEISHU_USER_INACTIVE' },
      });
    }
    return { action, identityIds: [identityId] };
  }

  private async disableMissingIdentities(
    record: IntegrationRecord,
    provider: TargetIntegrationProvider,
    lease: ContactSyncLease,
    syncTime: Date,
    protectedIds: string[],
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await this.guardContactSyncLease(tx, record.id, lease, syncTime);
      const missing = await tx.externalIdentity.findMany({
        where: {
          integrationConfigId: record.id,
          provider,
          isActive: true,
          ...(protectedIds.length > 0 && { id: { notIn: protectedIds } }),
        },
        select: { id: true, userId: true, userProvisioned: true },
      });
      if (missing.length > 0) {
        await tx.externalIdentity.updateMany({
          where: { id: { in: missing.map(({ id }) => id) } },
          data: { isActive: false, deactivatedAt: syncTime },
        });
      }
      for (const userId of new Set(missing.map(({ userId }) => userId))) {
        const [activeIdentities, provisionedIdentities, user] = await Promise.all([
          tx.externalIdentity.count({ where: { userId, isActive: true } }),
          tx.externalIdentity.count({ where: { userId, userProvisioned: true } }),
          tx.user.findUnique({
            where: { id: userId },
            select: { userRoles: { select: { role: { select: { roleCode: true } } } } },
          }),
        ]);
        const isSuperAdmin = user?.userRoles.some(({ role }) => role.roleCode === 'SUPER_ADMIN');
        if (activeIdentities === 0 && provisionedIdentities > 0 && !isSuperAdmin) {
          await tx.user.updateMany({
            where: { id: userId, deletedAt: null, status: { not: 'Locked' } },
            data: { status: 'Inactive', permissionVersion: { increment: 1 } },
          });
          await tx.refreshSession.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: syncTime, revokeReason: 'FEISHU_USER_MISSING' },
          });
        }
      }
      return missing.length;
    });
  }

  private async guardContactSyncLease(
    tx: Prisma.TransactionClient,
    integrationConfigId: string,
    lease: ContactSyncLease,
    _syncTime: Date,
  ): Promise<void> {
    const now = new Date();
    const guarded = await tx.integrationConfig.updateMany({
      where: {
        id: integrationConfigId,
        contactSyncLeaseOwner: lease.owner,
        contactSyncRevision: lease.revision,
        contactSyncLeaseExpiresAt: { gt: now },
      },
      data: { contactSyncLeaseExpiresAt: new Date(now.getTime() + CONTACT_SYNC_LEASE_MS) },
    });
    if (guarded.count !== 1) {
      throw new ConflictException('通讯录同步租约已失效，请重新执行');
    }
  }

  private findExistingIdentities(
    tx: Prisma.TransactionClient | PrismaService,
    provider: TargetIntegrationProvider,
    contact: NormalizedExternalContact,
  ) {
    const filters: Prisma.ExternalIdentityWhereInput[] = [
      { externalUserId: contact.externalUserId },
      ...(contact.openId ? [{ openId: contact.openId }] : []),
      ...(contact.unionId ? [{ unionId: contact.unionId }] : []),
      ...(contact.tenantUserId ? [{ tenantUserId: contact.tenantUserId }] : []),
    ];
    return tx.externalIdentity.findMany({
      where: { provider, OR: filters },
      select: { id: true, userId: true, userProvisioned: true },
    });
  }

  private externalIdentityUpdate(
    integrationConfigId: string,
    contact: NormalizedExternalContact,
    syncTime: Date,
  ): Prisma.ExternalIdentityUpdateInput {
    return {
      integrationConfig: { connect: { id: integrationConfigId } },
      externalUserId: contact.externalUserId,
      identifierType: contact.identifierType,
      openId: contact.openId,
      unionId: contact.unionId,
      tenantUserId: contact.tenantUserId,
      tenantKey: contact.tenantKey,
      isActive: contact.active,
      lastSeenAt: syncTime,
      deactivatedAt: contact.active ? null : syncTime,
    };
  }

  private async findExactUserMatches(
    tx: Prisma.TransactionClient,
    contact: NormalizedExternalContact,
    excludeUserId?: string,
  ) {
    const filters: Prisma.UserWhereInput[] = [
      ...(contact.email ? [{ email: contact.email }] : []),
      ...(contact.phone ? [{ phone: contact.phone }] : []),
    ];
    if (filters.length === 0) return [];
    const users = await tx.user.findMany({
      where: {
        deletedAt: null,
        OR: filters,
        ...(excludeUserId && { id: { not: excludeUserId } }),
      },
      select: { id: true, email: true, phone: true },
    });
    return users.filter(
      (user) =>
        (contact.email !== undefined && this.normalizeEmail(user.email) === contact.email) ||
        (contact.phone !== undefined && this.normalizePhone(user.phone) === contact.phone),
    );
  }

  private normalizeFeishuDepartment(
    value: unknown,
    fallbackParentId: string,
  ): NormalizedExternalDepartment | null {
    const item = this.asRecord(value);
    const externalDepartmentId = this.stringFrom(
      item.open_department_id ?? item.department_id,
    );
    const name = this.stringFrom(item.name);
    if (!externalDepartmentId || !name) return null;
    const status = this.asRecord(item.status);
    return {
      externalDepartmentId,
      parentExternalDepartmentId:
        this.optionalString(item.parent_department_id) ??
        (fallbackParentId === '0' ? undefined : fallbackParentId),
      name,
      order: this.numberFrom(item.order, 0),
      active: status.is_deleted !== true,
    };
  }

  private normalizeFeishuContact(
    value: unknown,
    fallbackDepartmentId: string,
  ): NormalizedExternalContact | null {
    const item = this.asRecord(value);
    const openId = this.optionalString(item.open_id);
    const unionId = this.optionalString(item.union_id);
    const tenantUserId = this.optionalString(item.user_id);
    const externalUserId = openId ?? unionId ?? tenantUserId ?? '';
    const realName = this.stringFrom(item.name);
    if (!externalUserId || !realName) return null;
    const status = this.asRecord(item.status);
    const avatar = this.asRecord(item.avatar);
    const suppliedDepartmentIds = Array.isArray(item.department_ids)
      ? item.department_ids.filter((id): id is string => typeof id === 'string' && Boolean(id))
      : [];
    return {
      externalUserId,
      identifierType: openId ? 'OPEN_ID' : unionId ? 'UNION_ID' : 'USER_ID',
      openId,
      unionId,
      tenantUserId,
      tenantKey: this.optionalString(item.tenant_key),
      realName,
      phone: this.normalizePhone(item.mobile),
      email: this.normalizeEmail(item.email),
      avatarUrl: this.optionalString(
        avatar.avatar_origin ?? avatar.avatar_640 ?? item.avatar_url,
      ),
      departmentIds: [...new Set([...suppliedDepartmentIds, fallbackDepartmentId])],
      active:
        status.is_activated !== false &&
        status.is_exited !== true &&
        status.is_resigned !== true &&
        status.is_frozen !== true,
    };
  }

  private async fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const body = await response.text();
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new IntegrationDeliveryError(
          this.upstreamHttpErrorCode(url, response.status, body, retryable),
          retryable,
        );
      }
      const parsed: unknown = body ? JSON.parse(body) : {};
      return this.asRecord(parsed);
    } catch (error) {
      if (error instanceof IntegrationDeliveryError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new IntegrationDeliveryError('INTEGRATION_REQUEST_TIMEOUT', true);
      }
      if (error instanceof SyntaxError) {
        throw new IntegrationDeliveryError('INTEGRATION_RESPONSE_INVALID', true);
      }
      throw new IntegrationDeliveryError('INTEGRATION_NETWORK_FAILURE', true);
    } finally {
      clearTimeout(timer);
    }
  }

  private upstreamHttpErrorCode(
    url: string,
    status: number,
    body: string,
    retryable: boolean,
  ): string {
    if (retryable) return 'INTEGRATION_UPSTREAM_TEMPORARY';

    let providerCode: number | undefined;
    try {
      const parsed = this.asRecord(body ? JSON.parse(body) : {});
      const candidate = parsed.code;
      if (typeof candidate === 'number' && Number.isInteger(candidate)) {
        providerCode = candidate;
      }
    } catch {
      // The stable diagnostic below intentionally excludes the upstream body.
    }

    if (url.includes('/contact/')) {
      if (providerCode === 99991672) {
        return 'FEISHU_CONTACT_API_SCOPE_REQUIRED';
      }
      if (providerCode === 41050 || providerCode === 40004 || status === 403) {
        return 'FEISHU_CONTACT_DATA_SCOPE_REQUIRED';
      }
      return providerCode === undefined
        ? `FEISHU_CONTACT_HTTP_${status}`
        : `FEISHU_CONTACT_HTTP_${status}_CODE_${providerCode}`;
    }
    if (url.includes('/im/v1/messages')) {
      if (providerCode === 99991672 || status === 403) {
        return 'FEISHU_MESSAGE_SCOPE_REQUIRED';
      }
      return providerCode === undefined
        ? `FEISHU_MESSAGE_HTTP_${status}`
        : `FEISHU_MESSAGE_HTTP_${status}_CODE_${providerCode}`;
    }
    if (url.includes('/authen/')) {
      return providerCode === undefined
        ? `FEISHU_OAUTH_HTTP_${status}`
        : `FEISHU_OAUTH_HTTP_${status}_CODE_${providerCode}`;
    }
    return providerCode === undefined
      ? `INTEGRATION_UPSTREAM_HTTP_${status}`
      : `INTEGRATION_UPSTREAM_HTTP_${status}_CODE_${providerCode}`;
  }

  private encryptSecrets(
    provider: TargetIntegrationProvider,
    secrets: Record<string, unknown>,
  ): string {
    const key = this.encryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(provider, 'utf8'));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(secrets), 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decryptSecrets(
    provider: TargetIntegrationProvider,
    value: string,
  ): Record<string, unknown> {
    const [version, ivValue, tagValue, encryptedValue] = value.split(':');
    if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
      throw new ServiceUnavailableException('集成密钥密文格式无效，敏感能力已关闭');
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey(),
        Buffer.from(ivValue, 'base64'),
      );
      decipher.setAAD(Buffer.from(provider, 'utf8'));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      return this.asRecord(JSON.parse(plain));
    } catch {
      throw new ServiceUnavailableException('集成密钥无法解密，敏感能力已关闭');
    }
  }

  private encryptionKey(): Buffer {
    const configured = this.config.get<string>('INTEGRATION_SECRET_ENCRYPTION_KEY');
    if (!configured) {
      throw new ServiceUnavailableException('未配置集成密钥加密变量，敏感能力已关闭');
    }
    const key = Buffer.from(configured, 'base64');
    if (key.length !== 32) {
      throw new ServiceUnavailableException(
        '集成密钥加密变量必须是 32 字节 Base64，敏感能力已关闭',
      );
    }
    return key;
  }

  private async findRecordByProvider(
    provider: TargetIntegrationProvider,
  ): Promise<IntegrationRecord | null> {
    return this.prisma.integrationConfig.findFirst({
      where: { provider },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private normalizeProvider(value: string): TargetIntegrationProvider {
    if (value === 'FEISHU') return 'FEISHU';
    throw new BadRequestException('接口集成仅支持 FEISHU');
  }

  private assertProviderFields(
    provider: TargetIntegrationProvider,
    dto: UpdateTargetIntegrationDto,
  ): void {
    const providerFields = new Set([
      ...PUBLIC_FIELDS[provider],
      ...SECRET_FIELDS[provider],
      'configName',
      'description',
      'isEnabled',
    ]);
    const invalid = Object.keys(dto).filter((key) => !providerFields.has(key));
    if (invalid.length) {
      throw new BadRequestException(`${provider} 不支持配置字段：${invalid.join(', ')}`);
    }
  }

  private assertSecretsArePlaintext(secrets: Record<string, unknown>): void {
    for (const value of Object.values(secrets)) {
      if (typeof value !== 'string' || !value.trim() || value.includes('*')) {
        throw new BadRequestException('修改集成 Secret 时必须重新输入完整明文');
      }
    }
  }

  private assertRequiredConfiguration(
    _provider: TargetIntegrationProvider,
    publicConfig: Record<string, unknown>,
    secrets: Record<string, unknown>,
  ): void {
    const appId = this.optionalString(publicConfig.appId);
    const oauthRedirectUri = this.optionalString(publicConfig.oauthRedirectUri);
    const hasRequiredSecret = Boolean(this.optionalString(secrets.appSecret));
    if (!appId || !oauthRedirectUri || !hasRequiredSecret) {
      throw new BadRequestException(
        '启用或调用飞书集成前必须完整配置 App ID、App Secret 和 HTTPS 登录回调地址',
      );
    }
    let redirectUri: URL;
    try {
      redirectUri = new URL(oauthRedirectUri);
    } catch {
      throw new BadRequestException('飞书登录回调地址无效');
    }
    if (redirectUri.protocol !== 'https:') {
      throw new BadRequestException('飞书登录回调地址必须使用 HTTPS');
    }
  }

  private toResponse(provider: TargetIntegrationProvider, record: IntegrationRecord) {
    const publicConfig = this.pickFields(
      this.asRecord(record.configValue),
      PUBLIC_FIELDS[provider],
    );
    const hasEncrypted = Boolean(record.encryptedConfig);
    const configuration: Record<string, unknown> = { ...publicConfig };
    for (const secretField of SECRET_FIELDS[provider]) {
      configuration[secretField] = hasEncrypted ? MASK : null;
    }
    return {
      id: record.id,
      provider,
      configName: record.configName,
      isEnabled: record.isEnabled,
      description: record.description,
      configuration,
      capabilities: ['CONTACT_SYNC', 'NOTIFICATION', 'OAUTH_LOGIN'],
      updatedAt: record.updatedAt,
    };
  }

  private pickFields(
    source: Record<string, unknown>,
    keys: readonly string[],
  ): Record<string, unknown> {
    return Object.fromEntries(
      keys.flatMap((key) =>
        source[key] !== undefined && source[key] !== '' ? [[key, source[key]]] : [],
      ),
    );
  }

  private pickDefinedFields(
    source: Record<string, unknown>,
    keys: readonly string[],
  ): Record<string, unknown> {
    return Object.fromEntries(
      keys.flatMap((key) => (source[key] !== undefined ? [[key, source[key]]] : [])),
    );
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringFrom(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private optionalString(value: unknown): string | undefined {
    const parsed = this.stringFrom(value);
    return parsed || undefined;
  }

  private requiredString(configuration: Record<string, unknown>, key: string): string {
    const value = this.optionalString(configuration[key]);
    if (!value) throw new BadRequestException(`集成配置缺少 ${key}`);
    return value;
  }

  private numberFrom(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private normalizeEmail(value: unknown): string | undefined {
    const normalized = this.stringFrom(value).toLowerCase();
    return normalized || undefined;
  }

  private normalizePhone(value: unknown): string | undefined {
    const normalized = this.stringFrom(value);
    return normalized || undefined;
  }

  private provisionedUsername(provider: TargetIntegrationProvider, externalUserId: string): string {
    const digest = createHash('sha256')
      .update(`${provider}:${externalUserId}`, 'utf8')
      .digest('hex')
      .slice(0, 40);
    return `fs_${digest}`;
  }

  private externalDepartmentCode(
    provider: TargetIntegrationProvider,
    externalDepartmentId: string,
  ): string {
    return `${provider}_${createHash('sha256')
      .update(externalDepartmentId)
      .digest('hex')
      .slice(0, 24)}`;
  }

  private feishuDeliveryUuid(idempotencyKey: string): string {
    return createHash('sha256').update(idempotencyKey, 'utf8').digest('hex').slice(0, 50);
  }

  private truncateExternalMessage(value: string): string {
    return Array.from(value).slice(0, 1900).join('');
  }

  private toHttpException(error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    if (error instanceof IntegrationDeliveryError) {
      return new ServiceUnavailableException(
        error.retryable
          ? '外部集成服务暂时不可用，请稍后重试'
          : '外部集成拒绝了本次操作，请检查集成配置',
      );
    }
    return new ServiceUnavailableException('集成操作暂时不可用，请稍后重试');
  }

  private safeErrorReason(error: unknown): string {
    const message =
      error instanceof IntegrationDeliveryError
        ? error.code
        : error instanceof Error
          ? error.message
          : '集成操作失败';
    return message
      .replace(/(password|secret|token|api.?key|access.?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
      .slice(0, 1000);
  }

  private defaultConfigName(_provider: TargetIntegrationProvider): string {
    return '飞书集成';
  }
}
