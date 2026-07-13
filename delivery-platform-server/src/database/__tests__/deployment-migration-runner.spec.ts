import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('deployment migration runner', () => {
  const source = readFileSync(
    join(__dirname, '../../../prisma/run-deployment-migrations.sh'),
    'utf8',
  );
  const archiveGateMatch = source.match(/node -e '\r?\n([\s\S]*?)\r?\n' "\$archive_audit_report"/u);

  if (!archiveGateMatch?.[1]) {
    throw new Error('archive migration gate program was not found in the deployment runner');
  }

  const archiveGateProgram = archiveGateMatch[1];

  function runArchiveGate(report: unknown) {
    const directory = mkdtempSync(join(tmpdir(), 'archive-migration-gate-'));
    const reportPath = join(directory, 'report.json');
    writeFileSync(reportPath, JSON.stringify(report), 'utf8');
    try {
      return spawnSync(process.execPath, ['-e', archiveGateProgram, reportPath], {
        encoding: 'utf8',
      });
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  }

  it('strictly gates content, foundation, then secrets before the second seed', () => {
    const schema = source.indexOf('prisma migrate deploy');
    const firstSeed = source.indexOf('prisma/seed.ts');
    const archiveAudit = source.indexOf('prisma/archive-migration-audit.ts');
    const contentDryRun = source.indexOf('prisma/migrate-target-content.ts --strict');
    const contentApply = source.indexOf('prisma/migrate-target-content.ts', contentDryRun + 1);
    const foundationDryRun = source.indexOf('prisma/migrate-target-foundation.ts --strict');
    const foundationApply = source.indexOf(
      'prisma/migrate-target-foundation.ts',
      foundationDryRun + 1,
    );
    const secretDryRun = source.indexOf(
      'prisma/migrate-integration-secrets.ts',
      foundationApply + 1,
    );
    const secretApply = source.indexOf('prisma/migrate-integration-secrets.ts', secretDryRun + 1);
    const secondSeed = source.indexOf('prisma/seed.ts', secretApply + 1);
    const contentVerify = source.indexOf('prisma/migrate-target-content.ts --verify --strict');
    const foundationVerify = source.indexOf(
      'prisma/migrate-target-foundation.ts --verify --strict',
    );
    const secretVerify = source.indexOf('prisma/migrate-integration-secrets.ts --verify');

    expect(schema).toBeGreaterThan(-1);
    expect(firstSeed).toBeGreaterThan(schema);
    expect(archiveAudit).toBeGreaterThan(firstSeed);
    expect(contentDryRun).toBeGreaterThan(archiveAudit);
    expect(contentApply).toBeGreaterThan(contentDryRun);
    expect(foundationDryRun).toBeGreaterThan(contentApply);
    expect(foundationApply).toBeGreaterThan(foundationDryRun);
    expect(secretDryRun).toBeGreaterThan(foundationApply);
    expect(secretApply).toBeGreaterThan(secretDryRun);
    expect(secondSeed).toBeGreaterThan(secretApply);
    expect(contentVerify).toBeGreaterThan(secondSeed);
    expect(foundationVerify).toBeGreaterThan(contentVerify);
    expect(secretVerify).toBeGreaterThan(foundationVerify);
    expect(source).toContain('"STORED_LEVEL_MISMATCH"');
    expect(source).toContain('"FOLDER_WITH_DIRECT_FILES"');
    expect(source).toContain('!deterministicReviewCodes.has(finding.code)');
    expect(source).toContain('errors.length > 0 || blockingReviews.length > 0');
    expect(source).not.toContain('prisma/archive-migration-audit.ts --strict');
    expect(source).toContain('prisma/migrate-target-content.ts --strict');
    expect(source).toContain('--apply "--actor-username=$actor_username" --strict');
  });

  it('fails closed for archive errors and review codes without a deterministic mapping', () => {
    expect(source).toContain('errors.length !== report.errors');
    expect(source).toContain('archive migration audit error count does not match its findings');
    expect(source).toContain('every unknown REVIEW fails closed');
  });

  it('allows only the two archive review findings with deterministic mappings', () => {
    const result = runArchiveGate({
      errors: 0,
      reviewRequired: 2,
      findings: [
        { severity: 'REVIEW', code: 'STORED_LEVEL_MISMATCH' },
        { severity: 'REVIEW', code: 'FOLDER_WITH_DIRECT_FILES' },
      ],
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('blocks unknown archive reviews, errors, and inconsistent summaries', () => {
    const unknownReview = runArchiveGate({
      errors: 0,
      reviewRequired: 1,
      findings: [{ severity: 'REVIEW', code: 'FUTURE_REVIEW' }],
    });
    const error = runArchiveGate({
      errors: 1,
      reviewRequired: 0,
      findings: [{ severity: 'ERROR', code: 'ORPHAN_PARENT' }],
    });
    const inconsistent = runArchiveGate({
      errors: 1,
      reviewRequired: 0,
      findings: [],
    });
    const malformed = runArchiveGate({
      errors: 0,
      reviewRequired: 0,
      findings: [{ severity: 'FUTURE', code: 'FUTURE_SEVERITY' }],
    });

    expect(unknownReview.status).toBe(2);
    expect(unknownReview.stderr).toContain('1 non-automatable review finding(s)');
    expect(error.status).toBe(2);
    expect(error.stderr).toContain('1 error(s)');
    expect(inconsistent.status).not.toBe(0);
    expect(inconsistent.stderr).toContain('error count does not match its findings');
    expect(malformed.status).not.toBe(0);
    expect(malformed.stderr).toContain('returned an invalid finding');
  });

  it('never invokes an apply migration without the configured audit actor', () => {
    expect(source).toContain(
      'actor_username="${INTEGRATION_SECRET_MIGRATION_ACTOR_USERNAME:-admin}"',
    );
    expect(source.match(/--apply "--actor-username=\$actor_username"/gu)).toHaveLength(3);
    expect(source).toContain('set -eu');
  });
});
