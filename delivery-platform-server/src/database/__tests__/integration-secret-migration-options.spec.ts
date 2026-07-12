import {
  INTEGRATION_SECRET_MIGRATION_HELP,
  parseIntegrationSecretMigrationOptions,
} from '../../../prisma/integration-secret-migration-options';

describe('integration secret migration options', () => {
  it('defaults to a read-only dry run', () => {
    expect(parseIntegrationSecretMigrationOptions([])).toEqual({
      apply: false,
      actorUserId: undefined,
      actorUsername: undefined,
      help: false,
    });
  });

  it('requires exactly one migration actor for apply', () => {
    expect(() => parseIntegrationSecretMigrationOptions(['--apply'])).toThrow(
      '--apply requires an active --actor-user-id or --actor-username',
    );
    expect(() =>
      parseIntegrationSecretMigrationOptions([
        '--apply',
        '--actor-user-id=user-1',
        '--actor-username=admin',
      ]),
    ).toThrow('Use only one of --actor-user-id or --actor-username');
    expect(parseIntegrationSecretMigrationOptions(['--apply', '--actor-user-id=user-1'])).toEqual({
      apply: true,
      actorUserId: 'user-1',
      actorUsername: undefined,
      help: false,
    });
  });

  it('supports help without apply or database access', () => {
    expect(parseIntegrationSecretMigrationOptions(['--help']).help).toBe(true);
    expect(parseIntegrationSecretMigrationOptions(['-h']).help).toBe(true);
    expect(INTEGRATION_SECRET_MIGRATION_HELP).toContain('Default mode is DRY_RUN');
  });

  it('rejects unknown or empty arguments', () => {
    expect(() => parseIntegrationSecretMigrationOptions(['--force'])).toThrow(
      'Unknown argument: --force',
    );
    expect(() => parseIntegrationSecretMigrationOptions(['--actor-user-id='])).toThrow(
      '--actor-user-id must not be empty',
    );
  });
});
