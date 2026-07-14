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

// These values were emitted by the retired demo approval seed. Keep the list
// exact: similarly named custom approval types must remain unmapped and block a
// strict migration until an explicit business decision is made.
export const LEGACY_DEMO_PROJECT_APPROVAL_TYPES = [
  'demo-approval-01',
  'demo-approval-02',
  'demo-approval-03',
  'demo-approval-04',
  'demo-approval-05',
  'demo-approval-06',
  'demo-approval-07',
  'demo-approval-08',
  'demo-approval-09',
  'demo-approval-10',
] as const;

const legacyDemoProjectApprovalTypeSet = new Set<string>(LEGACY_DEMO_PROJECT_APPROVAL_TYPES);

export function isLegacyDemoProjectApprovalType(value: string): boolean {
  return legacyDemoProjectApprovalTypeSet.has(value.trim());
}

export interface LegacyDemoProjectApprovalCancellationInput {
  businessType: string;
  normalizedStatus: string;
  projectExists: boolean;
  projectStatus: string | null;
  projectDeleted: boolean;
  projectArchived: boolean;
}

export function shouldCancelLegacyDemoProjectApproval(
  input: LegacyDemoProjectApprovalCancellationInput,
): boolean {
  return (
    isLegacyDemoProjectApprovalType(input.businessType) &&
    input.normalizedStatus === 'PENDING' &&
    input.projectExists &&
    (input.projectStatus !== 'DRAFT' || input.projectDeleted || input.projectArchived)
  );
}

export interface RetiredMissingKnowledgeFileUpdateApprovalInput {
  businessType: string;
  normalizedStatus: string;
  templateCode: string;
  sourceCount: number;
}

/**
 * Identifies only the retired knowledge attachment revision workflow whose
 * source Attachment is already absent. Any surviving or ambiguous source must
 * remain a blocking finding instead of being silently discarded.
 */
export function isKnownRetiredMissingKnowledgeFileUpdateApproval(
  input: RetiredMissingKnowledgeFileUpdateApprovalInput,
): boolean {
  return (
    input.businessType.trim() === 'knowledge-file-update' &&
    input.normalizedStatus === 'PENDING' &&
    input.templateCode.trim() === 'KNOWLEDGE_FILE_UPDATE' &&
    input.sourceCount === 0
  );
}

export interface EmptyArchiveSeedSnapshotFolder {
  id: string;
  sourceTemplateFolderId: string | null;
  sourceStableKey: string | null;
  archivedAt: Date | null;
}

export interface EmptyArchiveSeedSnapshotEntry {
  id: string;
  folderId: string;
  templateVersionId: string | null;
  sourceTemplateItemId: string | null;
  sourceStableKey: string | null;
  archivedAt: Date | null;
}

export interface EmptyArchiveSeedTemplateFolder {
  id: string;
  stableKey: string;
}

export interface EmptyArchiveSeedTemplateItem {
  id: string;
  folderId: string;
  stableKey: string;
}

export interface EmptyArchiveSeedSnapshotInput {
  archiveTemplateVersionId: string | null;
  archiveFileCount: number;
  projectFolders: readonly EmptyArchiveSeedSnapshotFolder[];
  projectEntries: readonly EmptyArchiveSeedSnapshotEntry[];
  templateFolders: readonly EmptyArchiveSeedTemplateFolder[];
  templateItems: readonly EmptyArchiveSeedTemplateItem[];
}

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

/**
 * Proves that a target project archive is only the deterministic empty seed
 * snapshot of its selected template version. This predicate is intentionally
 * exact because a false positive would replace real project archive data.
 */
