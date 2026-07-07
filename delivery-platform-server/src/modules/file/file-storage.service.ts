import { createReadStream } from 'fs';
import { basename, extname } from 'path';
import type { Readable } from 'stream';

import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { v4 as uuidv4 } from 'uuid';

interface StorageConfig {
  endpoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  bucket: string;
  useSSL: boolean;
}

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly client: Client;
  private readonly bucket: string;
  private readyPromise: Promise<void> | null = null;

  constructor(configService: ConfigService) {
    const config = configService.get<StorageConfig>('storage');
    if (!config?.accessKey || !config.secretKey) {
      throw new Error('MinIO storage credentials are not configured');
    }

    this.bucket = config.bucket;
    this.client = new Client({
      endPoint: config.endpoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
  }

  getBucketName(): string {
    return this.bucket;
  }

  async upload(file: Express.Multer.File, subPath: string): Promise<string> {
    await this.ensureBucket();
    const extension = extname(file.originalname).toLowerCase();
    const safeName = basename(file.originalname, extension)
      .replace(/[^\p{L}\p{N}._-]+/gu, '-')
      .slice(0, 80);
    const objectName = [
      this.normalizePath(subPath),
      `${uuidv4()}-${safeName || 'file'}${extension}`,
    ]
      .filter(Boolean)
      .join('/');

    const fileBody = this.getUploadBody(file);

    try {
      await this.client.putObject(
        this.bucket,
        objectName,
        fileBody,
        file.size,
        {
          'Content-Type': file.mimetype,
          'X-Amz-Meta-Original-Name': encodeURIComponent(file.originalname),
        },
      );
      this.logger.log(`Object uploaded: ${this.bucket}/${objectName}`);
      return objectName;
    } catch (error) {
      this.logger.error(`MinIO upload failed for ${objectName}`, error);
      throw new ServiceUnavailableException('文件存储服务暂不可用');
    }
  }

  async uploadBuffer(
    data: Buffer,
    objectName: string,
    contentType: string,
  ): Promise<string> {
    await this.ensureBucket();
    const normalizedName = this.normalizePath(objectName);
    try {
      await this.client.putObject(
        this.bucket,
        normalizedName,
        data,
        data.length,
        { 'Content-Type': contentType },
      );
      return normalizedName;
    } catch (error) {
      this.logger.error(`MinIO upload failed for ${normalizedName}`, error);
      throw new ServiceUnavailableException('文件存储服务暂不可用');
    }
  }

  async getStatus(): Promise<{ bucket: string; available: boolean }> {
    try {
      await this.ensureBucket();
      return { bucket: this.bucket, available: true };
    } catch {
      return { bucket: this.bucket, available: false };
    }
  }

  async delete(storagePath: string): Promise<void> {
    await this.ensureBucket();
    try {
      await this.client.removeObject(this.bucket, storagePath);
      this.logger.log(`Object deleted: ${this.bucket}/${storagePath}`);
    } catch (error) {
      this.logger.error(`MinIO delete failed for ${storagePath}`, error);
      throw new ServiceUnavailableException('文件存储服务暂不可用');
    }
  }

  async getUrl(storagePath: string): Promise<string> {
    return this.getPresignedUrl(storagePath, 900);
  }

  async getPresignedUrl(
    storagePath: string,
    expiresIn: number,
  ): Promise<string> {
    await this.ensureBucket();
    try {
      return await this.client.presignedGetObject(
        this.bucket,
        storagePath,
        expiresIn,
      );
    } catch (error) {
      this.logger.error(`MinIO signed URL failed for ${storagePath}`, error);
      throw new ServiceUnavailableException('文件存储服务暂不可用');
    }
  }

  async getObject(storagePath: string): Promise<Readable> {
    await this.ensureBucket();
    try {
      return await this.client.getObject(this.bucket, storagePath);
    } catch (error) {
      this.logger.error(`MinIO object read failed for ${storagePath}`, error);
      throw new ServiceUnavailableException('文件存储服务暂不可用');
    }
  }

  private async ensureBucket(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.initializeBucket().catch((error: unknown) => {
        this.readyPromise = null;
        throw error;
      });
    }
    return this.readyPromise;
  }

  private async initializeBucket(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Private MinIO bucket created: ${this.bucket}`);
      }
    } catch (error) {
      this.logger.error('MinIO initialization failed', error);
      throw new ServiceUnavailableException('文件存储服务暂不可用');
    }
  }

  private normalizePath(value: string): string {
    return value
      .replace(/\\/g, '/')
      .split('/')
      .filter((segment) => segment && segment !== '.' && segment !== '..')
      .join('/');
  }

  private getUploadBody(
    file: Express.Multer.File,
  ): Buffer | Readable | string {
    const rawBuffer = (file as unknown as { buffer?: unknown }).buffer;

    if (Buffer.isBuffer(rawBuffer)) {
      return rawBuffer;
    }

    if (rawBuffer instanceof ArrayBuffer) {
      return Buffer.from(rawBuffer);
    }

    if (ArrayBuffer.isView(rawBuffer)) {
      return Buffer.from(
        rawBuffer.buffer,
        rawBuffer.byteOffset,
        rawBuffer.byteLength,
      );
    }

    const path = (file as Express.Multer.File & { path?: string }).path;
    if (path) {
      return createReadStream(path);
    }

    const stream = (file as Express.Multer.File & { stream?: Readable }).stream;
    if (stream) {
      return stream;
    }

    const fileShape = Object.getOwnPropertyNames(file ?? {}).join(',');
    this.logger.warn(
      `Uploaded file body is missing. fields=${fileShape}; size=${file?.size ?? 'unknown'}; mimetype=${file?.mimetype ?? 'unknown'}`,
    );
    throw new BadRequestException('上传文件内容为空或格式异常');
  }
}
