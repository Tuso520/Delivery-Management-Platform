import { createHash } from 'crypto';
import { Readable } from 'stream';

import {
  buildStandardGeneratedObjectPlan,
  isArchiveStateConsistent,
  isPrimaryFileVersionStatusValid,
  renderStandardMarkdown,
  resolveLegacyKnowledgeContentType,
  validateKnowledgePrimaryContent,
  verifyStoredObject,
} from '../../../prisma/target-content-migration-support';

describe('target content migration support', () => {
  it('requires APPROVED only for the primary file of a published content version', () => {
    expect(isPrimaryFileVersionStatusValid('PUBLISHED', 'APPROVED')).toBe(true);
    expect(isPrimaryFileVersionStatusValid('PUBLISHED', 'DRAFT')).toBe(false);
    expect(isPrimaryFileVersionStatusValid('PUBLISHED', 'REVIEWING')).toBe(false);

    for (const fileStatus of ['DRAFT', 'UPLOADED', 'REVIEWING', 'APPROVED', 'REJECTED']) {
      expect(isPrimaryFileVersionStatusValid('DRAFT', fileStatus)).toBe(true);
      expect(isPrimaryFileVersionStatusValid('ARCHIVED', fileStatus)).toBe(true);
    }
    expect(isPrimaryFileVersionStatusValid('DRAFT', 'ARCHIVED')).toBe(false);
    expect(isPrimaryFileVersionStatusValid('DRAFT', 'UNKNOWN')).toBe(false);
  });

  it('requires ARCHIVED status and archivedAt to change together', () => {
    expect(isArchiveStateConsistent('ARCHIVED', new Date('2026-07-13T00:00:00.000Z'))).toBe(true);
    expect(isArchiveStateConsistent('ARCHIVED', null)).toBe(false);
    expect(isArchiveStateConsistent('DRAFT', new Date('2026-07-13T00:00:00.000Z'))).toBe(false);
    expect(isArchiveStateConsistent('DRAFT', null)).toBe(true);
  });

  it.each([
    {
      input: {
        contentType: 'article',
        markdownContent: '# 操作说明',
        fileUrl: null,
        activeAttachmentCount: 11,
      },
      expected: 'MARKDOWN',
    },
    {
      input: {
        contentType: 'file',
        markdownContent: '# 旧快速新增自动占位',
        fileUrl: null,
        activeAttachmentCount: 1,
      },
      expected: 'FILE',
    },
    {
      input: {
        contentType: 'link',
        markdownContent: '# 旧残留正文',
        fileUrl: 'https://example.com/guide',
        activeAttachmentCount: 0,
      },
      expected: 'LINK',
    },
    {
      input: {
        contentType: 'article',
        markdownContent: null,
        fileUrl: null,
        activeAttachmentCount: 1,
      },
      expected: 'FILE',
    },
  ])(
    'resolves legacy knowledge primary content without treating support files as a second primary',
    ({ input, expected }) => {
      expect(resolveLegacyKnowledgeContentType(input)).toBe(expected);
    },
  );

  it('renders deterministic standard Markdown and a stable SHA-256 object plan', () => {
    const input = {
      standardId: 'standard-1',
      standardVersionId: 'standard-version-1',
      code: 'SOP-001',
      name: '交付流程',
      type: 'SOP',
      category: '交付',
      version: 'V1.0',
      structuredContent: { z: 1, a: { second: 2, first: 1 } },
      applicability: { country: 'CN' },
    };
    const first = buildStandardGeneratedObjectPlan(input);
    const second = buildStandardGeneratedObjectPlan(input);

    expect(first).toEqual(second);
    expect(first.storageKey).toBe('migrations/standards/standard-1/standard-version-1.md');
    expect(first.originalName).toBe('SOP-001-V1.0.md');
    expect(first.checksum).toBe(createHash('sha256').update(first.body).digest('hex'));
    expect(first.body.toString('utf8')).toContain('## 标准内容');
    expect(renderStandardMarkdown(input).indexOf('"a"')).toBeLessThan(
      renderStandardMarkdown(input).indexOf('"z"'),
    );
  });

  it.each([
    {
      contentType: 'FILE',
      fileVersionId: 'file-version-1',
      markdownContent: null,
      externalUrl: null,
    },
    {
      contentType: 'MARKDOWN',
      fileVersionId: null,
      markdownContent: '# Knowledge',
      externalUrl: null,
    },
    {
      contentType: 'LINK',
      fileVersionId: null,
      markdownContent: null,
      externalUrl: 'https://example.com/knowledge',
    },
  ])('accepts exactly one $contentType primary representation', (input) => {
    expect(validateKnowledgePrimaryContent(input)).toEqual(
      expect.objectContaining({ valid: true }),
    );
  });

  it('fails closed for mixed, missing, mismatched and unsafe knowledge content', () => {
    expect(
      validateKnowledgePrimaryContent({
        contentType: 'FILE',
        fileVersionId: 'file-version-1',
        markdownContent: '# duplicate',
        externalUrl: null,
      }).code,
    ).toBe('KNOWLEDGE_MULTIPLE_PRIMARY_CONTENTS');
    expect(
      validateKnowledgePrimaryContent({
        contentType: 'MARKDOWN',
        fileVersionId: null,
        markdownContent: '   ',
        externalUrl: null,
      }).code,
    ).toBe('KNOWLEDGE_PRIMARY_CONTENT_MISSING');
    expect(
      validateKnowledgePrimaryContent({
        contentType: 'LINK',
        fileVersionId: null,
        markdownContent: '# wrong type',
        externalUrl: null,
      }).code,
    ).toBe('KNOWLEDGE_PRIMARY_CONTENT_TYPE_MISMATCH');
    expect(
      validateKnowledgePrimaryContent({
        contentType: 'LINK',
        fileVersionId: null,
        markdownContent: null,
        externalUrl: 'javascript:alert(1)',
      }).code,
    ).toBe('KNOWLEDGE_EXTERNAL_URL_INVALID');
  });

  it('streams the stored object and validates both size and SHA-256', async () => {
    const body = Buffer.from('verified object', 'utf8');
    const reader = {
      statObject: jest.fn().mockResolvedValue({ size: body.length }),
      getObject: jest.fn().mockResolvedValue(Readable.from(body)),
    };
    await expect(
      verifyStoredObject(reader, {
        bucket: 'files',
        key: 'standards/1.md',
        expectedSize: body.length,
        expectedChecksum: createHash('sha256').update(body).digest('hex'),
      }),
    ).resolves.toEqual(expect.objectContaining({ ok: true, actualSize: body.length }));
    expect(reader.statObject).toHaveBeenCalledWith('files', 'standards/1.md');
    expect(reader.getObject).toHaveBeenCalledWith('files', 'standards/1.md');
  });

  it('never accepts a missing, truncated or hash-mismatched object', async () => {
    const missingReader = {
      statObject: jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('missing'), { code: 'NoSuchKey' })),
      getObject: jest.fn(),
    };
    await expect(
      verifyStoredObject(missingReader, {
        bucket: 'files',
        key: 'missing.md',
        expectedSize: 1,
      }),
    ).resolves.toEqual({ ok: false, code: 'OBJECT_NOT_FOUND' });

    const body = Buffer.from('actual', 'utf8');
    await expect(
      verifyStoredObject(
        {
          statObject: jest.fn().mockResolvedValue({ size: body.length }),
          getObject: jest.fn().mockResolvedValue(Readable.from(body)),
        },
        {
          bucket: 'files',
          key: 'different.md',
          expectedSize: body.length,
          expectedChecksum: '0'.repeat(64),
        },
      ),
    ).resolves.toEqual(expect.objectContaining({ ok: false, code: 'OBJECT_HASH_MISMATCH' }));
  });
});