export function isDeterministicEmptyArchiveSeedSnapshot(
  input: EmptyArchiveSeedSnapshotInput,
): boolean {
  const versionId = input.archiveTemplateVersionId?.trim();
  if (!versionId || input.archiveFileCount !== 0) return false;
  if (input.templateFolders.length === 0 || input.templateItems.length === 0) return false;
  if (
    input.projectFolders.length !== input.templateFolders.length ||
    input.projectEntries.length !== input.templateItems.length
  ) {
    return false;
  }
  if (
    !hasUniqueValues(input.templateFolders.map((folder) => folder.id)) ||
    !hasUniqueValues(input.templateFolders.map((folder) => folder.stableKey)) ||
    !hasUniqueValues(input.templateItems.map((item) => item.id)) ||
    !hasUniqueValues(input.templateItems.map((item) => item.stableKey)) ||
    !hasUniqueValues(input.projectFolders.map((folder) => folder.id)) ||
    !hasUniqueValues(
      input.projectFolders.flatMap((folder) =>
        folder.sourceTemplateFolderId ? [folder.sourceTemplateFolderId] : [],
      ),
    ) ||
    !hasUniqueValues(input.projectEntries.map((entry) => entry.id)) ||
    !hasUniqueValues(
      input.projectEntries.flatMap((entry) =>
        entry.sourceTemplateItemId ? [entry.sourceTemplateItemId] : [],
      ),
    )
  ) {
    return false;
  }

  const templateFolderById = new Map(input.templateFolders.map((folder) => [folder.id, folder]));
  const projectFolderById = new Map(input.projectFolders.map((folder) => [folder.id, folder]));
  const projectFolderBySourceId = new Map(
    input.projectFolders.flatMap((folder) =>
      folder.sourceTemplateFolderId ? [[folder.sourceTemplateFolderId, folder] as const] : [],
    ),
  );
  if (
    input.projectFolders.some((folder) => {
      if (folder.archivedAt !== null || !folder.sourceTemplateFolderId) return true;
      const source = templateFolderById.get(folder.sourceTemplateFolderId);
      return !source || folder.sourceStableKey !== source.stableKey;
    }) ||
    input.templateFolders.some((folder) => !projectFolderBySourceId.has(folder.id))
  ) {
    return false;
  }

  const templateItemById = new Map(input.templateItems.map((item) => [item.id, item]));
  if (
    input.projectEntries.some((entry) => {
      if (
        entry.archivedAt !== null ||
        entry.templateVersionId !== versionId ||
        !entry.sourceTemplateItemId
      ) {
        return true;
      }
      const source = templateItemById.get(entry.sourceTemplateItemId);
      const projectFolder = projectFolderById.get(entry.folderId);
      return (
        !source ||
        !projectFolder ||
        entry.sourceStableKey !== source.stableKey ||
        projectFolder.sourceTemplateFolderId !== source.folderId
      );
    }) ||
    input.templateItems.some(
      (item) =>
        !input.projectEntries.some((entry) => entry.sourceTemplateItemId === item.id) ||
        !templateFolderById.has(item.folderId),
    )
  ) {
    return false;
  }

  return true;
}

export interface MigrationOptions {
  apply: boolean;
  actorUserId?: string;
  actorUsername?: string;
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
  --actor-user-id=<active-id>     Required with --apply unless --actor-username is used.
  --actor-username=<username>     Required with --apply unless --actor-user-id is used.
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
  6. Run with --apply and exactly one active migration actor.
  7. Re-run with --verify --strict to validate counts and references read-only.
`;

export function parseMigrationOptions(args: readonly string[]): MigrationOptions {
  let apply = false;
  let actorUserId: string | undefined;
  let actorUsername: string | undefined;
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
    if (arg.startsWith('--actor-username=')) {
      actorUsername = arg.slice('--actor-username='.length).trim();
      if (!actorUsername) {
        throw new Error('--actor-username must not be empty');
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

  if (actorUserId && actorUsername) {
    throw new Error('Use only one of --actor-user-id or --actor-username');
  }
  if (apply && verify) {
    throw new Error('--apply and --verify are mutually exclusive');
  }
  if (apply && !actorUserId && !actorUsername && !help) {
    throw new Error('--apply requires an active --actor-user-id or --actor-username');
  }
  if (verify && (actorUserId || actorUsername)) {
    throw new Error('--verify does not accept a migration actor');
  }

  return { apply, actorUserId, actorUsername, help, scopes, strict, verify };
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
