import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

export interface SystemConfigItem {
  id: string;
  configKey: string;
  configValue: string;
  description: string | null;
  configType: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SystemConfigService {
  private readonly publicKeys = [
    'platform.name',
    'platform.short_name',
    'platform.login_slogan',
    'platform.default_language',
  ];

  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<SystemConfigItem[]> {
    return this.prisma.systemConfig.findMany({
      orderBy: { configKey: 'asc' },
    }) as unknown as SystemConfigItem[];
  }

  async findByKey(key: string): Promise<SystemConfigItem | null> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { configKey: key },
    });

    if (!config) {
      throw new NotFoundException(`配置项 '${key}' 不存在`);
    }

    return config as unknown as SystemConfigItem;
  }

  async upsert(
    key: string,
    value: string,
    description?: string,
    configType?: string,
    updatedBy?: string,
  ): Promise<SystemConfigItem> {
    const config = await this.prisma.systemConfig.upsert({
      where: { configKey: key },
      update: {
        configValue: value,
        ...(description !== undefined && { description }),
        ...(configType !== undefined && { configType }),
        ...(updatedBy !== undefined && { updatedBy }),
      },
      create: {
        configKey: key,
        configValue: value,
        description: description ?? null,
        configType: configType ?? 'string',
        updatedBy: updatedBy ?? null,
      },
    });

    return config as unknown as SystemConfigItem;
  }

  async delete(key: string): Promise<void> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { configKey: key },
    });

    if (!config) {
      throw new NotFoundException(`配置项 '${key}' 不存在`);
    }

    await this.prisma.systemConfig.delete({
      where: { configKey: key },
    });
  }

  async getMany(keys: string[]): Promise<Record<string, string | null>> {
    const configs = await this.prisma.systemConfig.findMany({
      where: { configKey: { in: keys } },
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
}
