export interface TargetContentMigrationOptions {
  apply: boolean;
  actorUserId?: string;
  help: boolean;
}

export const TARGET_CONTENT_MIGRATION_HELP = `Usage:
  pnpm prisma:migrate-target-content [options]

Default mode is DRY_RUN and performs no database or object-storage writes.

Options:
  --apply                         Persist target standards, knowledge, files and findings.
  --actor-user-id=<active-id>     Required with --apply; identifies the migration operator.
  --help, -h                      Print this help without connecting to external services.

Safe rollout:
  1. Apply target schema migrations and run archive migration audit first.
  2. Run this command without --apply and review every finding and planned count.
  3. Configure MinIO only when legacy storage paths must be resolved.
  4. Run with --apply and an active migration actor.
  5. Re-run dry-run and the foundation migrator --verify --strict checks.
`;

export function parseTargetContentMigrationOptions(
  args: readonly string[],
): TargetContentMigrationOptions {
  let apply = false;
  let actorUserId: string | undefined;
  let help = false;

  for (const arg of args) {
    if (arg === '--apply') {
      apply = true;
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
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (apply && !help && !actorUserId) {
    throw new Error('--apply requires --actor-user-id=<active-user-id>');
  }
  return { apply, actorUserId, help };
}
