import {
  parseTargetContentMigrationOptions,
  targetContentErrorsAreBlocking,
  TARGET_CONTENT_MIGRATION_HELP,
} from '../../../prisma/target-content-migration-options';

describe('target content migration options', () => {
  it('defaults to dry-run and supports no-connection help', () => {
    expect(parseTargetContentMigrationOptions([])).toEqual({
      apply: false,
      verify: false,
      strict: false,
      actorUserId: undefined,
      actorUsername: undefined,
      help: false,
    });
    expect(parseTargetContentMigrationOptions(['--help']).help).toBe(true);
    expect(parseTargetContentMigrationOptions(['-h']).help).toBe(true);
    expect(TARGET_CONTENT_MIGRATION_HELP).toContain('without connecting to external services');
  });

  it('requires exactly one actor identifier for apply', () => {
    expect(() => parseTargetContentMigrationOptions(['--apply'])).toThrow(
      '--apply requires --actor-user-id or --actor-username',
    );
    expect(parseTargetContentMigrationOptions(['--apply', '--actor-user-id=user-1'])).toEqual({
      apply: true,
      verify: false,
      strict: false,
      actorUserId: 'user-1',
      actorUsername: undefined,
      help: false,
    });
    expect(parseTargetContentMigrationOptions(['--apply', '--actor-username=admin'])).toEqual({
      apply: true,
      verify: false,
      strict: false,
      actorUserId: undefined,
      actorUsername: 'admin',
      help: false,
    });
    expect(() =>
      parseTargetContentMigrationOptions([
        '--apply',
        '--actor-user-id=user-1',
        '--actor-username=admin',
      ]),
    ).toThrow('--actor-user-id and --actor-username are mutually exclusive');
  });

  it('supports strict dry-run and read-only verification', () => {
    expect(parseTargetContentMigrationOptions(['--strict'])).toEqual({
      apply: false,
      verify: false,
      strict: true,
      actorUserId: undefined,
      actorUsername: undefined,
      help: false,
    });
    expect(parseTargetContentMigrationOptions(['--verify', '--strict'])).toEqual({
      apply: false,
      verify: true,
      strict: true,
      actorUserId: undefined,
      actorUsername: undefined,
      help: false,
    });
    expect(() =>
      parseTargetContentMigrationOptions(['--apply', '--verify', '--actor-user-id=user-1']),
    ).toThrow('--apply and --verify are mutually exclusive');
    expect(() =>
      parseTargetContentMigrationOptions(['--verify', '--actor-user-id=user-1']),
    ).toThrow('--verify does not accept a migration actor');
    expect(() =>
      parseTargetContentMigrationOptions(['--verify', '--actor-username=admin']),
    ).toThrow('--verify does not accept a migration actor');
    expect(TARGET_CONTENT_MIGRATION_HELP).toContain(
      'In DRY_RUN or VERIFY, exit non-zero on any ERROR finding',
    );
  });

  it('makes strict dry-run and every apply fail closed on ERROR findings', () => {
    expect(targetContentErrorsAreBlocking({ apply: false, strict: true }, 1)).toBe(true);
    expect(targetContentErrorsAreBlocking({ apply: false, strict: false }, 1)).toBe(false);
    expect(targetContentErrorsAreBlocking({ apply: true, strict: false }, 1)).toBe(true);
    expect(targetContentErrorsAreBlocking({ apply: true, strict: true }, 1)).toBe(true);
    expect(targetContentErrorsAreBlocking({ apply: true, strict: true }, 0)).toBe(false);
    expect(
      parseTargetContentMigrationOptions(['--apply', '--strict', '--actor-username=admin']),
    ).toEqual({
      apply: true,
      verify: false,
      strict: true,
      actorUserId: undefined,
      actorUsername: 'admin',
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
    expect(() => parseTargetContentMigrationOptions(['--actor-username='])).toThrow(
      '--actor-username must not be empty',
    );
  });
});
