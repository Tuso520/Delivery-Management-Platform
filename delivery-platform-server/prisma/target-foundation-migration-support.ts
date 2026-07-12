import { v5 as uuidv5 } from 'uuid';

export const FOUNDATION_MIGRATION_NAMESPACE = '85708b5f-681d-4ef5-a377-6d9c7ab45560';

// Keep this namespace aligned with migrate-target-content.ts so legacy content
// approvals point at the exact StandardVersion/KnowledgeVersion rows created by
// that migration.
export const TARGET_CONTENT_MIGRATION_NAMESPACE = '4f06e048-f6fb-4df8-bb93-2571db0e6f45';

export const MIGRATION_SCOPES = ['projects', 'archive', 'reviews'] as const;
export type MigrationScope = (typeof MIGRATION_SCOPES)[number];

export const TARGET_PROJECT_LIFECYCLE_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
] as const;

export const TARGET_PROJECT_DELIVERY_STAGES = [
  'STARTUP',
  'DEEPENING',
  'PROCUREMENT',
  'CONSTRUCTION',
  'COMMISSIONING',
  'TESTING',
  'INTERNAL_ACCEPTANCE',
  'EXTERNAL_ACCEPTANCE',
  'WARRANTY',
] as const;

export interface MigrationOptions {
  apply: boolean;
  actorUserId?: string;
  help: boolean;
  scopes: ReadonlySet<MigrationScope>;
  strict: boolean;
  verify: boolean;
}

export const HELP_TEXT = `Usage:
  pnpm prisma:migrate-target-foundation [options]

Default mode is DRY_RUN and performs no writes.

Options:
  --apply                         Persist target rows and MigrationException records.
  --actor-user-id=<active-id>     Required with --apply; identifies the migration operator.
  --scope=projects,archive,reviews
                                  Limit phases (default: all phases).
  --strict                        Exit with code 2 when findings remain.
  --verify                        Read-only post-apply count/FK/relationship verification.
  --help, -h                      Print this help without connecting to the database.

Safe rollout:
  1. Deploy target schema migrations; never use db push or reset for this rollout.
  2. Run prisma:audit-archive-migration and review its hierarchy/storage findings.
  3. Run prisma:migrate-target-content first when Standard/Knowledge approvals exist.
  4. Run this command without --apply and review the JSON report.
  5. Resolve ERROR findings or accept them into the exception queue.
  6. Run with --apply and an active actor user id.
  7. Re-run with --verify --strict to validate counts and references read-only.
`;

export function parseMigrationOptions(args: readonly string[]): MigrationOptions {
  let apply = false;
  let actorUserId: string | undefined;
  let help = false;
  let strict = false;
  let verify = false;
  let scopes: ReadonlySet<MigrationScope> = new Set(MIGRATION_SCOPES);

  for (const arg of args) {
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--strict') {
      strict = true;
      continue;
    }
    if (arg === '--verify') {
      verify = true;
      continue;
    }
    if (arg.startsWith('--actor-user-id=')) {
      actorUserId = arg.slice('--actor-user-id='.length).trim();
      if (!actorUserId) {
        throw new Error('--actor-user-id must not be empty');
      }
      continue;
    }
    if (arg.startsWith('--scope=')) {
      const requested = arg
        .slice('--scope='.length)
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      if (requested.length === 0) {
        throw new Error('--scope must contain at least one migration phase');
      }
      const invalid = requested.filter(
        (value) => !(MIGRATION_SCOPES as readonly string[]).includes(value),
      );
      if (invalid.length > 0) {
        throw new Error(`Unknown migration scope: ${invalid.join(', ')}`);
      }
      scopes = new Set(requested as MigrationScope[]);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (apply && !actorUserId && !help) {
    throw new Error('--apply requires --actor-user-id=<active-user-id>');
  }
  if (apply && verify && !help) {
    throw new Error('--apply and --verify are mutually exclusive');
  }

  return { apply, actorUserId, help, scopes, strict, verify };
}

export function foundationId(seed: string): string {
  return uuidv5(seed, FOUNDATION_MIGRATION_NAMESPACE);
}

export function targetContentId(seed: string): string {
  return uuidv5(seed, TARGET_CONTENT_MIGRATION_NAMESPACE);
}

export function mapLegacyFileStatus(value: string): string {
  const normalized = value.trim().toUpperCase();
  const map: Record<string, string> = {
    DRAFT: 'DRAFT',
    UPLOADED: 'UPLOADED',
    REVIEWING: 'REVIEWING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    DEPRECATED: 'DEPRECATED',
    ARCHIVED: 'ARCHIVED',
  };
  return map[normalized] ?? 'UPLOADED';
}

export function mapLegacyDecision(value: string): 'APPROVED' | 'REJECTED' | null {
  const normalized = value.trim().toUpperCase();
  if (['APPROVED', 'APPROVE', 'PASS', 'PASSED'].includes(normalized)) {
    return 'APPROVED';
  }
  if (['REJECTED', 'REJECT', 'DENIED', 'DECLINED'].includes(normalized)) {
    return 'REJECTED';
  }
  return null;
}

export function legacyFolderKey(templateItemId: string): string {
  return `legacy-folder:${templateItemId}`;
}

export function legacyItemKey(templateItemId: string): string {
  return `legacy-item:${templateItemId}`;
}
