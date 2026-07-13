import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Prisma, PrismaClient } from '@prisma/client';

import {
  INTEGRATION_SECRET_MIGRATION_HELP,
  parseIntegrationSecretMigrationOptions,
} from './integration-secret-migration-options';

type Provider = 'FEISHU' | 'WECOM';

const prisma = new PrismaClient();
const args = process.argv.slice(2);
let apply = false;
let verify = false;
let actorUserId: string | undefined;
let actorUsername: string | undefined;

const aliases: Record<Provider, readonly string[]> = {
  FEISHU: ['FEISHU', 'feishu'],
  WECOM: ['WECOM', 'wecom', 'WECHAT_WORK', 'wechat_work', 'enterprise_wechat'],
};
const publicFields: Record<Provider, readonly string[]> = {
  FEISHU: ['appId', 'contactDepartmentId', 'testRecipient'],
  WECOM: ['corpId', 'agentId', 'contactDepartmentId', 'testRecipient'],
};
const secretFields: Record<Provider, readonly string[]> = {
  FEISHU: ['appSecret'],
  WECOM: ['secret'],
};

interface MigrationReport {
  mode: 'DRY_RUN' | 'APPLY' | 'VERIFY';
  scanned: number;
  planned: number;
  updated: number;
  alreadyTarget: number;
  plaintextSecretRows: number;
  preservedHistoricalPayloadRows: number;
  duplicateProviderRows: number;
}

const report: MigrationReport = {
  mode: apply ? 'APPLY' : 'DRY_RUN',
  scanned: 0,
  planned: 0,
  updated: 0,
  alreadyTarget: 0,
  plaintextSecretRows: 0,
  preservedHistoricalPayloadRows: 0,
  duplicateProviderRows: 0,
};

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pick(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(
    keys.flatMap((key) =>
      source[key] !== undefined && source[key] !== '' ? [[key, source[key]]] : [],
    ),
  );
}

function omit(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const excluded = new Set(keys);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !excluded.has(key)));
}

function hasAnyOwnField(source: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(source, key));
}

function normalizeProvider(value: string): Provider | null {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'FEISHU') return 'FEISHU';
  if (['WECOM', 'WECHAT_WORK', 'ENTERPRISE_WECHAT'].includes(normalized)) return 'WECOM';
  return null;
}

function encryptionKey(): Buffer {
  const configured = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;
  if (!configured) {
    throw new Error('INTEGRATION_SECRET_ENCRYPTION_KEY is required with --apply or --verify');
  }
  const key = Buffer.from(configured, 'base64');
  if (key.length !== 32 || key.toString('base64') !== configured) {
    throw new Error('INTEGRATION_SECRET_ENCRYPTION_KEY must be a canonical 32-byte Base64 value');
  }
  return key;
}

