import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { decryptConfigSecrets, encryptConfigSecrets } from '../../common/security/encrypted-config';
import { resolveDocumentConfig } from '../../config/document.config';
import { PrismaService } from '../../database/prisma.service';

import { PatchDocumentPreviewSettingsDto, PatchSystemSettingsDto } from './dto/system-config.dto';

export interface SystemSettings {
  project: {
    defaultPageSize: number;
    defaultRiskLevel: 'Low' | 'Medium' | 'High';
  };
  attachment: { maxSizeMb: number };
  file: { allowedExtensions: string[] };
  approval: { timeoutDays: number };
  knowledge: { defaultPageSize: number };
  security: { sessionHours: number; loginMaxAttempts: number };
}

const TARGET_SETTING_KEYS = [
  'project.default_page_size',
  'project.default_risk_level',
  'attachment.max_size_mb',
  'file.allowed_extensions',
  'approval.timeout_days',
  'knowledge.default_page_size',
  'security.session_hours',
  'security.login_max_attempts',
] as const;
const ONLYOFFICE_PROVIDER = 'ONLYOFFICE';

export interface DocumentPreviewSettings {
  enabled: boolean;
  docsUrl: string;
  jwtSecretConfigured: boolean;
  ready: boolean;
  source: 'DATABASE' | 'ENVIRONMENT' | 'NONE';
  updatedAt: Date | null;
}

export interface OnlyOfficeRuntimeConfig {
  docsUrl: string;
  jwtSecret: string;
}

@Injectable()
export class SystemConfigService {
  private readonly publicKeys = [
    'platform.name',
    'platform.short_name',
    'platform.login_slogan',
    'platform.default_language',
  ];

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  private async getMany(keys: readonly string[]): Promise<Record<string, string | null>> {
    const configs = await this.prisma.systemConfig.findMany({
      where: { configKey: { in: [...keys] } },
    });

    const result: Record<string, string | null> = {};
    for (const key of keys) {
      const config = configs.find((c) => c.configKey === key);
      result[key] = config?.configValue ?? null;
    }

    return result;
  }

  getPublic(): Promise<Record<string, string | null>> {
    return this.getMany(this.publicKeys);
  }

  async getSettings(): Promise<SystemSettings> {
    const values = await this.getMany([...TARGET_SETTING_KEYS]);
    return {
      project: {
        defaultPageSize: this.parseInteger(values['project.default_page_size'], 20),
        defaultRiskLevel: this.parseRiskLevel(values['project.default_risk_level']),
      },
      attachment: {
        maxSizeMb: Math.min(
          this.parseInteger(values['attachment.max_size_mb'], 500),
          500,
        ),
      },
      file: {
        allowedExtensions: this.parseExtensions(values['file.allowed_extensions']),
      },
      approval: {
        timeoutDays: this.parseInteger(values['approval.timeout_days'], 3),
      },
      knowledge: {
        defaultPageSize: this.parseInteger(values['knowledge.default_page_size'], 20),
      },
      security: {
        sessionHours: this.parseInteger(values['security.session_hours'], 12),
        loginMaxAttempts: this.parseInteger(values['security.login_max_attempts'], 5),
      },
    };
  }

  async getDocumentPreviewSettings(): Promise<DocumentPreviewSettings> {
    const record = await this.findOnlyOfficeRecord();
    if (record) {
      const values = this.asRecord(record.configValue);
      const docsUrl = this.normalizeBaseUrl(values.docsUrl);
      const jwtSecretConfigured = Boolean(record.encryptedConfig);
      return {
        enabled: record.isEnabled,
        docsUrl,
        jwtSecretConfigured,
        ready: record.isEnabled && Boolean(docsUrl) && jwtSecretConfigured,
        source: 'DATABASE',
        updatedAt: record.updatedAt,
      };
    }

    const fallback = resolveDocumentConfig();
    const docsUrl = this.normalizeBaseUrl(fallback.onlyOfficeDocsUrl);
    const jwtSecretConfigured = Boolean(fallback.onlyOfficeJwtSecret.trim());
    const ready = Boolean(docsUrl) && jwtSecretConfigured;
    return {
      enabled: ready,
      docsUrl,
      jwtSecretConfigured,
      ready,
      source: ready ? 'ENVIRONMENT' : 'NONE',
      updatedAt: null,
    };
  }

  async getOnlyOfficeRuntimeConfig(): Promise<OnlyOfficeRuntimeConfig> {
    const record = await this.findOnlyOfficeRecord();
    if (!record) {
      const fallback = resolveDocumentConfig();
      return {
        docsUrl: this.normalizeBaseUrl(fallback.onlyOfficeDocsUrl),
        jwtSecret: fallback.onlyOfficeJwtSecret.trim(),
      };
    }
    if (!record.isEnabled) return { docsUrl: '', jwtSecret: '' };
    const values = this.asRecord(record.configValue);
    const secrets = record.encryptedConfig
      ? decryptConfigSecrets(
          this.config,
          ONLYOFFICE_PROVIDER,
          record.encryptedConfig,
          '文档预览',
        )
      : {};
    return {
      docsUrl: this.normalizeBaseUrl(values.docsUrl),
      jwtSecret: this.stringValue(secrets.jwtSecret),
    };
  }

