import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

function encryptionKey(config: ConfigService | undefined, capability: string): Buffer {
  const configured =
    config?.get<string>('INTEGRATION_SECRET_ENCRYPTION_KEY') ??
    process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;
  if (!configured) {
    throw new ServiceUnavailableException(`未配置${capability}密钥加密变量，敏感能力已关闭`);
  }
  const key = Buffer.from(configured, 'base64');
  if (key.length !== 32) {
    throw new ServiceUnavailableException(
      `${capability}密钥加密变量必须是 32 字节 Base64，敏感能力已关闭`,
    );
  }
  return key;
}

export function encryptConfigSecrets(
  config: ConfigService | undefined,
  associatedData: string,
  secrets: Record<string, unknown>,
  capability = '集成',
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(config, capability), iv);
  cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(secrets), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptConfigSecrets(
  config: ConfigService | undefined,
  associatedData: string,
  value: string,
  capability = '集成',
): Record<string, unknown> {
  const [version, ivValue, tagValue, encryptedValue] = value.split(':');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
    throw new ServiceUnavailableException(`${capability}密钥密文格式无效，敏感能力已关闭`);
  }
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey(config, capability),
      Buffer.from(ivValue, 'base64'),
    );
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    const parsed: unknown = JSON.parse(plain);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch (error) {
    if (error instanceof ServiceUnavailableException) throw error;
    throw new ServiceUnavailableException(`${capability}密钥无法解密，敏感能力已关闭`);
  }
}
