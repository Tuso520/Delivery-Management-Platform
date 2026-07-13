import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  HELP_TEXT,
  parseMigrationOptions,
  TARGET_PROJECT_DELIVERY_STAGES,
  TARGET_PROJECT_LIFECYCLE_STATUSES,
} from '../../../prisma/target-foundation-migration-support';
import {
  PROJECT_DELIVERY_STAGES,
  PROJECT_LIFECYCLE_STATUSES,
} from '../../modules/project/project.constants';

describe('target project migration contract', () => {
  it('keeps runtime and migration validation dictionaries aligned', () => {
    expect(TARGET_PROJECT_LIFECYCLE_STATUSES).toEqual(PROJECT_LIFECYCLE_STATUSES);
    expect(TARGET_PROJECT_DELIVERY_STAGES).toEqual(PROJECT_DELIVERY_STAGES);
  });

  it('allows every target stage during the destructive state-switch preflight', () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        '../../../prisma/migrations/20260712094000_finalize_project_template_states_and_member_soft_delete/migration.sql',
      ),
      'utf8',
    );

    for (const stage of TARGET_PROJECT_DELIVERY_STAGES) {
      expect(migration).toContain(`'${stage}'`);
    }
    expect(migration).toContain("WHEN 'commissioning' THEN 'COMMISSIONING'");
    expect(migration).toContain("WHEN 'testing' THEN 'TESTING'");
    expect(migration).not.toContain("ELSE 'STARTUP'");
    expect(migration).not.toContain("ELSE 'ACTIVE'");
    expect(migration).toContain("'UNMAPPED_LEGACY_PROJECT_STATUS'");
    expect(migration).toContain("'UNMAPPED_LEGACY_PROJECT_STAGE'");
  });
});

describe('target foundation migration options', () => {
  const migrator = readFileSync(
    resolve(__dirname, '../../../prisma/migrate-target-foundation.ts'),
    'utf8',
  );

  it('accepts exactly one apply actor identifier', () => {
    expect(() => parseMigrationOptions(['--apply'])).toThrow(
      '--apply requires an active --actor-user-id or --actor-username',
    );
    expect(parseMigrationOptions(['--apply', '--actor-username=admin'])).toEqual(
      expect.objectContaining({
        apply: true,
        actorUserId: undefined,
        actorUsername: 'admin',
      }),
    );
    expect(parseMigrationOptions(['--apply', '--actor-user-id=user-1'])).toEqual(
      expect.objectContaining({
        apply: true,
        actorUserId: 'user-1',
        actorUsername: undefined,
      }),
    );
    expect(() =>
      parseMigrationOptions(['--apply', '--actor-user-id=user-1', '--actor-username=admin']),
    ).toThrow('Use only one of --actor-user-id or --actor-username');
  });

  it('keeps verification read-only and rejects actor arguments', () => {
    expect(() => parseMigrationOptions(['--verify', '--actor-username=admin'])).toThrow(
      '--verify does not accept a migration actor',
    );
    expect(() => parseMigrationOptions(['--apply', '--verify', '--actor-username=admin'])).toThrow(
      '--apply and --verify are mutually exclusive',
    );
  });

  it('rejects empty usernames and documents both actor selectors', () => {
    expect(() => parseMigrationOptions(['--actor-username='])).toThrow(
      '--actor-username must not be empty',
    );
    expect(HELP_TEXT).toContain('--actor-username=<username>');
    expect(parseMigrationOptions(['--help']).help).toBe(true);
  });

  it('never records a successful apply while migration findings remain', () => {
    expect(migrator).toContain("result: findingCount === 0 ? 'success' : 'failure'");
    expect(migrator).toContain('Target foundation apply completed with ${findingCount}');
    expect(migrator).toContain('if (options.strict && report.findings.length > 0)');
  });

  it('does not flag its own deterministic file asset on an idempotent retry', () => {
    expect(migrator).toContain('plannedAsset.id === assetId(plannedAsset.file.id)');
  });

  it('counts the deterministic folder/file split without blocking strict migration', () => {
    expect(migrator).toContain(
      "increment(report.planned, 'deterministicSyntheticArchiveEntries')",
    );
    expect(migrator).not.toContain('FOLDER_WITH_DIRECT_FILES_MAPPED_TO_SYNTHETIC_ITEM');
  });
});
