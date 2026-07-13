import { createHash } from 'crypto';
import { Readable } from 'stream';

export type KnowledgePrimaryContentType = 'FILE' | 'MARKDOWN' | 'LINK';

export interface KnowledgePrimaryContentInput {
  contentType: string;
  fileVersionId: string | null;
  markdownContent: string | null;
  externalUrl: string | null;
}

export interface KnowledgePrimaryContentValidation {
  valid: boolean;
  code?:
    | 'KNOWLEDGE_CONTENT_TYPE_UNSUPPORTED'
    | 'KNOWLEDGE_PRIMARY_CONTENT_MISSING'
    | 'KNOWLEDGE_MULTIPLE_PRIMARY_CONTENTS'
    | 'KNOWLEDGE_PRIMARY_CONTENT_TYPE_MISMATCH'
    | 'KNOWLEDGE_EXTERNAL_URL_INVALID';
  populatedFields: Array<'fileVersionId' | 'markdownContent' | 'externalUrl'>;
}

export interface LegacyKnowledgeContentInput {
  contentType: string;
  fileUrl: string | null;
  markdownContent: string | null;
  activeAttachmentCount: number;
}

export interface StandardGeneratedObjectPlan {
  storageKey: string;
  originalName: string;
  body: Buffer;
  checksum: string;
}

export interface StoredObjectReader {
  statObject(
    bucket: string,
    key: string,
  ): Promise<{ size: number; metaData?: Record<string, string | undefined> }>;
  getObject(bucket: string, key: string): Promise<Readable>;
}

export interface StoredObjectVerification {
  ok: boolean;
  code?:
    | 'OBJECT_NOT_FOUND'
    | 'OBJECT_STAT_FAILED'
    | 'OBJECT_SIZE_MISMATCH'
    | 'OBJECT_HASH_MISMATCH';
  actualSize?: number;
  actualChecksum?: string;
}

export function isPrimaryFileVersionStatusValid(
  contentVersionStatus: string,
  fileVersionStatus: string,
): boolean {
  if (!['DRAFT', 'UPLOADED', 'REVIEWING', 'APPROVED', 'REJECTED'].includes(fileVersionStatus)) {
    return false;
  }
  return contentVersionStatus !== 'PUBLISHED' || fileVersionStatus === 'APPROVED';
}

export function isArchiveStateConsistent(status: string, archivedAt: Date | null): boolean {
  return (status === 'ARCHIVED') === (archivedAt !== null);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2);
}

