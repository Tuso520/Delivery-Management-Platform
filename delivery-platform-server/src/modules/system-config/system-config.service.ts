import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

import { PatchSystemSettingsDto } from './dto/system-config.dto';

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

@Injectable()
export class SystemConfigService {
  private readonly publicKeys = [
    'platform.name',
    'platform.short_name',
    'platform.login_slogan',
    'platform.default_language',
  ];

  constructor(private readonly prisma: PrismaService) {}

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
        maxSizeMb: this.parseInteger(values['attachment.max_size_mb'], 100),
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
}
