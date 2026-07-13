import { readFileSync } from 'fs';
import { join } from 'path';

describe('file-only target content schema migration contract', () => {
  const prismaRoot = join(__dirname, '../../../prisma');
  const schema = readFileSync(join(prismaRoot, 'schema.prisma'), 'utf8');
  const migration = readFileSync(
    join(prismaRoot, 'migrations/20260713102000_prepare_file_only_content_migration/migration.sql'),
    'utf8',
  );
  const migrator = readFileSync(join(prismaRoot, 'migrate-target-content.ts'), 'utf8');
  const migrationSupport = readFileSync(
    join(prismaRoot, 'target-content-migration-support.ts'),
    'utf8',
  );

  it('keeps legacy content columns during the expand/backfill release', () => {
    expect(schema).toContain('structuredContent Json?');
    expect(schema).toContain('applicability     Json?');
    expect(schema).toContain('legacySnapshot    Json?');
    expect(migration).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE)\b/imu);
    expect(migration).toContain('standard_versions_status_archived_at_idx');
    expect(migration).toContain('knowledge_versions_v2_content_type_status_archived_idx');
    expect(migration).toContain('migration_exceptions_domain_code_status_idx');
    expect(migration).toContain('information_schema`.`statistics');
    expect(migration.match(/^PREPARE target_content_index_stmt/gmu)).toHaveLength(3);
  });

  it('requires verified object storage before binding a generated standard file', () => {
    const functionStart = migrator.indexOf('async function ensureStandardGeneratedFile');
    const functionEnd = migrator.indexOf('async function backfillStandardFiles', functionStart);
    const generatedFileMigrator = migrator.slice(functionStart, functionEnd);
    const verifyCall = generatedFileMigrator.indexOf(
      'objectVerification = await verifyStoredObject',
    );
    const putCall = generatedFileMigrator.indexOf('await storage.client.putObject');
    const databaseBinding = generatedFileMigrator.indexOf('await tx.standardVersion.updateMany');
    const storageUnavailable = generatedFileMigrator.indexOf(
      "'STANDARD_OBJECT_STORAGE_UNAVAILABLE'",
    );
    const unavailableReturn = generatedFileMigrator.indexOf('return;', storageUnavailable);

    expect(functionStart).toBeGreaterThan(-1);
    expect(functionEnd).toBeGreaterThan(functionStart);
    expect(verifyCall).toBeGreaterThan(-1);
    expect(putCall).toBeGreaterThan(verifyCall);
    expect(databaseBinding).toBeGreaterThan(putCall);
    expect(storageUnavailable).toBeGreaterThan(-1);
    expect(unavailableReturn).toBeLessThan(databaseBinding);
    expect(migrator).not.toMatch(/touch.+minio/iu);
  });

  it('provides strict read-only verification and fail-closed ambiguity findings', () => {
    expect(migrator).toContain("report.mode = apply ? 'APPLY' : verify ? 'VERIFY' : 'DRY_RUN'");
    expect(migrator).toContain('strict target content verification failed');
    expect(migrator).toContain("'MIXED_LEGACY_CONTENT'");
    expect(migrationSupport).toContain("'KNOWLEDGE_MULTIPLE_PRIMARY_CONTENTS'");
    expect(migrator).toContain("'OPEN_CONTENT_MIGRATION_EXCEPTION'");
    expect(migrator).toContain('{ username: actorUsername }');
  });

  it('keeps pre-audit ERROR findings in strict dry-run but re-audits apply after writes', () => {
    expect(migrator).toContain('report.integrityBefore = await auditTargetContent()');
    expect(migrator).toContain('if (apply) report.findings.splice(beforeFindingCount)');
    expect(migrator).toContain(
      'report.integrityAfter = apply ? await auditTargetContent() : report.integrityBefore',
    );
    expect(migrator).toContain(
      'targetContentErrorsAreBlocking({ apply, strict }, applyErrorCount)',
    );
    expect(migrator).not.toMatch(/\n\s{2}report\.findings\.splice\(beforeFindingCount\);/gu);
  });

  it('fails closed when a legacy source row has no exact target version', () => {
    expect(migrator).toContain('async function auditSourceTargetCoverage');
    expect(migrator).toContain("'TARGET_CONTENT_SOURCE_MAPPING_INVALID'");
    expect(migrator).toContain("'TARGET_CONTENT_AGGREGATE_WITHOUT_VERSION'");
    expect(migrator).toContain("'DOCUMENT_TEMPLATE_SOURCE_OBJECT_REQUIRED'");
  });

  it('covers soft-deleted knowledge rows and archives deleted attachment file indexes', () => {
    const migrationStart = migrator.indexOf('async function migrateKnowledge');
    const migrationEnd = migrator.indexOf('function standardFileStatus', migrationStart);
    const knowledgeMigration = migrator.slice(migrationStart, migrationEnd);
    const coverageStart = migrator.indexOf('async function auditSourceTargetCoverage');
    const coverageEnd = migrator.indexOf('async function auditTargetContent', coverageStart);
    const coverage = migrator.slice(coverageStart, coverageEnd);

    expect(knowledgeMigration).not.toContain('where: { deletedAt: null }');
    expect(knowledgeMigration).toContain("article.deletedAt ?? (article.status === 'Archived'");
    expect(knowledgeMigration).toContain("targetArchived ? 'ARCHIVED'");
    expect(knowledgeMigration).toContain('attachment.deletedAt');
    expect(knowledgeMigration).toMatch(/'DRAFT',\s*attachment\.deletedAt/gu);
    expect(coverage).toContain("where: { ownerType: 'KnowledgeArticle' }");
    expect(coverage).toContain('expectedArchived: sourceArchived');
    expect(coverage).toContain('logicalFileArchived: expectedArchived');
    const itemCoverageFinding = coverage.indexOf(
      "missingMapping('KNOWLEDGE', 'KnowledgeArticle', article.id",
    );
    const versionCoverageLoop = coverage.indexOf('for (const version of versions)', itemCoverageFinding);
    expect(itemCoverageFinding).toBeGreaterThan(-1);
    expect(versionCoverageLoop).toBeGreaterThan(itemCoverageFinding);
    expect(coverage.slice(itemCoverageFinding, versionCoverageLoop)).not.toContain('continue;');
  });

  it('requires APPROVED primary files for published standard and knowledge versions', () => {
    expect(migrator).toContain('contentVersionStatus: version.status');
    expect(migrator).toContain(
      '!isPrimaryFileVersionStatusValid(input.contentVersionStatus, fileVersion.status)',
    );
    expect(migrationSupport).toContain("fileVersionStatus === 'APPROVED'");
    expect(migrator).toContain("'KNOWLEDGE_ITEM_ARCHIVE_STATE_INVALID'");
    expect(migrator).toContain("'KNOWLEDGE_VERSION_ARCHIVE_STATE_INVALID'");
  });

  it('uses create-or-assert semantics for migrated knowledge content', () => {
    expect(migrator).toContain("throw new Error('KNOWLEDGE_ITEM_TARGET_MISMATCH')");
    expect(migrator).toContain("throw new Error('KNOWLEDGE_VERSION_TARGET_MISMATCH')");
    expect(migrator).toContain("throw new Error('KNOWLEDGE_VERSION_CONTENT_MISMATCH')");
    expect(migrator).toContain(
      "targetContentType === 'MARKDOWN' ? sourceVersion.markdownContent : null",
    );
  });

  it('requires a stored SHA-256 for every target primary or supporting file', () => {
    const checksumBackfillCall = migrator.indexOf('await backfillTargetAssetChecksums()');
    const finalAuditCall = migrator.lastIndexOf('await auditTargetContent()');

    expect(migrator).toContain('async function backfillTargetAssetChecksums');
    expect(migrator).toContain("'TARGET_FILE_CHECKSUM_BACKFILL_FAILED'");
    expect(migrator).toContain('`${input.codePrefix}_FILE_CHECKSUM_INVALID`');
    expect(migrator).toContain('expectedChecksum: fileVersion.asset.checksum');
    expect(migrator).toContain("asset.ownerType === 'KNOWLEDGE' ? 'KNOWLEDGE' : 'STANDARD'");
    expect(checksumBackfillCall).toBeGreaterThan(-1);
    expect(finalAuditCall).toBeGreaterThan(checksumBackfillCall);
  });

  it('reopens recurring findings and only reconciles exceptions owned by this migration', () => {
    expect(migrator).toContain("migration: 'TARGET_CONTENT_FILE_ONLY_V1'");
    expect(migrator).toContain("!== 'TARGET_CONTENT_FILE_ONLY_V1'");
    expect(migrator).toContain('resolvedBy: null');
    expect(migrator).not.toContain("if (existing?.status === 'RESOLVED') continue");
  });

  it('keeps migration descriptions valid UTF-8 Chinese', () => {
    expect(migrator).toContain("changeDescription: '结构化标准内容文件化迁移'");
    expect(migrator).toContain("changeDescription: '历史文件索引迁移'");
    expect(migrator).not.toContain('\uFFFD');
    expect(migrator).not.toMatch(/缁撴瀯|鏂囦欢|杩佺Щ|鐭ヨ瘑/u);
  });
});
