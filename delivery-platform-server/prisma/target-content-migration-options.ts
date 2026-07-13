export interface TargetContentMigrationOptions {
  apply: boolean;
  verify: boolean;
  strict: boolean;
  actorUserId?: string;
  actorUsername?: string;
  help: boolean;
}

export const TARGET_CONTENT_MIGRATION_HELP = `Usage:
  pnpm prisma:migrate-target-content [options]

Default mode is DRY_RUN and performs no database or object-storage writes.

Options:
  --apply                         Persist target standards, knowledge, files and findings.
  --verify                        Read-only target content, relation and object-storage audit.
  --strict                        In DRY_RUN or VERIFY, exit non-zero on any ERROR finding.
                                  APPLY is always fail-closed, with or without --strict.
  --actor-user-id=<active-id>     With --apply, identifies the migration operator by ID.
  --actor-username=<username>     With --apply, identifies the migration operator by username.
  --help, -h                      Print this help without connecting to external services.

Safe rollout:
  1. Apply target schema migrations and run archive migration audit first.
  2. Run this command with --strict and review every finding and planned count.
  3. Configure MinIO; no file index is created before the referenced object is streamed and verified.
  4. Run with --apply and an active migration actor.
  5. Run --verify --strict; only then continue with the foundation strict verification.
`;

export function parseTargetContentMigrationOptions(
  args: readonly string[],
): TargetContentMigrationOptions {
  let apply = false;
  let verify = false;
  let strict = false;
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
    if (arg === '--strict') {
      strict = true;
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

  if (apply && verify) throw new Error('--apply and --verify are mutually exclusive');
  if (actorUserId && actorUsername) {
    throw new Error('--actor-user-id and --actor-username are mutually exclusive');
  }
  if (verify && (actorUserId || actorUsername)) {
    throw new Error('--verify does not accept a migration actor');
  }
  if (apply && !help && !actorUserId && !actorUsername) {
    throw new Error('--apply requires --actor-user-id or --actor-username');
  }
  return { apply, verify, strict, actorUserId, actorUsername, help };
}

export function targetContentErrorsAreBlocking(
  options: Pick<TargetContentMigrationOptions, 'apply' | 'strict'>,
  errorCount: number,
): boolean {
  return errorCount > 0 && (options.apply || options.strict);
}
