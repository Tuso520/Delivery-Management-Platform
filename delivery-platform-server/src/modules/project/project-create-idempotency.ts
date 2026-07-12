import { createHash } from 'crypto';

import { BadRequestException } from '@nestjs/common';

export const PROJECT_CREATE_IDEMPOTENCY_KEY_MIN_LENGTH = 8;
export const PROJECT_CREATE_IDEMPOTENCY_KEY_MAX_LENGTH = 100;

const projectCreateIdempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;

export function validateProjectCreateIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !projectCreateIdempotencyKeyPattern.test(value)) {
    throw new BadRequestException(
      'Idempotency-Key 必须为 8-100 位安全字符（字母、数字、点、下划线、冒号或连字符）',
    );
  }
  return value;
}

export function hashProjectCreateRequest(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value), 'utf8').digest('hex');
}

function stableSerialize(value: unknown): string {
  if (value === null) return 'null';

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) {
        throw new BadRequestException('项目创建请求包含无效数字');
      }
      return JSON.stringify(value);
    case 'object': {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
      return `{${entries
        .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
        .join(',')}}`;
    }
    default:
      throw new BadRequestException('项目创建请求包含不支持的字段值');
  }
}