function encrypt(provider: Provider, payload: Record<string, unknown>, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(provider, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
}

function decrypt(provider: Provider, value: string, key: Buffer): Record<string, unknown> {
  try {
    const [version, ivValue, tagValue, encryptedValue] = value.split(':');
    if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64'));
    decipher.setAAD(Buffer.from(provider, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    const parsed: unknown = JSON.parse(plain);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`Existing ${provider} integration ciphertext validation failed`);
  }
}

async function assertActor(): Promise<string> {
  const actor = await prisma.user.findFirst({
    where: {
      ...(actorUserId ? { id: actorUserId } : { username: actorUsername }),
      status: 'Active',
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!actor) throw new Error('Migration actor does not exist or is not active');
  return actor.id;
}

async function main(): Promise<void> {
  const options = parseIntegrationSecretMigrationOptions(args);
  if (options.help) {
    process.stdout.write(INTEGRATION_SECRET_MIGRATION_HELP);
    return;
  }
  apply = options.apply;
  verify = options.verify;
  actorUserId = options.actorUserId;
  actorUsername = options.actorUsername;
  report.mode = apply ? 'APPLY' : verify ? 'VERIFY' : 'DRY_RUN';
  const actor = apply ? await assertActor() : null;
  const key = apply || verify ? encryptionKey() : null;
  const records = await prisma.integrationConfig.findMany({
    where: { provider: { in: [...aliases.FEISHU, ...aliases.WECOM] } },
    orderBy: { id: 'asc' },
  });
  report.scanned = records.length;
  const updates: Array<{
    id: string;
    provider: Provider;
    configValue: Prisma.InputJsonValue;
    encryptedConfig: string | null;
  }> = [];
  const normalizedProviderCounts = new Map<Provider, number>();

  for (const record of records) {
    const provider = normalizeProvider(record.provider);
    if (!provider) continue;
    normalizedProviderCounts.set(provider, (normalizedProviderCounts.get(provider) ?? 0) + 1);
    const raw = asRecord(record.configValue);
    const publicConfig = pick(raw, publicFields[provider]);
    const plaintextSecrets = pick(raw, secretFields[provider]);
    const hasPlaintextSecretField = hasAnyOwnField(raw, secretFields[provider]);
    const historical = omit(raw, [...publicFields[provider], ...secretFields[provider]]);
    if (hasPlaintextSecretField) report.plaintextSecretRows += 1;
    if (Object.keys(historical).length > 0) report.preservedHistoricalPayloadRows += 1;
    const existingSecrets =
      record.encryptedConfig && key ? decrypt(provider, record.encryptedConfig, key) : {};

    const requiresRewrite =
      record.provider !== provider ||
      hasPlaintextSecretField ||
      Object.keys(historical).length > 0;
    if (!requiresRewrite) {
      report.alreadyTarget += 1;
      continue;
    }
    report.planned += 1;
    if (!apply || !key || !actor) continue;

    const securePayload: Record<string, unknown> = {
      ...existingSecrets,
      ...plaintextSecrets,
      ...(Object.keys(historical).length > 0 ? { _historical: historical } : {}),
    };
    const encryptedConfig =
      Object.keys(securePayload).length > 0
        ? encrypt(provider, securePayload, key)
        : record.encryptedConfig;
    updates.push({
      id: record.id,
      provider,
      configValue: publicConfig as Prisma.InputJsonValue,
      encryptedConfig,
    });
  }

  report.duplicateProviderRows = [...normalizedProviderCounts.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
  if ((apply || verify) && report.duplicateProviderRows > 0) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    throw new Error(
      `Duplicate normalized integration providers require manual resolution: rows=${report.duplicateProviderRows}`,
    );
  }

  if (
    verify &&
    (report.plaintextSecretRows > 0 ||
      report.planned > 0 ||
      report.duplicateProviderRows > 0)
  ) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    throw new Error(
      `Strict verification failed: plaintextSecretRows=${report.plaintextSecretRows}, planned=${report.planned}`,
    );
  }

  if (apply && actor) {
    report.updated = updates.length;
    await prisma.$transaction([
      ...updates.map((update) =>
        prisma.integrationConfig.update({
          where: { id: update.id },
          data: {
            provider: update.provider,
            configValue: update.configValue,
            encryptedConfig: update.encryptedConfig,
          },
        }),
      ),
      prisma.operationLog.create({
        data: {
          userId: actor,
          module: 'migration',
          action: 'integration_secret_migration',
          targetType: 'IntegrationConfig',
          targetId: actor,
          result: 'success',
          afterData: {
            scanned: report.scanned,
            planned: report.planned,
            updated: report.updated,
            plaintextSecretRows: report.plaintextSecretRows,
            preservedHistoricalPayloadRows: report.preservedHistoricalPayloadRows,
            duplicateProviderRows: report.duplicateProviderRows,
          },
          traceId: `integration-secret-migration:${Date.now()}`,
        },
      }),
    ]);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main()
  .catch((error: unknown) => {
    process.stderr.write(
      `Integration secret migration failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