  async updateDocumentPreviewSettings(
    dto: PatchDocumentPreviewSettingsDto,
    _userId: string,
  ): Promise<DocumentPreviewSettings> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('至少需要提供一个文档预览配置项');
    }
    const existing = await this.findOnlyOfficeRecord();
    const existingValues = this.asRecord(existing?.configValue);
    const docsUrl =
      dto.docsUrl === undefined
        ? this.normalizeBaseUrl(existingValues.docsUrl)
        : this.normalizeBaseUrl(dto.docsUrl);
    const enabled = dto.enabled ?? existing?.isEnabled ?? false;
    let encryptedConfig = existing?.encryptedConfig ?? null;

    if (dto.jwtSecret !== undefined) {
      const jwtSecret = dto.jwtSecret.trim();
      if (!jwtSecret || jwtSecret.includes('*')) {
        throw new BadRequestException('修改 ONLYOFFICE JWT Secret 时必须重新输入完整明文');
      }
      encryptedConfig = encryptConfigSecrets(
        this.config,
        ONLYOFFICE_PROVIDER,
        { jwtSecret },
        '文档预览',
      );
    }
    if (enabled && (!docsUrl || !encryptedConfig)) {
      throw new BadRequestException('启用 ONLYOFFICE 前必须配置 Docs 地址和 JWT Secret');
    }

    const data = {
      provider: ONLYOFFICE_PROVIDER,
      configName: 'ONLYOFFICE Docs',
      configValue: { docsUrl } as Prisma.InputJsonValue,
      encryptedConfig,
      isEnabled: enabled,
      description: '系统设置中的 Office 文件只读预览配置',
    };
    if (existing) {
      await this.prisma.integrationConfig.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.integrationConfig.create({ data });
    }
    return this.getDocumentPreviewSettings();
  }

  async getDefaultProjectRiskLevel(): Promise<SystemSettings['project']['defaultRiskLevel']> {
    const values = await this.getMany(['project.default_risk_level']);
    return this.parseRiskLevel(values['project.default_risk_level']);
  }

  async getDefaultProjectPageSize(): Promise<number> {
    const values = await this.getMany(['project.default_page_size']);
    return this.parseInteger(values['project.default_page_size'], 20);
  }

  async getDefaultKnowledgePageSize(): Promise<number> {
    const values = await this.getMany(['knowledge.default_page_size']);
    return this.parseInteger(values['knowledge.default_page_size'], 20);
  }

  async updateSettings(dto: PatchSystemSettingsDto, userId: string): Promise<SystemSettings> {
    const updates = this.toTargetUpdates(dto);
    if (updates.length === 0) {
      throw new BadRequestException('至少需要提供一个系统配置项');
    }
    await this.prisma.$transaction(
      updates.map(({ key, value, type }) =>
        this.prisma.systemConfig.upsert({
          where: { configKey: key },
          update: { configValue: value, configType: type, updatedBy: userId },
          create: {
            configKey: key,
            configValue: value,
            configType: type,
            updatedBy: userId,
          },
        }),
      ),
    );
    return this.getSettings();
  }

  getSystemTime(): {
    serverTime: string;
    epochMilliseconds: number;
    timezone: string;
    utcOffsetMinutes: number;
  } {
    const now = new Date();
    return {
      serverTime: now.toISOString(),
      epochMilliseconds: now.getTime(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      utcOffsetMinutes: -now.getTimezoneOffset(),
    };
  }

  private toTargetUpdates(
    dto: PatchSystemSettingsDto,
  ): Array<{ key: (typeof TARGET_SETTING_KEYS)[number]; value: string; type: string }> {
    const updates: Array<{
      key: (typeof TARGET_SETTING_KEYS)[number];
      value: string;
      type: string;
    }> = [];
    const add = (
      key: (typeof TARGET_SETTING_KEYS)[number],
      value: string | number | boolean | string[] | undefined,
      type: 'string' | 'number' | 'boolean',
    ): void => {
      if (value === undefined) return;
      updates.push({
        key,
        value: Array.isArray(value) ? value.join(',') : String(value),
        type,
      });
    };

    add('project.default_page_size', dto.project?.defaultPageSize, 'number');
    add('project.default_risk_level', dto.project?.defaultRiskLevel, 'string');
    add('attachment.max_size_mb', dto.attachment?.maxSizeMb, 'number');
    add('file.allowed_extensions', dto.file?.allowedExtensions, 'string');
    add('approval.timeout_days', dto.approval?.timeoutDays, 'number');
    add('knowledge.default_page_size', dto.knowledge?.defaultPageSize, 'number');
    add('security.session_hours', dto.security?.sessionHours, 'number');
    add('security.login_max_attempts', dto.security?.loginMaxAttempts, 'number');
    return updates;
  }

  private parseInteger(value: string | null, fallback: number): number {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private parseRiskLevel(value: string | null): 'Low' | 'Medium' | 'High' {
    return value === 'Medium' || value === 'High' ? value : 'Low';
  }

  private parseExtensions(value: string | null): string[] {
    const fallback = [
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'jpg',
      'jpeg',
      'png',
      'md',
      'mp4',
    ];
    if (!value) return fallback;
    const parsed = value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => /^[a-z0-9]+$/.test(item));
    return parsed.length ? Array.from(new Set(parsed)) : fallback;
  }

  private findOnlyOfficeRecord() {
    return this.prisma.integrationConfig.findFirst({
      where: { provider: ONLYOFFICE_PROVIDER },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private normalizeBaseUrl(value: unknown): string {
    return this.stringValue(value).replace(/\/+$/u, '');
  }
}
