import {
  parseTargetContentMigrationOptions,
  TARGET_CONTENT_MIGRATION_HELP,
} from '../../../prisma/target-content-migration-options';

describe('target content migration options', () => {
  it('defaults to dry-run and supports no-connection help', () => {
    expect(parseTargetContentMigrationOptions([])).toEqual({
      apply: false,
      actorUserId: undefined,
      help: false,
    });
    expect(parseTargetContentMigrationOptions(['--help']).help).toBe(true);
    expect(parseTargetContentMigrationOptions(['-h']).help).toBe(true);
    expect(TARGET_CONTENT_MIGRATION_HELP).toContain('without connecting to external services');
  });

  it('requires an active actor identifier for apply', () => {
    expect(() => parseTargetContentMigrationOptions(['--apply'])).toThrow(
      '--apply requires --actor-user-id=<active-user-id>',
    );
    expect(parseTargetContentMigrationOptions(['--apply', '--actor-user-id=user-1'])).toEqual({
      apply: true,
      actorUserId: 'user-1',
      help: false,
    });
  });

  it('rejects unknown and empty arguments', () => {
    expect(() => parseTargetContentMigrationOptions(['--force'])).toThrow(
      'Unknown argument: --force',
    );
    expect(() => parseTargetContentMigrationOptions(['--actor-user-id='])).toThrow(
      '--actor-user-id must not be empty',
    );
  });
});
