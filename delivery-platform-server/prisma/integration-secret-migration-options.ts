export interface IntegrationSecretMigrationOptions {
  apply: boolean;
  verify: boolean;
  actorUserId?: string;
  actorUsername?: string;
  help: boolean;
}

export const INTEGRATION_SECRET_MIGRATION_HELP = `Usage:
  pnpm prisma:migrate-integration-secrets [options]

Default mode is DRY_RUN and performs no writes.

Options:
  --apply                         Encrypt and persist target integration configuration.
  --verify                        Read-only strict check; require no plaintext or pending rewrite.
  --actor-user-id=<active-id>     Required with --apply unless --actor-username is used.
  --actor-username=<username>     Required with --apply unless --actor-user-id is used.
  --help, -h                      Print this help without connecting to the database.

Safe rollout:
  1. Configure one shared 32-byte Base64 INTEGRATION_SECRET_ENCRYPTION_KEY for API and workers.
  2. Run this command without --apply and review plaintextSecretRows and planned.
  3. Run with --apply and exactly one active migration actor.
  4. Run with --verify and require plaintextSecretRows and planned to be zero.
`;

export function parseIntegrationSecretMigrationOptions(
  args: readonly string[],
): IntegrationSecretMigrationOptions {
  let apply = false;
  let verify = false;
  let actorUserId: string | undefined;
  let actorUsername: string | undefined;
  let help = false;

  for (const arg of args) {
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--verify') {
      verify = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg.startsWith('--actor-user-id=')) {
      actorUserId = arg.slice('--actor-user-id='.length).trim();
      if (!actorUserId) throw new Error('--actor-user-id must not be empty');
      continue;
    }
    if (arg.startsWith('--actor-username=')) {
      actorUsername = arg.slice('--actor-username='.length).trim();
      if (!actorUsername) throw new Error('--actor-username must not be empty');
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (actorUserId && actorUsername) {
    throw new Error('Use only one of --actor-user-id or --actor-username');
  }
  if (apply && verify) {
    throw new Error('--apply and --verify are mutually exclusive');
  }
  if (apply && !help && !actorUserId && !actorUsername) {
    throw new Error('--apply requires an active --actor-user-id or --actor-username');
  }
  if (verify && (actorUserId || actorUsername)) {
    throw new Error('--verify does not accept a migration actor');
  }

  return { apply, verify, actorUserId, actorUsername, help };
}
