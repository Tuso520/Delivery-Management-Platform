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

const PUBLIC_FIELDS: Record<TargetIntegrationProvider, readonly string[]> = {
  FEISHU: ['appId', 'contactDepartmentId', 'testRecipient'],
  WECOM: ['corpId', 'agentId', 'contactDepartmentId', 'testRecipient'],
};

const SECRET_FIELDS: Record<TargetIntegrationProvider, readonly string[]> = {
  FEISHU: ['appSecret'],
  WECOM: ['secret'],
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
  identifierType: 'OPEN_ID' | 'USER_ID';
  realName: string;
  phone?: string;
  email?: string;
}

interface ContactSyncSummary {
  total: number;
  added: number;
  updated: number;
  disabled: number;
  conflicts: number;
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
          const contacts = await this.fetchContacts(provider, configuration);
          return await this.persistUnifiedContacts(record, provider, contacts, lease);
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
        await this.sendNotificationWithConfiguration(configuration, {
          provider,
          recipientId: this.requiredString(configuration, 'testRecipient'),
          identifierType: provider === 'FEISHU' ? 'OPEN_ID' : 'USER_ID',
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
    const expectedIdentifierType = provider === 'FEISHU' ? 'OPEN_ID' : 'USER_ID';
    if (input.identifierType !== expectedIdentifierType) {
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
    provider: TargetIntegrationProvider,
    configuration: Record<string, unknown>,
  ): Promise<string> {
    if (provider === 'FEISHU') {
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

    const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/gettoken');
    url.searchParams.set('corpid', this.requiredString(configuration, 'corpId'));
    url.searchParams.set('corpsecret', this.requiredString(configuration, 'secret'));
    const payload = await this.fetchJson(url.toString());
    const code = this.numberFrom(payload.errcode, -1);
    const token = this.stringFrom(payload.access_token);
    if (code !== 0 || !token) {
      throw new IntegrationDeliveryError('INTEGRATION_AUTH_REJECTED', false);
    }
    return token;
  }

  private async fetchContacts(
    provider: TargetIntegrationProvider,
    configuration: Record<string, unknown>,
  ): Promise<NormalizedExternalContact[]> {
    const token = await this.acquireAccessToken(provider, configuration);
    return provider === 'FEISHU'
      ? this.fetchFeishuContacts(token, configuration)
      : this.fetchWecomContacts(token, configuration);
  }

  private async fetchFeishuContacts(
    token: string,
    configuration: Record<string, unknown>,
  ): Promise<NormalizedExternalContact[]> {
    const contacts: NormalizedExternalContact[] = [];
    let pageToken = '';
    for (let page = 0; page < 100; page += 1) {
      const url = new URL('https://open.feishu.cn/open-apis/contact/v3/users/find_by_department');
      url.searchParams.set(
        'department_id',
        this.optionalString(configuration.contactDepartmentId) ?? '0',
      );
      url.searchParams.set('user_id_type', 'open_id');
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
        const contact = this.normalizeFeishuContact(item);
        if (contact) contacts.push(contact);
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
    return contacts;
  }

  private async fetchWecomContacts(
    token: string,
    configuration: Record<string, unknown>,
  ): Promise<NormalizedExternalContact[]> {
    const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/user/list');
    url.searchParams.set('access_token', token);
    url.searchParams.set(
      'department_id',
      this.optionalString(configuration.contactDepartmentId) ?? '1',
    );
    url.searchParams.set('fetch_child', '1');
    const payload = await this.fetchJson(url.toString());
    const code = this.numberFrom(payload.errcode, -1);
    if (code !== 0) {
      throw new IntegrationDeliveryError('INTEGRATION_CONTACT_SYNC_REJECTED', false);
    }
    const userlist = Array.isArray(payload.userlist) ? payload.userlist : [];
    return userlist.flatMap((item) => {
      const contact = this.normalizeWecomContact(item);
      return contact ? [contact] : [];
    });
  }

  private async sendNotificationWithConfiguration(
    configuration: Record<string, unknown>,
    input: ExternalNotificationInput,
  ): Promise<ExternalNotificationReceipt> {
    const message = this.truncateExternalMessage(`${input.title}\n${input.content}`);
    const provider = input.provider;
    if (provider === 'FEISHU') {
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

    const token = await this.acquireAccessToken(provider, configuration);
    const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/message/send');
    url.searchParams.set('access_token', token);
    const payload = await this.fetchJson(url.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        touser: input.recipientId,
        msgtype: 'text',
        agentid: Number(this.requiredString(configuration, 'agentId')),
        text: { content: message },
        safe: 0,
        enable_duplicate_check: 1,
        duplicate_check_interval: 1800,
      }),
    });
    const code = this.numberFrom(payload.errcode, -1);
    if (code !== 0) {
      throw new IntegrationDeliveryError('INTEGRATION_DELIVERY_REJECTED', false);
    }
    return { provider, receiptId: this.optionalString(payload.msgid) ?? null };
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
    contacts: NormalizedExternalContact[],
    lease: ContactSyncLease,
  ): Promise<ContactSyncSummary> {
    const uniqueContacts = new Map<string, NormalizedExternalContact>();
    let conflicts = 0;
    for (const contact of contacts) {
      if (uniqueContacts.has(contact.externalUserId)) conflicts += 1;
      uniqueContacts.set(contact.externalUserId, contact);
    }
    const provisionedPasswordHash =
      uniqueContacts.size > 0 ? await bcrypt.hash(randomBytes(32).toString('base64url'), 10) : null;
    const syncTime = new Date();
    return this.prisma.$transaction(async (tx) => {
      const guarded = await tx.integrationConfig.updateMany({
        where: {
          id: record.id,
          contactSyncLeaseOwner: lease.owner,
          contactSyncRevision: lease.revision,
          contactSyncLeaseExpiresAt: { gt: syncTime },
        },
        data: {
          contactSyncLeaseExpiresAt: new Date(syncTime.getTime() + CONTACT_SYNC_LEASE_MS),
        },
      });
      if (guarded.count !== 1) {
        throw new ConflictException('通讯录同步租约已失效，请重新执行');
      }

      let added = 0;
      let updated = 0;
      for (const contact of uniqueContacts.values()) {
        const identity = await tx.externalIdentity.findUnique({
          where: {
            provider_externalUserId: {
              provider,
              externalUserId: contact.externalUserId,
            },
          },
          include: { user: true },
        });

        if (identity) {
          const conflictingUsers = await this.findExactUserMatches(tx, contact, identity.userId);
          await tx.externalIdentity.update({
            where: { id: identity.id },
            data: {
              integrationConfigId: record.id,
              identifierType: contact.identifierType,
              isActive: true,
              lastSeenAt: syncTime,
              deactivatedAt: null,
            },
          });
          if (conflictingUsers.length > 0) {
            conflicts += 1;
            updated += 1;
            continue;
          }
          const userWasProvisioned =
            identity.userProvisioned ||
            (await tx.externalIdentity.count({
              where: { userId: identity.userId, userProvisioned: true },
            })) > 0;
          await tx.user.update({
            where: { id: identity.userId },
            data: {
              realName: contact.realName,
              ...(contact.email !== undefined && { email: contact.email }),
              ...(contact.phone !== undefined && { phone: contact.phone }),
              ...(userWasProvisioned &&
                identity.user.status === 'Inactive' && { status: 'Active' }),
            },
          });
          updated += 1;
          continue;
        }

        const matches = await this.findExactUserMatches(tx, contact);
        if (matches.length > 1) {
          conflicts += 1;
          continue;
        }

        let userId: string;
        let userProvisioned = false;
        if (matches.length === 1) {
          userId = matches[0].id;
          await tx.user.update({
            where: { id: userId },
            data: {
              realName: contact.realName,
              ...(contact.email !== undefined && { email: contact.email }),
              ...(contact.phone !== undefined && { phone: contact.phone }),
            },
          });
          updated += 1;
        } else {
          if (!provisionedPasswordHash) {
            throw new ServiceUnavailableException('自动创建用户凭据初始化失败');
          }
          const user = await tx.user.create({
            data: {
              username: this.provisionedUsername(provider, contact.externalUserId),
              password: provisionedPasswordHash,
              realName: contact.realName,
              email: contact.email ?? null,
              phone: contact.phone ?? null,
              status: 'Active',
            },
            select: { id: true },
          });
          userId = user.id;
          userProvisioned = true;
          added += 1;
        }

        await tx.externalIdentity.create({
          data: {
            integrationConfigId: record.id,
            userId,
            provider,
            externalUserId: contact.externalUserId,
            identifierType: contact.identifierType,
            isActive: true,
            userProvisioned,
            lastSeenAt: syncTime,
          },
        });
      }

      const returnedIds = Array.from(uniqueContacts.keys());
      const missingIdentities = await tx.externalIdentity.findMany({
        where: {
          integrationConfigId: record.id,
          provider,
          isActive: true,
          ...(returnedIds.length > 0 && {
            externalUserId: { notIn: returnedIds },
          }),
        },
        select: { id: true, userId: true },
      });
      const affectedUserIds = new Set<string>();
      for (const identity of missingIdentities) {
        await tx.externalIdentity.update({
          where: { id: identity.id },
          data: { isActive: false, deactivatedAt: syncTime },
        });
        affectedUserIds.add(identity.userId);
      }

      for (const userId of affectedUserIds) {
        const [activeIdentities, provisionedIdentities] = await Promise.all([
          tx.externalIdentity.count({ where: { userId, isActive: true } }),
          tx.externalIdentity.count({
            where: { userId, userProvisioned: true },
          }),
        ]);
        if (activeIdentities === 0 && provisionedIdentities > 0) {
          await tx.user.updateMany({
            where: { id: userId, deletedAt: null, status: { not: 'Locked' } },
            data: { status: 'Inactive' },
          });
        }
      }

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

      return {
        total: uniqueContacts.size,
        added,
        updated,
        disabled: missingIdentities.length,
        conflicts,
      };
    });
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

  private normalizeFeishuContact(value: unknown): NormalizedExternalContact | null {
    const item = this.asRecord(value);
    const externalUserId = this.stringFrom(item.open_id ?? item.user_id);
    const realName = this.stringFrom(item.name);
    if (!externalUserId || !realName) return null;
    return {
      externalUserId,
      identifierType: 'OPEN_ID',
      realName,
      phone: this.normalizePhone(item.mobile),
      email: this.normalizeEmail(item.email),
    };
  }

  private normalizeWecomContact(value: unknown): NormalizedExternalContact | null {
    const item = this.asRecord(value);
    const externalUserId = this.stringFrom(item.userid);
    const realName = this.stringFrom(item.name);
    if (!externalUserId || !realName) return null;
    return {
      externalUserId,
      identifierType: 'USER_ID',
      realName,
      phone: this.normalizePhone(item.mobile),
      email: this.normalizeEmail(item.email),
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
          retryable ? 'INTEGRATION_UPSTREAM_TEMPORARY' : 'INTEGRATION_UPSTREAM_REJECTED',
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
    if (value === 'WECOM') return 'WECOM';
    throw new BadRequestException('接口集成仅支持 FEISHU 和 WECOM');
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
    provider: TargetIntegrationProvider,
    publicConfig: Record<string, unknown>,
    secrets: Record<string, unknown>,
  ): void {
    const missingPublic =
      provider === 'FEISHU'
        ? !this.optionalString(publicConfig.appId)
        : !this.optionalString(publicConfig.corpId) || !this.optionalString(publicConfig.agentId);
    const hasRequiredSecret =
      provider === 'FEISHU'
        ? Boolean(this.optionalString(secrets.appSecret))
        : Boolean(this.optionalString(secrets.secret));
    if (missingPublic || !hasRequiredSecret) {
      throw new BadRequestException('启用或调用集成前必须完整配置身份凭据');
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
      capabilities: ['CONTACT_SYNC', 'NOTIFICATION'],
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
    const prefix = provider === 'FEISHU' ? 'fs' : 'wx';
    const digest = createHash('sha256')
      .update(`${provider}:${externalUserId}`, 'utf8')
      .digest('hex')
      .slice(0, 40);
    return `${prefix}_${digest}`;
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

  private defaultConfigName(provider: TargetIntegrationProvider): string {
    return provider === 'FEISHU' ? '飞书集成' : '企业微信集成';
  }
}
