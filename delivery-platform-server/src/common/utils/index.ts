import { createHash } from 'crypto';

import { v4 as uuidv4 } from 'uuid';

/**
 * 生成 UUID v4
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * 生成简单的项目编号
 * 格式: PRJ-YYYYMMDD-XXXX
 */
export function generateProjectCode(): string {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PRJ-${dateStr}-${random}`;
}

/**
 * MD5 哈希
 */
export function md5Hash(input: string): string {
  return createHash('md5').update(input).digest('hex');
}

/**
 * 计算分页总页数
 */
export function calculateTotalPages(total: number, pageSize: number): number {
  return Math.ceil(total / pageSize);
}

/**
 * 从 Date 对象获取 ISO 日期字符串 (YYYY-MM-DD)
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
