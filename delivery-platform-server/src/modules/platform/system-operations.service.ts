import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Readable } from 'stream';

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { FileStorageService } from '../file/file-storage.service';
import { OperationLogService } from '../operation-log/operation-log.service';

import { CreateBackupDto, QueryPlatformDto, UpsertIntegrationDto } from './dto/platform.dto';

@Injectable()
export class SystemOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly operationLog: OperationLogService,
  ) {}

  async storageStatus() {
    const [storage, attachmentCount, attachmentBytes, backupCount] = await Promise.all([
      this.storage.getStatus(),
      this.prisma.attachment.count({ where: { deletedAt: null } }),
      this.prisma.attachment.aggregate({
        where: { deletedAt: null },
        _sum: { fileSize: true },
      }),
      this.prisma.backupRecord.count(),
    ]);
    return {
      ...storage,
      provider: 'MinIO',
      attachmentCount,
      attachmentBytes: attachmentBytes._sum.fileSize ?? BigInt(0),
      backupCount,
    };
  }

  async findBackups(query: QueryPlatformDto) {
    const { page = 1, pageSize = 20, status } = query;
    const where: Prisma.BackupRecordWhereInput = status ? { status } : {};
    const [total, list] = await Promise.all([
      this.prisma.backupRecord.count({ where }),
      this.prisma.backupRecord.findMany({
        where,
        include: {
          requester: { select: { id: true, realName: true, username: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      list,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async createBackup(dto: CreateBackupDto, userId: string) {
    const record = await this.prisma.backupRecord.create({
      data: {
        backupType: dto.backupType,
        requestedBy: userId,
        status: 'Running',
        startedAt: new Date(),
      },
    });
    try {
      const result = await this.dumpDatabase(record.id);
      const completed = await this.prisma.backupRecord.update({
        where: { id: record.id },
        data: {
          status: 'Completed',
          storagePath: result.storagePath,
          fileSize: BigInt(result.fileSize),
          completedAt: new Date(),
        },
      });
      await this.operationLog.log({
        userId,
        module: 'backup',
        action: 'create',
        targetType: 'backup',
        targetId: record.id,
      });
      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : '备份失败';
      await this.prisma.backupRecord.update({
        where: { id: record.id },
        data: {
          status: 'Failed',
          errorMessage: message.slice(0, 500),
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async getBackupContent(
    id: string,
    userId: string,
  ): Promise<{ stream: Readable; fileName: string }> {
    const backup = await this.prisma.backupRecord.findUnique({ where: { id } });
    if (!backup?.storagePath || backup.status !== 'Completed') {
      throw new NotFoundException('备份文件不存在或尚未完成');
    }
    const stream = await this.storage.getObject(backup.storagePath);
    await this.operationLog.log({
      userId,
      module: 'backup',
      action: 'download',
      targetType: 'backup',
      targetId: id,
    });
    return {
      stream,
      fileName: backup.storagePath.split('/').pop() ?? `backup-${id}.sql`,
    };
  }

  async findIntegrations() {
    const records = await this.prisma.integrationConfig.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return records.map((record) => ({
      ...record,
      configValue: this.redact(record.configValue),
    }));
  }

  async upsertIntegration(id: string | undefined, dto: UpsertIntegrationDto, userId: string) {
    const existing = id
      ? await this.prisma.integrationConfig.findUnique({
          where: { id },
          select: { configValue: true },
        })
      : null;
    if (id && !existing) {
      throw new NotFoundException('接口集成配置不存在');
    }
    const configValue = existing
      ? this.mergeMaskedValues(existing.configValue, dto.configValue)
      : dto.configValue;
    const record = id
      ? await this.prisma.integrationConfig.update({
          where: { id },
          data: {
            provider: dto.provider,
            configName: dto.configName,
            configValue: configValue as Prisma.InputJsonValue,
            isEnabled: dto.isEnabled,
            description: dto.description,
          },
        })
      : await this.prisma.integrationConfig.create({
          data: {
            provider: dto.provider,
            configName: dto.configName,
            configValue: configValue as Prisma.InputJsonValue,
            isEnabled: dto.isEnabled ?? false,
            description: dto.description,
          },
        });
    await this.operationLog.log({
      userId,
      module: 'integration',
      action: id ? 'update' : 'create',
      targetType: 'integration',
      targetId: record.id,
    });
    return { ...record, configValue: this.redact(record.configValue) };
  }

  async toggleIntegration(id: string, enabled: boolean, userId: string) {
    const record = await this.prisma.integrationConfig.update({
      where: { id },
      data: { isEnabled: enabled },
    });
    await this.operationLog.log({
      userId,
      module: 'integration',
      action: enabled ? 'enable' : 'disable',
      targetType: 'integration',
      targetId: id,
    });
    return { ...record, configValue: this.redact(record.configValue) };
  }

  private async dumpDatabase(backupId: string): Promise<{ storagePath: string; fileSize: number }> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL 未配置');
    }
    const url = new URL(databaseUrl);
    const databaseName = url.pathname.replace(/^\//, '');
    const tempPath = join(tmpdir(), `delivery-${backupId}.sql`);
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(tempPath, { flags: 'wx' });
      const processHandle = spawn(
        'mysqldump',
        [
          '--single-transaction',
          '--skip-lock-tables',
          '--no-tablespaces',
          `--host=${url.hostname}`,
          `--port=${url.port || '3306'}`,
          `--user=${decodeURIComponent(url.username)}`,
          databaseName,
        ],
        {
          env: {
            ...process.env,
            MYSQL_PWD: decodeURIComponent(url.password),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stderr = '';
      processHandle.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      processHandle.stdout.pipe(output);
      processHandle.on('error', reject);
      processHandle.on('close', (code) => {
        output.close();
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(stderr || `mysqldump 退出码 ${code}`));
        }
      });
    });
    try {
      const data = await readFile(tempPath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const storagePath = await this.storage.uploadBuffer(
        data,
        `backups/database/${timestamp}-${backupId}.sql`,
        'application/sql',
      );
      return { storagePath, fileSize: data.length };
    } finally {
      await unlink(tempPath).catch(() => undefined);
    }
  }

  private redact(value: Prisma.JsonValue): Prisma.JsonValue {
    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item));
    }
    if (value && typeof value === 'object') {
      const result: Record<string, Prisma.JsonValue> = {};
      for (const [key, item] of Object.entries(value)) {
        result[key] = /secret|password|token|api.?key|access.?key|encrypt.?key/i.test(key)
          ? '******'
          : item === undefined
            ? null
            : this.redact(item);
      }
      return result;
    }
    return value;
  }

  private mergeMaskedValues(
    existing: Prisma.JsonValue,
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    const existingRecord =
      existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(incoming)) {
      const storedValue = existingRecord[key];
      if (value === '******') {
        result[key] = storedValue;
      } else if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        storedValue &&
        typeof storedValue === 'object' &&
        !Array.isArray(storedValue)
      ) {
        result[key] = this.mergeMaskedValues(storedValue, value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