function markdownText(value: string): string {
  return value
    .replace(/[\r\n]+/gu, ' ')
    .replace(/([\\`*_{}\[\]()#+.!|>-])/gu, '\\$1')
    .trim();
}

function indentedJson(value: unknown): string {
  return canonicalJson(value)
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

export function renderStandardMarkdown(input: {
  code: string;
  name: string;
  type: string;
  category: string | null;
  version: string;
  structuredContent: unknown;
  applicability: unknown;
}): string {
  const lines = [
    `# ${markdownText(input.name)}`,
    '',
    `- 标准编号：${markdownText(input.code)}`,
    `- 标准类型：${markdownText(input.type)}`,
    `- 标准分类：${markdownText(input.category || '未分类')}`,
    `- 版本：${markdownText(input.version)}`,
    '',
    '## 适用范围',
    '',
    indentedJson(input.applicability ?? null),
    '',
    '## 标准内容',
    '',
    indentedJson(input.structuredContent ?? null),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function safeFileSegment(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);
  return normalized || 'standard';
}

export function buildStandardGeneratedObjectPlan(input: {
  standardId: string;
  standardVersionId: string;
  code: string;
  name: string;
  type: string;
  category: string | null;
  version: string;
  structuredContent: unknown;
  applicability: unknown;
}): StandardGeneratedObjectPlan {
  const body = Buffer.from(renderStandardMarkdown(input), 'utf8');
  return {
    storageKey: `migrations/standards/${input.standardId}/${input.standardVersionId}.md`,
    originalName: `${safeFileSegment(input.code)}-${safeFileSegment(input.version)}.md`,
    body,
    checksum: createHash('sha256').update(body).digest('hex'),
  };
}

function isValidExternalUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function resolveLegacyKnowledgeContentType(
  input: LegacyKnowledgeContentInput,
): KnowledgePrimaryContentType {
  const declaredType = input.contentType.trim().toLowerCase();
  if (declaredType === 'file') return 'FILE';
  if (declaredType === 'link') return 'LINK';
  if (input.markdownContent?.trim()) return 'MARKDOWN';
  if (input.fileUrl?.trim() || input.activeAttachmentCount > 0) return 'FILE';
  return 'MARKDOWN';
}

export function validateKnowledgePrimaryContent(
  input: KnowledgePrimaryContentInput,
): KnowledgePrimaryContentValidation {
  const populatedFields: KnowledgePrimaryContentValidation['populatedFields'] = [];
  if (input.fileVersionId) populatedFields.push('fileVersionId');
  if (input.markdownContent?.trim()) populatedFields.push('markdownContent');
  if (input.externalUrl?.trim()) populatedFields.push('externalUrl');

  if (!['FILE', 'MARKDOWN', 'LINK'].includes(input.contentType)) {
    return { valid: false, code: 'KNOWLEDGE_CONTENT_TYPE_UNSUPPORTED', populatedFields };
  }
  if (populatedFields.length === 0) {
    return { valid: false, code: 'KNOWLEDGE_PRIMARY_CONTENT_MISSING', populatedFields };
  }
  if (populatedFields.length > 1) {
    return { valid: false, code: 'KNOWLEDGE_MULTIPLE_PRIMARY_CONTENTS', populatedFields };
  }

  const expectedField: Record<KnowledgePrimaryContentType, (typeof populatedFields)[number]> = {
    FILE: 'fileVersionId',
    MARKDOWN: 'markdownContent',
    LINK: 'externalUrl',
  };
  if (populatedFields[0] !== expectedField[input.contentType as KnowledgePrimaryContentType]) {
    return {
      valid: false,
      code: 'KNOWLEDGE_PRIMARY_CONTENT_TYPE_MISMATCH',
      populatedFields,
    };
  }
  if (input.contentType === 'LINK' && !isValidExternalUrl(input.externalUrl?.trim() ?? '')) {
    return { valid: false, code: 'KNOWLEDGE_EXTERNAL_URL_INVALID', populatedFields };
  }
  return { valid: true, populatedFields };
}

function storageErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const candidate = error as { code?: unknown; name?: unknown };
  if (typeof candidate.code === 'string') return candidate.code;
  if (typeof candidate.name === 'string') return candidate.name;
  return '';
}

async function sha256Stream(stream: Readable): Promise<{ checksum: string; size: number }> {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string | Uint8Array);
    size += buffer.length;
    hash.update(buffer);
  }
  return { checksum: hash.digest('hex'), size };
}

export async function verifyStoredObject(
  reader: StoredObjectReader,
  input: { bucket: string; key: string; expectedSize: number; expectedChecksum?: string | null },
): Promise<StoredObjectVerification> {
  try {
    const stat = await reader.statObject(input.bucket, input.key);
    if (stat.size !== input.expectedSize) {
      return {
        ok: false,
        code: 'OBJECT_SIZE_MISMATCH',
        actualSize: stat.size,
      };
    }
  } catch (error: unknown) {
    const code = storageErrorCode(error);
    return {
      ok: false,
      code: ['NoSuchKey', 'NotFound', 'NoSuchObject'].includes(code)
        ? 'OBJECT_NOT_FOUND'
        : 'OBJECT_STAT_FAILED',
    };
  }

  try {
    const result = await sha256Stream(await reader.getObject(input.bucket, input.key));
    if (result.size !== input.expectedSize) {
      return {
        ok: false,
        code: 'OBJECT_SIZE_MISMATCH',
        actualSize: result.size,
        actualChecksum: result.checksum,
      };
    }
    if (
      input.expectedChecksum &&
      /^[a-f\d]{64}$/iu.test(input.expectedChecksum) &&
      result.checksum.toLowerCase() !== input.expectedChecksum.toLowerCase()
    ) {
      return {
        ok: false,
        code: 'OBJECT_HASH_MISMATCH',
        actualSize: result.size,
        actualChecksum: result.checksum,
      };
    }
    return { ok: true, actualSize: result.size, actualChecksum: result.checksum };
  } catch {
    return { ok: false, code: 'OBJECT_STAT_FAILED' };
  }
}
