import { Prisma, PrismaClient } from '@prisma/client';

import {
  HELP_TEXT,
  MigrationOptions,
  foundationId,
  legacyFolderKey,
  legacyItemKey,
  mapLegacyDecision,
  mapLegacyFileStatus,
  parseMigrationOptions,
  TARGET_PROJECT_DELIVERY_STAGES,
  TARGET_PROJECT_LIFECYCLE_STATUSES,
  targetContentId,
} from './target-foundation-migration-support';

type Severity = 'ERROR' | 'REVIEW';
type FindingDomain = 'PROJECT' | 'ARCHIVE' | 'FILE' | 'REVIEW';

interface Finding {
  severity: Severity;
  domain: FindingDomain;
  entityType: string;
  entityId: string;
  code: string;
  details: Prisma.InputJsonObject;
}

interface MigrationReport {
  mode: 'DRY_RUN' | 'VERIFY' | 'APPLY';
  actorUserId: string | null;
  scopes: string[];
  scanned: Record<string, number>;
  planned: Record<string, number>;
  writtenOrVerified: Record<string, number>;
  validation: Record<string, number>;
  targetCountsBefore: Record<string, number>;
  targetCountsAfter: Record<string, number>;
  findings: Finding[];
}

interface MigrationContext {
  expectedProjectIds: Set<string>;
  expectedFolderIds: Set<string>;
  expectedEntryIds: Set<string>;
  expectedProjectArchiveFileIds: Set<string>;
  expectedLogicalFileIds: Set<string>;
  expectedAssetIds: Set<string>;
  expectedFileVersionIds: Set<string>;
  expectedReviewTaskIds: Set<string>;
  entryIdByLegacyItemId: Map<string, string>;
  projectArchiveFileIdByLegacyFileId: Map<string, string>;
  fileVersionIdByLegacyFileId: Map<string, string>;
}

type LegacyArchiveItem = Prisma.ProjectArchiveItemGetPayload<{
  include: {
    templateItem: {
      select: {
        allowedFileTypes: true;
        needReview: true;
        responsibleRole: true;
        reviewRole: true;
      };
    };
    files: {
      include: { reviews: true };
    };
  };
}>;

type LegacyFile = LegacyArchiveItem['files'][number];

type LegacyApprovalTask = Prisma.ApprovalTaskGetPayload<{
  include: {
    actions: true;
    template: { include: { steps: true } };
  };
}>;

interface TargetReviewSource {
  sourceType: 'PROJECT_ARCHIVE' | 'ARCHIVE_TEMPLATE' | 'STANDARD' | 'KNOWLEDGE';
  sourceId: string;
  sourceVersionId: string | null;
  projectId: string | null;
  fileVersionId: string | null;
  exists: boolean;
  mapping: Prisma.InputJsonObject;
}

const report: MigrationReport = {
  mode: 'DRY_RUN',
  actorUserId: null,
  scopes: [],
  scanned: {},
  planned: {},
  writtenOrVerified: {},
  validation: {},
  targetCountsBefore: {},
  targetCountsAfter: {},
  findings: [],
};

const findingKeys = new Set<string>();
const context: MigrationContext = {
  expectedProjectIds: new Set(),
  expectedFolderIds: new Set(),
  expectedEntryIds: new Set(),
  expectedProjectArchiveFileIds: new Set(),
  expectedLogicalFileIds: new Set(),
  expectedAssetIds: new Set(),
  expectedFileVersionIds: new Set(),
  expectedReviewTaskIds: new Set(),
  entryIdByLegacyItemId: new Map(),
  projectArchiveFileIdByLegacyFileId: new Map(),
  fileVersionIdByLegacyFileId: new Map(),
};

function increment(target: Record<string, number>, key: string, amount = 1): void {
  target[key] = (target[key] ?? 0) + amount;
}

function addFinding(
  severity: Severity,
  domain: FindingDomain,
  entityType: string,
  entityId: string,
  code: string,
  details: Prisma.InputJsonObject,
): void {
  const key = `${domain}:${entityType}:${entityId}:${code}`;
  if (findingKeys.has(key)) return;
  findingKeys.add(key);
  report.findings.push({ severity, domain, entityType, entityId, code, details });
}

function dateJson(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
}

function parseLegacyExtensions(value: string | null): Prisma.InputJsonArray | undefined {
  if (!value?.trim()) return undefined;
  const extensions = value
    .split(/[;,|\s]+/)
    .map((item) => item.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean);
  return extensions.length > 0 ? [...new Set(extensions)] : undefined;
}

function archiveFileId(legacyArchiveItemId: string): string {
  return foundationId(`project-archive-file:legacy-item:${legacyArchiveItemId}`);
}

function logicalFileId(legacyArchiveItemId: string): string {
  return foundationId(`logical-file:legacy-archive-item:${legacyArchiveItemId}`);
}

function assetId(legacyFileId: string): string {
  return foundationId(`file-asset:legacy-file:${legacyFileId}`);
}

function fileVersionId(legacyFileId: string): string {
  return foundationId(`file-version:legacy-file:${legacyFileId}`);
}

function projectArchiveFileStatus(file: LegacyFile): string {
  return file.deletedAt ? 'ARCHIVED' : mapLegacyFileStatus(file.fileStatus);
}

function legacyFileArchivedAt(file: LegacyFile): Date | null {
  return (
    file.deletedAt ?? (mapLegacyFileStatus(file.fileStatus) === 'ARCHIVED' ? file.updatedAt : null)
  );
}

function isActiveLegacyFile(file: LegacyFile): boolean {
  return legacyFileArchivedAt(file) === null;
}

async function assertActor(prisma: PrismaClient, actorUserId: string): Promise<void> {
  const actor = await prisma.user.findFirst({
    where: { id: actorUserId, status: 'Active', deletedAt: null },
    select: { id: true },
  });
  if (!actor) {
    throw new Error('Migration actor does not exist or is not active');
  }
}

async function collectTargetCounts(prisma: PrismaClient): Promise<Record<string, number>> {
  const [
    projectArchiveFolders,
    projectArchiveEntries,
    projectArchiveFiles,
    logicalFiles,
    fileAssets,
    fileVersions,
    reviewTasks,
    reviewSteps,
    reviewAssignees,
    reviewActionEvents,
  ] = await Promise.all([
    prisma.projectArchiveFolder.count(),
    prisma.projectArchiveEntry.count(),
    prisma.projectArchiveFile.count(),
    prisma.logicalFile.count(),
    prisma.fileAsset.count(),
    prisma.fileVersion.count(),
    prisma.reviewTask.count(),
    prisma.reviewStep.count(),
    prisma.reviewAssignee.count(),
    prisma.reviewActionEvent.count(),
  ]);
  return {
    projectArchiveFolders,
    projectArchiveEntries,
    projectArchiveFiles,
    logicalFiles,
    fileAssets,
    fileVersions,
    reviewTasks,
    reviewSteps,
    reviewAssignees,
    reviewActionEvents,
  };
}

async function migrateProjectState(
  prisma: PrismaClient,
  options: MigrationOptions,
): Promise<void> {
  // Project state is finalized by migration 20260712094000. This step validates
  // the single target model and keeps the foundation migrator usable for
  // archive/file/review history without resurrecting removed legacy fields.
  void options;
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      status: true,
      currentStage: true,
    },
    orderBy: { id: 'asc' },
  });
  report.scanned.projects = projects.length;

  const lifecycleStatuses = new Set<string>(TARGET_PROJECT_LIFECYCLE_STATUSES);
  const deliveryStages = new Set<string>(TARGET_PROJECT_DELIVERY_STAGES);
  for (const project of projects) {
    if (!lifecycleStatuses.has(project.status)) {
      addFinding('ERROR', 'PROJECT', 'Project', project.id, 'INVALID_TARGET_PROJECT_STATUS', {
        status: project.status,
      });
    }
    if (!deliveryStages.has(project.currentStage)) {
      addFinding('ERROR', 'PROJECT', 'Project', project.id, 'INVALID_TARGET_PROJECT_STAGE', {
        currentStage: project.currentStage,
      });
    }
    context.expectedProjectIds.add(project.id);
    increment(report.planned, 'projectStateRows');
    increment(report.writtenOrVerified, 'projectStateRows');
  }
}
function validateLegacyArchiveHierarchy(items: LegacyArchiveItem[]): boolean {
  const byId = new Map(items.map((item) => [item.id, item]));
  let valid = true;
  for (const item of items) {
    if (!item.parentId) continue;
    const parent = byId.get(item.parentId);
    if (!parent) {
      valid = false;
      addFinding('ERROR', 'ARCHIVE', 'ProjectArchiveItem', item.id, 'ORPHAN_PARENT', {
        parentId: item.parentId,
      });
      continue;
    }
    if (parent.projectId !== item.projectId) {
      valid = false;
      addFinding('ERROR', 'ARCHIVE', 'ProjectArchiveItem', item.id, 'CROSS_PROJECT_PARENT', {
        parentId: parent.id,
        parentProjectId: parent.projectId,
      });
    }
    if (parent.parentId) {
      valid = false;
      addFinding('ERROR', 'ARCHIVE', 'ProjectArchiveItem', item.id, 'DEPTH_EXCEEDS_TWO', {
        parentId: parent.id,
        grandparentId: parent.parentId,
      });
    }
  }
  return valid;
}

function recordLegacyItemMetadata(item: LegacyArchiveItem): void {
  const activeFiles = item.files.filter(isActiveLegacyFile);
  const statusNeedsSnapshot =
    activeFiles.length === 0 && !['NotStarted', 'PendingUpload'].includes(item.status);
  if (!item.dueDate && !item.completedAt && !statusNeedsSnapshot) return;
  addFinding(
    'REVIEW',
    'ARCHIVE',
    'ProjectArchiveItem',
    item.id,
    'LEGACY_ITEM_METADATA_REQUIRES_RECONCILIATION',
    {
      legacyStatus: item.status,
      dueDate: dateJson(item.dueDate),
      completedAt: dateJson(item.completedAt),
      activeFileCount: activeFiles.length,
      note: '目标档案项不保存旧状态/截止时间；原表保留，元数据同时登记迁移异常。',
    },
  );
}

async function migrateArchiveStructure(
  prisma: PrismaClient,
  options: MigrationOptions,
): Promise<LegacyArchiveItem[]> {
  const items = await prisma.projectArchiveItem.findMany({
    include: {
      templateItem: {
        select: {
          allowedFileTypes: true,
          needReview: true,
          responsibleRole: true,
          reviewRole: true,
        },
      },
      files: {
        include: { reviews: true },
        orderBy: [{ uploadTime: 'asc' }, { id: 'asc' }],
      },
    },
    orderBy: [{ projectId: 'asc' }, { stageCode: 'asc' }, { sortOrder: 'asc' }, { itemNo: 'asc' }],
  });
  const unassignedFiles = await prisma.file.findMany({
    where: { archiveItemId: null },
    select: {
      id: true,
      projectId: true,
      fileStatus: true,
      versionNo: true,
      deletedAt: true,
    },
    orderBy: { id: 'asc' },
  });
  report.scanned.projectArchiveItems = items.length;
  report.scanned.legacyArchiveFiles = items.reduce((sum, item) => sum + item.files.length, 0);
  report.scanned.unassignedLegacyFiles = unassignedFiles.length;
  report.scanned.legacyFiles = report.scanned.legacyArchiveFiles + unassignedFiles.length;
  for (const item of items) recordLegacyItemMetadata(item);
  for (const file of unassignedFiles) {
    addFinding('ERROR', 'FILE', 'File', file.id, 'LEGACY_FILE_WITHOUT_ARCHIVE_ITEM', {
      projectId: file.projectId,
      legacyStatus: file.fileStatus,
      legacyVersion: file.versionNo,
      deletedAt: dateJson(file.deletedAt),
      note: '目标 ProjectArchiveFile 必须关联档案项，不能自动猜测归属。',
    });
  }

  const roleRows = await prisma.role.findMany({
    select: { id: true, roleCode: true },
  });
  const roleIdByCode = new Map(roleRows.map((role) => [role.roleCode, role.id]));
  const projectArchiveReviewTemplates = await prisma.approvalTemplate.findMany({
    where: {
      businessType: 'PROJECT_ARCHIVE_FILE',
      isEnabled: true,
      deletedAt: null,
    },
    select: {
      id: true,
      countryCode: true,
      steps: { select: { id: true }, take: 1 },
    },
    orderBy: [{ countryCode: 'desc' }, { updatedAt: 'desc' }],
  });
  const itemsByProject = new Map<string, LegacyArchiveItem[]>();
  for (const item of items) {
    const projectItems = itemsByProject.get(item.projectId) ?? [];
    projectItems.push(item);
    itemsByProject.set(item.projectId, projectItems);
  }

  for (const [projectId, projectItems] of itemsByProject) {
    if (!validateLegacyArchiveHierarchy(projectItems)) continue;

    const [project, existingFolders, existingEntries] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: { archiveTemplateVersionId: true, countryCode: true },
      }),
      prisma.projectArchiveFolder.findMany({
        where: { projectId },
        select: { id: true, sourceStableKey: true },
      }),
      prisma.projectArchiveEntry.findMany({
        where: { projectId },
        select: {
          id: true,
          folderId: true,
          sourceStableKey: true,
          templateVersionId: true,
          approvalTemplateId: true,
        },
      }),
    ]);
    if (!project) {
      addFinding('ERROR', 'ARCHIVE', 'Project', projectId, 'ORPHAN_ARCHIVE_PROJECT', {});
      continue;
    }

    const hasVersionedTarget =
      Boolean(project.archiveTemplateVersionId) &&
      (existingFolders.some((folder) => !folder.sourceStableKey?.startsWith('legacy-folder:')) ||
        existingEntries.some((entry) => Boolean(entry.templateVersionId)));
    if (hasVersionedTarget) {
      addFinding(
        'ERROR',
        'ARCHIVE',
        'Project',
        projectId,
        'TARGET_VERSIONED_ARCHIVE_ALREADY_EXISTS',
        {
          archiveTemplateVersionId: project.archiveTemplateVersionId,
          legacyItemCount: projectItems.length,
          targetFolderCount: existingFolders.length,
          note: '不能自动判定两套快照等价，已跳过该项目。',
        },
      );
      continue;
    }

    const byId = new Map(projectItems.map((item) => [item.id, item]));
    const childrenByParent = new Map<string, LegacyArchiveItem[]>();
    for (const item of projectItems) {
      if (!item.parentId) continue;
      const children = childrenByParent.get(item.parentId) ?? [];
      children.push(item);
      childrenByParent.set(item.parentId, children);
    }
    const roots = projectItems.filter((item) => item.parentId === null);
    if (roots.length === 0) {
      addFinding('ERROR', 'ARCHIVE', 'Project', projectId, 'NO_ROOT_ARCHIVE_ITEMS', {
        itemCount: projectItems.length,
      });
      continue;
    }

    const folderKeyCounts = new Map<string, number>();
    const entryKeyCounts = new Map<string, number>();
    for (const root of roots) {
      const folderKey = legacyFolderKey(root.templateItemId);
      folderKeyCounts.set(folderKey, (folderKeyCounts.get(folderKey) ?? 0) + 1);
      const children = childrenByParent.get(root.id) ?? [];
      const leaves = children.length > 0 ? [...children] : [root];
      if (children.length > 0 && root.files.length > 0) leaves.push(root);
      for (const leaf of leaves) {
        const entryKey = legacyItemKey(leaf.templateItemId);
        entryKeyCounts.set(entryKey, (entryKeyCounts.get(entryKey) ?? 0) + 1);
      }
    }
    const duplicateFolderKeys = [...folderKeyCounts]
      .filter(([, count]) => count > 1)
      .map(([key]) => key);
    const duplicateEntryKeys = [...entryKeyCounts]
      .filter(([, count]) => count > 1)
      .map(([key]) => key);
    if (duplicateFolderKeys.length > 0 || duplicateEntryKeys.length > 0) {
      addFinding('ERROR', 'ARCHIVE', 'Project', projectId, 'DUPLICATE_LEGACY_STABLE_KEYS', {
        duplicateFolderKeys,
        duplicateEntryKeys,
      });
      continue;
    }

    let projectStructureValid = true;
    const plannedFolders: Array<{
      id: string;
      root: LegacyArchiveItem;
      sourceStableKey: string;
    }> = [];
    const plannedEntries: Array<{
      id: string;
      folderId: string;
      item: LegacyArchiveItem;
      root: LegacyArchiveItem;
      sourceStableKey: string;
      approvalTemplateId: string | null;
    }> = [];

    for (const root of roots) {
      const sourceStableKey = legacyFolderKey(root.templateItemId);
      const matchingFolders = existingFolders.filter(
        (folder) => folder.sourceStableKey === sourceStableKey,
      );
      if (matchingFolders.length > 1) {
        projectStructureValid = false;
        addFinding('ERROR', 'ARCHIVE', 'ProjectArchiveFolder', root.id, 'AMBIGUOUS_TARGET_FOLDER', {
          projectId,
          sourceStableKey,
          targetIds: matchingFolders.map((item) => item.id),
        });
        continue;
      }
      const targetFolderId =
        matchingFolders[0]?.id ?? foundationId(`project-archive-folder:${projectId}:${root.id}`);
      plannedFolders.push({
        id: targetFolderId,
        root,
        sourceStableKey,
      });

      const children = childrenByParent.get(root.id) ?? [];
      const leaves = children.length > 0 ? [...children] : [root];
      if (children.length > 0 && root.files.length > 0) {
        leaves.push(root);
        addFinding(
          'REVIEW',
          'ARCHIVE',
          'ProjectArchiveItem',
          root.id,
          'FOLDER_WITH_DIRECT_FILES_MAPPED_TO_SYNTHETIC_ITEM',
          { childCount: children.length, fileCount: root.files.length },
        );
      }
      for (const item of leaves) {
        if (!byId.has(item.id)) continue;
        const entryKey = legacyItemKey(item.templateItemId);
        const matchingEntries = existingEntries.filter(
          (entry) => entry.sourceStableKey === entryKey,
        );
        if (matchingEntries.length > 1) {
          projectStructureValid = false;
          addFinding('ERROR', 'ARCHIVE', 'ProjectArchiveEntry', item.id, 'AMBIGUOUS_TARGET_ENTRY', {
            projectId,
            sourceStableKey: entryKey,
            targetIds: matchingEntries.map((entry) => entry.id),
          });
          continue;
        }
        if (matchingEntries[0] && matchingEntries[0].folderId !== targetFolderId) {
          projectStructureValid = false;
          addFinding(
            'ERROR',
            'ARCHIVE',
            'ProjectArchiveEntry',
            item.id,
            'TARGET_ENTRY_FOLDER_CONFLICT',
            {
              expectedFolderId: targetFolderId,
              existingFolderId: matchingEntries[0].folderId,
              targetEntryId: matchingEntries[0].id,
            },
          );
          continue;
        }
        const reviewRequired = item.needReview || root.needReview || item.templateItem.needReview;
        let approvalTemplateId = matchingEntries[0]?.approvalTemplateId ?? null;
        if (
          reviewRequired &&
          approvalTemplateId &&
          !projectArchiveReviewTemplates.some(
            (template) => template.id === approvalTemplateId && template.steps.length > 0,
          )
        ) {
          addFinding(
            'ERROR',
            'ARCHIVE',
            'ProjectArchiveEntry',
            matchingEntries[0]?.id ?? item.id,
            'EXISTING_TARGET_APPROVAL_TEMPLATE_INVALID',
            { approvalTemplateId },
          );
        }
        if (reviewRequired && !approvalTemplateId) {
          const exactCountry = projectArchiveReviewTemplates.filter(
            (template) => template.countryCode === project.countryCode && template.steps.length > 0,
          );
          const global = projectArchiveReviewTemplates.filter(
            (template) => template.countryCode === null && template.steps.length > 0,
          );
          const candidates = exactCountry.length > 0 ? exactCountry : global;
          if (candidates.length === 1) {
            approvalTemplateId = candidates[0].id;
          } else {
            addFinding(
              'ERROR',
              'ARCHIVE',
              'ProjectArchiveItem',
              item.id,
              candidates.length === 0
                ? 'REVIEW_REQUIRED_WITHOUT_TARGET_APPROVAL_TEMPLATE'
                : 'AMBIGUOUS_TARGET_APPROVAL_TEMPLATE',
              {
                projectId,
                countryCode: project.countryCode,
                legacyReviewUserId: item.reviewUserId,
                legacyReviewRole: item.templateItem.reviewRole,
                candidateTemplateIds: candidates.map((candidate) => candidate.id),
                note: '未猜测审核配置；档案项保留但上传审核前必须人工配置。',
              },
            );
          }
        }
        if (!reviewRequired && item.reviewUserId) {
          addFinding(
            'REVIEW',
            'ARCHIVE',
            'ProjectArchiveItem',
            item.id,
            'LEGACY_REVIEWER_HINT_WITHOUT_REVIEW_REQUIREMENT',
            { legacyReviewUserId: item.reviewUserId },
          );
        }
        plannedEntries.push({
          id:
            matchingEntries[0]?.id ?? foundationId(`project-archive-entry:${projectId}:${item.id}`),
          folderId: targetFolderId,
          item,
          root,
          sourceStableKey: entryKey,
          approvalTemplateId,
        });
      }
    }

    if (!projectStructureValid) continue;

    increment(report.planned, 'projectArchiveFolders', plannedFolders.length);
    increment(report.planned, 'projectArchiveEntries', plannedEntries.length);
    for (const folder of plannedFolders) context.expectedFolderIds.add(folder.id);
    for (const entry of plannedEntries) {
      const roleCode =
        entry.item.templateItem.responsibleRole ?? entry.root.templateItem.responsibleRole;
      if (roleCode && !roleIdByCode.has(roleCode)) {
        addFinding(
          'REVIEW',
          'ARCHIVE',
          'ProjectArchiveItem',
          entry.item.id,
          'LEGACY_OWNER_ROLE_NOT_RESOLVED',
          { legacyRoleCode: roleCode },
        );
      }
      context.expectedEntryIds.add(entry.id);
      context.entryIdByLegacyItemId.set(entry.item.id, entry.id);
    }

    if (options.apply) {
      await prisma.$transaction(async (tx) => {
        for (const folder of plannedFolders) {
          await tx.projectArchiveFolder.upsert({
            where: { id: folder.id },
            create: {
              id: folder.id,
              projectId,
              name: folder.root.name,
              description: folder.root.usageDescription,
              sortOrder: folder.root.sortOrder,
              sourceTemplateFolderId: null,
              sourceStableKey: folder.sourceStableKey,
              isTemporary: false,
              archivedAt:
                folder.root.status === 'Archived'
                  ? (folder.root.completedAt ?? folder.root.updatedAt)
                  : null,
              createdAt: folder.root.createdAt,
              updatedAt: folder.root.updatedAt,
            },
            update: {},
          });
        }
        for (const entry of plannedEntries) {
          const roleCode =
            entry.item.templateItem.responsibleRole ?? entry.root.templateItem.responsibleRole;
          await tx.projectArchiveEntry.upsert({
            where: { id: entry.id },
            create: {
              id: entry.id,
              projectId,
              folderId: entry.folderId,
              templateVersionId: null,
              sourceTemplateItemId: null,
              sourceStableKey: entry.sourceStableKey,
              name: entry.item.secondName ?? entry.item.name,
              description: entry.item.usageDescription,
              required: entry.item.isRequired,
              reviewRequired:
                entry.item.needReview ||
                entry.root.needReview ||
                entry.item.templateItem.needReview,
              approvalTemplateId: entry.approvalTemplateId,
              ownerUserId: entry.item.responsibleUserId ?? entry.root.responsibleUserId,
              ownerRoleId: roleCode ? (roleIdByCode.get(roleCode) ?? null) : null,
              allowMultipleFiles: false,
              allowedExtensions: parseLegacyExtensions(entry.item.templateItem.allowedFileTypes),
              maxFileSize: null,
              namingRule: null,
              sortOrder: entry.item.sortOrder,
              isTemporary: false,
              archivedAt:
                entry.item.status === 'Archived'
                  ? (entry.item.completedAt ?? entry.item.updatedAt)
                  : null,
              createdAt: entry.item.createdAt,
              updatedAt: entry.item.updatedAt,
            },
            update: {},
          });
        }
      });
    }
    increment(report.writtenOrVerified, 'projectArchiveFolders', plannedFolders.length);
    increment(report.writtenOrVerified, 'projectArchiveEntries', plannedEntries.length);
  }

  return items;
}

function latestDate(values: Array<Date | null | undefined>): Date | null {
  const dates = values.filter((value): value is Date => Boolean(value));
  if (dates.length === 0) return null;
  return dates.reduce((latest, value) => (value > latest ? value : latest));
}

function latestApprovedReviewTime(file: LegacyFile): Date | null {
  return latestDate(
    file.reviews
      .filter((review) => mapLegacyDecision(review.reviewStatus) === 'APPROVED')
      .map((review) => review.reviewTime),
  );
}

function sortLegacyFiles(files: LegacyFile[]): LegacyFile[] {
  return [...files].sort((left, right) => {
    const time = left.uploadTime.getTime() - right.uploadTime.getTime();
    if (time !== 0) return time;
    return left.id.localeCompare(right.id);
  });
}

async function migrateArchiveFiles(
  prisma: PrismaClient,
  options: MigrationOptions,
  items: LegacyArchiveItem[],
): Promise<void> {
  const targetAssets = await prisma.fileAsset.findMany({
    select: {
      id: true,
      ownerType: true,
      ownerId: true,
      storageBucket: true,
      storageKey: true,
      size: true,
      mimeType: true,
      originalName: true,
    },
  });
  const assetByLocation = new Map(
    targetAssets.map((asset) => [`${asset.storageBucket}\u0000${asset.storageKey}`, asset]),
  );
  const assetById = new Map(targetAssets.map((asset) => [asset.id, asset]));

  for (const item of items) {
    if (item.files.length === 0) continue;
    const targetEntryId = context.entryIdByLegacyItemId.get(item.id);
    if (!targetEntryId) {
      addFinding(
        'ERROR',
        'FILE',
        'ProjectArchiveItem',
        item.id,
        'TARGET_ARCHIVE_ENTRY_NOT_PLANNED',
        { projectId: item.projectId, legacyFileCount: item.files.length },
      );
      continue;
    }

    const files = sortLegacyFiles(item.files);
    const currentCandidates = files.filter((file) => file.isCurrent && isActiveLegacyFile(file));
    if (currentCandidates.length > 1) {
      addFinding('ERROR', 'FILE', 'LogicalFileCandidate', item.id, 'MULTIPLE_CURRENT_FILES', {
        fileIds: currentCandidates.map((file) => file.id),
      });
      continue;
    }

    const versions = new Map<string, string[]>();
    for (const file of files) {
      const key = file.versionNo.trim().toLowerCase();
      const ids = versions.get(key) ?? [];
      ids.push(file.id);
      versions.set(key, ids);
    }
    const duplicateVersions = [...versions]
      .filter(([, ids]) => ids.length > 1)
      .map(([version, ids]) => ({ version, fileIds: ids }));
    if (duplicateVersions.length > 0) {
      addFinding('ERROR', 'FILE', 'LogicalFileCandidate', item.id, 'DUPLICATE_LEGACY_VERSION', {
        duplicates: duplicateVersions,
      });
      continue;
    }
    const invalidStorage = files.filter(
      (file) => !file.storageBucket.trim() || !file.storagePath.trim(),
    );
    if (invalidStorage.length > 0) {
      addFinding('ERROR', 'FILE', 'LogicalFileCandidate', item.id, 'MISSING_STORAGE_LOCATION', {
        fileIds: invalidStorage.map((file) => file.id),
      });
      continue;
    }
    const mismatchedReviews = files.flatMap((file) =>
      file.reviews.filter((review) => review.archiveItemId !== item.id).map((review) => review.id),
    );
    if (mismatchedReviews.length > 0) {
      addFinding(
        'ERROR',
        'FILE',
        'LogicalFileCandidate',
        item.id,
        'FILE_REVIEW_ARCHIVE_ITEM_MISMATCH',
        { reviewIds: mismatchedReviews },
      );
      continue;
    }

    const targetArchiveFileId = archiveFileId(item.id);
    const targetLogicalFileId = logicalFileId(item.id);
    const deterministicVersionIds = files.map((file) => fileVersionId(file.id));
    const [
      existingArchiveFiles,
      existingArchiveFileById,
      existingLogicalFile,
      existingVersionsById,
    ] = await Promise.all([
      prisma.projectArchiveFile.findMany({
        where: { archiveItemId: targetEntryId },
        select: { id: true, logicalFileId: true },
      }),
      prisma.projectArchiveFile.findUnique({
        where: { id: targetArchiveFileId },
        select: { id: true, projectId: true, archiveItemId: true, logicalFileId: true },
      }),
      prisma.logicalFile.findUnique({
        where: { id: targetLogicalFileId },
        select: {
          id: true,
          ownerType: true,
          ownerId: true,
          currentVersionId: true,
          versions: {
            select: {
              id: true,
              version: true,
              versionSequence: true,
              assetId: true,
              asset: {
                select: { storageBucket: true, storageKey: true },
              },
            },
          },
        },
      }),
      prisma.fileVersion.findMany({
        where: { id: { in: deterministicVersionIds } },
        select: {
          id: true,
          logicalFileId: true,
          version: true,
          versionSequence: true,
          assetId: true,
        },
      }),
    ]);
    const conflictingArchiveFiles = existingArchiveFiles.filter(
      (file) => file.id !== targetArchiveFileId || file.logicalFileId !== targetLogicalFileId,
    );
    if (conflictingArchiveFiles.length > 0 || existingArchiveFiles.length > 1) {
      addFinding(
        'ERROR',
        'FILE',
        'ProjectArchiveEntry',
        targetEntryId,
        'TARGET_ARCHIVE_FILE_CONFLICT',
        {
          expectedProjectArchiveFileId: targetArchiveFileId,
          expectedLogicalFileId: targetLogicalFileId,
          existing: existingArchiveFiles.map((file) => ({
            id: file.id,
            logicalFileId: file.logicalFileId,
          })),
        },
      );
      continue;
    }
    if (
      existingArchiveFileById &&
      (existingArchiveFileById.projectId !== item.projectId ||
        existingArchiveFileById.archiveItemId !== targetEntryId ||
        existingArchiveFileById.logicalFileId !== targetLogicalFileId)
    ) {
      addFinding(
        'ERROR',
        'FILE',
        'ProjectArchiveFile',
        targetArchiveFileId,
        'DETERMINISTIC_TARGET_ID_CONFLICT',
        {
          expectedProjectId: item.projectId,
          expectedArchiveItemId: targetEntryId,
          expectedLogicalFileId: targetLogicalFileId,
          existingProjectId: existingArchiveFileById.projectId,
          existingArchiveItemId: existingArchiveFileById.archiveItemId,
          existingLogicalFileId: existingArchiveFileById.logicalFileId,
        },
      );
      continue;
    }
    if (
      existingLogicalFile &&
      (existingLogicalFile.ownerType !== 'PROJECT_ARCHIVE' ||
        existingLogicalFile.ownerId !== targetEntryId)
    ) {
      addFinding(
        'ERROR',
        'FILE',
        'LogicalFile',
        targetLogicalFileId,
        'TARGET_LOGICAL_FILE_OWNER_CONFLICT',
        {
          expectedOwnerType: 'PROJECT_ARCHIVE',
          expectedOwnerId: targetEntryId,
          existingOwnerType: existingLogicalFile.ownerType,
          existingOwnerId: existingLogicalFile.ownerId,
        },
      );
      continue;
    }

    let groupValid = true;
    const plannedAssets = new Map<string, { id: string; existing: boolean; file: LegacyFile }>();
    const plannedVersions = files.map((file, index) => {
      const locationKey = `${file.storageBucket}\u0000${file.storagePath}`;
      const existingAsset = assetByLocation.get(locationKey);
      const alreadyPlanned = plannedAssets.get(locationKey);
      const deterministicAssetId = assetId(file.id);
      const existingAssetById = assetById.get(deterministicAssetId);
      if (
        existingAsset &&
        (existingAsset.size !== file.fileSize || existingAsset.mimeType !== file.mimeType)
      ) {
        groupValid = false;
        addFinding('ERROR', 'FILE', 'File', file.id, 'TARGET_ASSET_METADATA_CONFLICT', {
          storageBucket: file.storageBucket,
          storageKey: file.storagePath,
          legacySize: file.fileSize.toString(),
          targetSize: existingAsset.size.toString(),
          legacyMimeType: file.mimeType,
          targetMimeType: existingAsset.mimeType,
          targetAssetId: existingAsset.id,
        });
      }
      if (
        existingAsset &&
        (existingAsset.ownerType !== 'PROJECT_ARCHIVE' || existingAsset.ownerId !== targetEntryId)
      ) {
        groupValid = false;
        addFinding('ERROR', 'FILE', 'File', file.id, 'TARGET_ASSET_OWNER_CONFLICT', {
          targetAssetId: existingAsset.id,
          expectedOwnerType: 'PROJECT_ARCHIVE',
          expectedOwnerId: targetEntryId,
          existingOwnerType: existingAsset.ownerType,
          existingOwnerId: existingAsset.ownerId,
        });
      }
      if (
        !existingAsset &&
        existingAssetById &&
        (existingAssetById.storageBucket !== file.storageBucket ||
          existingAssetById.storageKey !== file.storagePath)
      ) {
        groupValid = false;
        addFinding(
          'ERROR',
          'FILE',
          'FileAsset',
          deterministicAssetId,
          'DETERMINISTIC_TARGET_ID_CONFLICT',
          {
            legacyFileId: file.id,
            expectedStorageBucket: file.storageBucket,
            expectedStorageKey: file.storagePath,
            existingStorageBucket: existingAssetById.storageBucket,
            existingStorageKey: existingAssetById.storageKey,
          },
        );
      }
      if (
        alreadyPlanned &&
        (alreadyPlanned.file.fileSize !== file.fileSize ||
          alreadyPlanned.file.mimeType !== file.mimeType)
      ) {
        groupValid = false;
        addFinding('ERROR', 'FILE', 'File', file.id, 'LEGACY_STORAGE_OBJECT_METADATA_CONFLICT', {
          storageBucket: file.storageBucket,
          storageKey: file.storagePath,
          firstLegacyFileId: alreadyPlanned.file.id,
          firstSize: alreadyPlanned.file.fileSize.toString(),
          currentSize: file.fileSize.toString(),
          firstMimeType: alreadyPlanned.file.mimeType,
          currentMimeType: file.mimeType,
        });
      }
      const targetAssetId = alreadyPlanned?.id ?? existingAsset?.id ?? deterministicAssetId;
      if (!alreadyPlanned) {
        plannedAssets.set(locationKey, {
          id: targetAssetId,
          existing: Boolean(existingAsset),
          file,
        });
      }
      const targetVersionId = fileVersionId(file.id);
      const globalVersionById = existingVersionsById.find(
        (version) => version.id === targetVersionId,
      );
      const conflictingById = existingLogicalFile?.versions.find(
        (version) => version.id === targetVersionId,
      );
      const conflictingByVersion = existingLogicalFile?.versions.find(
        (version) =>
          version.version.toLowerCase() === file.versionNo.toLowerCase() &&
          version.id !== targetVersionId,
      );
      const conflictingBySequence = existingLogicalFile?.versions.find(
        (version) => version.versionSequence === index + 1 && version.id !== targetVersionId,
      );
      if (
        globalVersionById &&
        (globalVersionById.logicalFileId !== targetLogicalFileId ||
          globalVersionById.version.toLowerCase() !== file.versionNo.toLowerCase() ||
          globalVersionById.versionSequence !== index + 1 ||
          globalVersionById.assetId !== targetAssetId)
      ) {
        groupValid = false;
        addFinding(
          'ERROR',
          'FILE',
          'FileVersion',
          targetVersionId,
          'DETERMINISTIC_TARGET_ID_CONFLICT',
          {
            legacyFileId: file.id,
            expectedLogicalFileId: targetLogicalFileId,
            existingLogicalFileId: globalVersionById.logicalFileId,
          },
        );
      }
      if (
        conflictingById &&
        (conflictingById.version.toLowerCase() !== file.versionNo.toLowerCase() ||
          conflictingById.versionSequence !== index + 1 ||
          conflictingById.assetId !== targetAssetId)
      ) {
        groupValid = false;
        addFinding(
          'ERROR',
          'FILE',
          'FileVersion',
          targetVersionId,
          'TARGET_FILE_VERSION_CONTENT_CONFLICT',
          { legacyFileId: file.id },
        );
      }
      if (conflictingByVersion || conflictingBySequence) {
        groupValid = false;
        addFinding(
          'ERROR',
          'FILE',
          'FileVersion',
          targetVersionId,
          'TARGET_FILE_VERSION_UNIQUE_CONFLICT',
          {
            legacyFileId: file.id,
            conflictingVersionId: conflictingByVersion?.id ?? conflictingBySequence?.id ?? null,
          },
        );
      }
      return {
        file,
        targetAssetId,
        targetVersionId,
        versionSequence: index + 1,
      };
    });
    if (!groupValid) continue;

    const activeFiles = files.filter(isActiveLegacyFile);
    const selectedCurrent =
      currentCandidates[0] ?? activeFiles[activeFiles.length - 1] ?? files[files.length - 1];
    if (!currentCandidates[0] && selectedCurrent) {
      addFinding(
        'REVIEW',
        'FILE',
        'LogicalFileCandidate',
        item.id,
        'CURRENT_FILE_INFERRED_FROM_LATEST_UPLOAD',
        { inferredLegacyFileId: selectedCurrent.id },
      );
    }
    const selectedIndex = selectedCurrent ? files.indexOf(selectedCurrent) : -1;
    const approvedCurrent = [...files]
      .slice(0, selectedIndex + 1)
      .reverse()
      .find(
        (file) => isActiveLegacyFile(file) && mapLegacyFileStatus(file.fileStatus) === 'APPROVED',
      );
    const targetCurrentVersionId = approvedCurrent ? fileVersionId(approvedCurrent.id) : null;
    if (
      existingLogicalFile?.currentVersionId &&
      existingLogicalFile.currentVersionId !== targetCurrentVersionId
    ) {
      addFinding(
        'ERROR',
        'FILE',
        'LogicalFile',
        targetLogicalFileId,
        'TARGET_CURRENT_VERSION_CONFLICT',
        {
          existingCurrentVersionId: existingLogicalFile.currentVersionId,
          computedCurrentVersionId: targetCurrentVersionId,
        },
      );
      continue;
    }

    for (const plannedAsset of plannedAssets.values()) {
      if (!plannedAsset.existing) continue;
      addFinding('REVIEW', 'FILE', 'File', plannedAsset.file.id, 'REUSED_EXISTING_PHYSICAL_ASSET', {
        targetAssetId: plannedAsset.id,
        storageBucket: plannedAsset.file.storageBucket,
        storageKey: plannedAsset.file.storagePath,
      });
    }
    for (const version of plannedVersions) {
      if (
        mapLegacyFileStatus(version.file.fileStatus) === 'APPROVED' &&
        !latestApprovedReviewTime(version.file)
      ) {
        addFinding(
          'REVIEW',
          'FILE',
          'File',
          version.file.id,
          'APPROVED_AT_INFERRED_FROM_UPDATED_AT',
          { inferredApprovedAt: version.file.updatedAt.toISOString() },
        );
      }
      if ((version.file.remark?.length ?? 0) > 1000) {
        addFinding('REVIEW', 'FILE', 'File', version.file.id, 'CHANGE_DESCRIPTION_TRUNCATED', {
          legacyLength: version.file.remark?.length ?? 0,
          targetLimit: 1000,
        });
      }
    }

    const earliestFile = files[0];
    const groupStatus = selectedCurrent ? projectArchiveFileStatus(selectedCurrent) : 'ARCHIVED';
    const archivedAt =
      activeFiles.length === 0
        ? (latestDate(files.map(legacyFileArchivedAt)) ?? files[files.length - 1].updatedAt)
        : null;

    context.expectedProjectArchiveFileIds.add(targetArchiveFileId);
    context.expectedLogicalFileIds.add(targetLogicalFileId);
    for (const { id } of plannedAssets.values()) context.expectedAssetIds.add(id);
    for (const version of plannedVersions) {
      context.expectedFileVersionIds.add(version.targetVersionId);
      context.projectArchiveFileIdByLegacyFileId.set(version.file.id, targetArchiveFileId);
      context.fileVersionIdByLegacyFileId.set(version.file.id, version.targetVersionId);
    }
    increment(report.planned, 'projectArchiveFiles');
    increment(report.planned, 'logicalFiles');
    increment(report.planned, 'fileAssets', plannedAssets.size);
    increment(report.planned, 'fileVersions', plannedVersions.length);

    if (options.apply) {
      await prisma.$transaction(async (tx) => {
        await tx.logicalFile.upsert({
          where: { id: targetLogicalFileId },
          create: {
            id: targetLogicalFileId,
            ownerType: 'PROJECT_ARCHIVE',
            ownerId: targetEntryId,
            displayName: selectedCurrent?.originalName ?? earliestFile.originalName,
            status: groupStatus,
            createdBy: earliestFile.uploadUserId,
            archivedAt,
            createdAt: earliestFile.createdAt,
            updatedAt: selectedCurrent?.updatedAt ?? earliestFile.updatedAt,
          },
          update: {},
        });
        await tx.projectArchiveFile.upsert({
          where: { id: targetArchiveFileId },
          create: {
            id: targetArchiveFileId,
            projectId: item.projectId,
            archiveItemId: targetEntryId,
            logicalFileId: targetLogicalFileId,
            status: groupStatus,
            createdBy: earliestFile.uploadUserId,
            archivedAt,
            createdAt: earliestFile.createdAt,
            updatedAt: selectedCurrent?.updatedAt ?? earliestFile.updatedAt,
          },
          update: {},
        });
        for (const plannedAsset of plannedAssets.values()) {
          const file = plannedAsset.file;
          if (plannedAsset.existing) continue;
          await tx.fileAsset.upsert({
            where: { id: plannedAsset.id },
            create: {
              id: plannedAsset.id,
              ownerType: 'PROJECT_ARCHIVE',
              ownerId: targetEntryId,
              originalName: file.originalName,
              extension: file.fileExt.replace(/^\./, '').toLowerCase() || null,
              mimeType: file.mimeType,
              size: file.fileSize,
              storageProvider: file.storageProvider,
              storageBucket: file.storageBucket,
              storageKey: file.storagePath,
              status: legacyFileArchivedAt(file) ? 'ARCHIVED' : 'AVAILABLE',
              createdBy: file.uploadUserId,
              archivedAt: legacyFileArchivedAt(file),
              createdAt: file.createdAt,
              updatedAt: file.updatedAt,
            },
            update: {},
          });
        }
        for (const version of plannedVersions) {
          const approvedAt = latestApprovedReviewTime(version.file);
          const inferredApprovedAt =
            mapLegacyFileStatus(version.file.fileStatus) === 'APPROVED' && !approvedAt
              ? version.file.updatedAt
              : null;
          await tx.fileVersion.upsert({
            where: { id: version.targetVersionId },
            create: {
              id: version.targetVersionId,
              logicalFileId: targetLogicalFileId,
              version: version.file.versionNo,
              versionSequence: version.versionSequence,
              revisionLevel: 'MINOR',
              assetId: version.targetAssetId,
              status: projectArchiveFileStatus(version.file),
              changeDescription: version.file.remark?.slice(0, 1000),
              uploadedBy: version.file.uploadUserId,
              uploadedAt: version.file.uploadTime,
              approvedAt: approvedAt ?? inferredApprovedAt,
              archivedAt: legacyFileArchivedAt(version.file),
              createdAt: version.file.createdAt,
              updatedAt: version.file.updatedAt,
            },
            update: {},
          });
        }
        if (targetCurrentVersionId) {
          await tx.logicalFile.updateMany({
            where: {
              id: targetLogicalFileId,
              OR: [{ currentVersionId: null }, { currentVersionId: targetCurrentVersionId }],
            },
            data: { currentVersionId: targetCurrentVersionId },
          });
        }
      });
    }

    for (const plannedAsset of plannedAssets.values()) {
      const file = plannedAsset.file;
      assetByLocation.set(`${file.storageBucket}\u0000${file.storagePath}`, {
        id: plannedAsset.id,
        ownerType: 'PROJECT_ARCHIVE',
        ownerId: targetEntryId,
        storageBucket: file.storageBucket,
        storageKey: file.storagePath,
        size: file.fileSize,
        mimeType: file.mimeType,
        originalName: file.originalName,
      });
      assetById.set(plannedAsset.id, {
        id: plannedAsset.id,
        ownerType: 'PROJECT_ARCHIVE',
        ownerId: targetEntryId,
        storageBucket: file.storageBucket,
        storageKey: file.storagePath,
        size: file.fileSize,
        mimeType: file.mimeType,
        originalName: file.originalName,
      });
    }

    increment(report.writtenOrVerified, 'projectArchiveFiles');
    increment(report.writtenOrVerified, 'logicalFiles');
    increment(report.writtenOrVerified, 'fileAssets', plannedAssets.size);
    increment(report.writtenOrVerified, 'fileVersions', plannedVersions.length);
  }
}

function jsonStringArray(value: Prisma.JsonValue | null, key: string): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const candidate = (value as Prisma.JsonObject)[key];
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === 'string')
    : [];
}

async function isEligiblePendingReviewer(
  prisma: PrismaClient,
  userId: string,
  submitterId: string,
  projectId?: string | null,
): Promise<boolean> {
  if (userId === submitterId) return false;
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      deletedAt: null,
      status: 'Active',
      userRoles: {
        some: {
          role: {
            status: 'Active',
            rolePermissions: {
              some: {
                permission: {
                  permissionCode: 'file_review:act',
                },
              },
            },
          },
        },
      },
    },
    select: {
      departmentId: true,
      userRoles: {
        where: { role: { status: 'Active' } },
        select: { dataScope: true, scopeConfig: true },
      },
    },
  });
  if (!user) return false;
  if (!projectId) return true;
  if (user.userRoles.some((assignment) => assignment.dataScope === 'ALL')) {
    return true;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      countryCode: true,
      createdBy: true,
      salesOwnerId: true,
      projectManagerId: true,
      electricLeaderId: true,
      softwareLeaderId: true,
      purchaseOwnerId: true,
      financeOwnerId: true,
      members: {
        select: {
          userId: true,
          user: { select: { departmentId: true } },
        },
      },
    },
  });
  if (!project) return false;

  for (const assignment of user.userRoles) {
    if (
      assignment.dataScope === 'PARTICIPATED' &&
      project.members.some((member) => member.userId === userId)
    ) {
      return true;
    }
    if (assignment.dataScope === 'OWNED') {
      const owners = [
        project.createdBy,
        project.salesOwnerId,
        project.projectManagerId,
        project.electricLeaderId,
        project.softwareLeaderId,
        project.purchaseOwnerId,
        project.financeOwnerId,
      ];
      if (owners.includes(userId)) return true;
    }
    if (assignment.dataScope === 'DEPARTMENT') {
      if (
        user.departmentId &&
        project.members.some((member) => member.user.departmentId === user.departmentId)
      ) {
        return true;
      }
      if (!user.departmentId && project.members.some((member) => member.userId === userId)) {
        return true;
      }
    }
    if (assignment.dataScope === 'COUNTRY') {
      const configuredCountries = jsonStringArray(assignment.scopeConfig, 'countryCodes');
      if (configuredCountries.includes(project.countryCode)) return true;
      if (configuredCountries.length === 0) {
        const participated = await prisma.projectMember.findFirst({
          where: { userId, project: { countryCode: project.countryCode, deletedAt: null } },
          select: { id: true },
        });
        if (participated) return true;
      }
    }
    if (
      assignment.dataScope === 'CUSTOM' &&
      jsonStringArray(assignment.scopeConfig, 'projectIds').includes(project.id)
    ) {
      return true;
    }
  }
  return false;
}

interface NormalizedLegacyReviewer {
  userId: string;
  decision: 'APPROVED' | 'REJECTED' | null;
  actedAt: Date | null;
  comment: string | null;
  createdAt: Date;
  sourceReviewIds: string[];
  legacyReviewTime: Date;
}

function normalizeLegacyFileReviewers(
  file: Prisma.FileGetPayload<{ include: { reviews: true } }>,
): NormalizedLegacyReviewer[] | null {
  const reviewsByUser = new Map<string, typeof file.reviews>();
  for (const review of file.reviews) {
    const rows = reviewsByUser.get(review.reviewUserId) ?? [];
    rows.push(review);
    reviewsByUser.set(review.reviewUserId, rows);
  }
  const result: NormalizedLegacyReviewer[] = [];
  for (const [userId, reviews] of reviewsByUser) {
    const decisions = new Set(
      reviews
        .map((review) => mapLegacyDecision(review.reviewStatus))
        .filter((decision): decision is 'APPROVED' | 'REJECTED' => Boolean(decision)),
    );
    const hasPending = reviews.some((review) => mapLegacyDecision(review.reviewStatus) === null);
    if (decisions.size > 1 || (decisions.size > 0 && hasPending)) {
      addFinding('ERROR', 'REVIEW', 'File', file.id, 'CONFLICTING_REVIEW_ROWS_FOR_USER', {
        reviewUserId: userId,
        reviewIds: reviews.map((review) => review.id),
        statuses: reviews.map((review) => review.reviewStatus),
      });
      return null;
    }
    const decision = [...decisions][0] ?? null;
    const latest = [...reviews].sort(
      (left, right) => right.reviewTime.getTime() - left.reviewTime.getTime(),
    )[0];
    result.push({
      userId,
      decision,
      actedAt: decision ? latest.reviewTime : null,
      comment: latest.reviewComment,
      createdAt: reviews.reduce(
        (earliest, row) => (row.createdAt < earliest ? row.createdAt : earliest),
        reviews[0].createdAt,
      ),
      sourceReviewIds: reviews.map((review) => review.id),
      legacyReviewTime: latest.reviewTime,
    });
  }
  return result;
}

async function migrateFileReviews(prisma: PrismaClient, options: MigrationOptions): Promise<void> {
  const files = await prisma.file.findMany({
    where: { reviews: { some: {} } },
    include: {
      reviews: { orderBy: [{ reviewTime: 'asc' }, { id: 'asc' }] },
      archiveItem: { select: { id: true, name: true, secondName: true } },
    },
    orderBy: [{ uploadTime: 'asc' }, { id: 'asc' }],
  });
  report.scanned.fileReviewFiles = files.length;
  report.scanned.fileReviewRows = files.reduce((sum, file) => sum + file.reviews.length, 0);

  for (const file of files) {
    if (!file.archiveItemId || !file.archiveItem) {
      addFinding('ERROR', 'REVIEW', 'File', file.id, 'FILE_REVIEW_WITHOUT_ARCHIVE_ITEM', {
        reviewIds: file.reviews.map((review) => review.id),
      });
      continue;
    }
    const targetArchiveFileId =
      context.projectArchiveFileIdByLegacyFileId.get(file.id) ?? archiveFileId(file.archiveItemId);
    const targetFileVersionId =
      context.fileVersionIdByLegacyFileId.get(file.id) ?? fileVersionId(file.id);
    const targetRowsPlanned =
      context.expectedProjectArchiveFileIds.has(targetArchiveFileId) &&
      context.expectedFileVersionIds.has(targetFileVersionId);
    const [targetArchiveFile, targetVersion] = await Promise.all([
      prisma.projectArchiveFile.findUnique({
        where: { id: targetArchiveFileId },
        select: { id: true, projectId: true, logicalFileId: true },
      }),
      prisma.fileVersion.findUnique({
        where: { id: targetFileVersionId },
        select: { id: true, logicalFileId: true },
      }),
    ]);
    if ((!targetArchiveFile || !targetVersion) && !(options.apply === false && targetRowsPlanned)) {
      addFinding('ERROR', 'REVIEW', 'File', file.id, 'TARGET_FILE_VERSION_NOT_MIGRATED', {
        targetArchiveFileId,
        targetFileVersionId,
      });
      continue;
    }
    if (
      targetArchiveFile &&
      targetVersion &&
      targetArchiveFile.logicalFileId !== targetVersion.logicalFileId
    ) {
      addFinding('ERROR', 'REVIEW', 'File', file.id, 'TARGET_REVIEW_FILE_RELATION_MISMATCH', {
        targetArchiveFileId,
        targetFileVersionId,
        archiveLogicalFileId: targetArchiveFile.logicalFileId,
        versionLogicalFileId: targetVersion.logicalFileId,
      });
      continue;
    }

    const reviewers = normalizeLegacyFileReviewers(file);
    if (!reviewers || reviewers.length === 0) continue;
    const pendingReviewers = reviewers.filter((reviewer) => !reviewer.decision);
    let pendingEligible = true;
    for (const reviewer of pendingReviewers) {
      if (
        !(await isEligiblePendingReviewer(
          prisma,
          reviewer.userId,
          file.uploadUserId,
          file.projectId,
        ))
      ) {
        pendingEligible = false;
        addFinding(
          'ERROR',
          'REVIEW',
          'FileReview',
          reviewer.sourceReviewIds[0],
          'PENDING_REVIEWER_NOT_ELIGIBLE',
          {
            legacyFileId: file.id,
            reviewerUserId: reviewer.userId,
            projectId: file.projectId,
            note: '待处理任务不会回退到上传人，也不会自动选择其他审核人。',
          },
        );
      }
    }
    if (!pendingEligible) continue;

    const hasRejected = reviewers.some((reviewer) => reviewer.decision === 'REJECTED');
    const hasPending = reviewers.some((reviewer) => reviewer.decision === null);
    const taskStatus = hasRejected ? 'REJECTED' : hasPending ? 'PENDING' : 'APPROVED';
    const completedAt =
      taskStatus === 'PENDING' ? null : latestDate(reviewers.map((reviewer) => reviewer.actedAt));
    const taskId = foundationId(`review-task:legacy-file:${file.id}`);
    const stepId = foundationId(`review-step:legacy-file:${file.id}:1`);
    const locationLabel = file.archiveItem.secondName ?? file.archiveItem.name;
    const existingTask = await prisma.reviewTask.findUnique({
      where: { id: taskId },
      select: {
        sourceType: true,
        sourceId: true,
        fileVersionId: true,
      },
    });
    if (
      existingTask &&
      (existingTask.sourceType !== 'PROJECT_ARCHIVE' ||
        existingTask.sourceId !== targetArchiveFileId ||
        existingTask.fileVersionId !== targetFileVersionId)
    ) {
      addFinding('ERROR', 'REVIEW', 'ReviewTask', taskId, 'TARGET_REVIEW_TASK_CONFLICT', {
        legacyFileId: file.id,
      });
      continue;
    }
    if (taskStatus === 'PENDING') {
      const competingPendingTask = await prisma.reviewTask.findFirst({
        where: {
          id: { not: taskId },
          sourceType: 'PROJECT_ARCHIVE',
          sourceId: targetArchiveFileId,
          sourceVersionId: targetFileVersionId,
          status: 'PENDING',
          archivedAt: null,
        },
        select: { id: true },
      });
      if (competingPendingTask) {
        addFinding('ERROR', 'REVIEW', 'File', file.id, 'COMPETING_PENDING_REVIEW_TASK', {
          existingReviewTaskId: competingPendingTask.id,
          targetReviewTaskId: taskId,
        });
        continue;
      }
    }

    context.expectedReviewTaskIds.add(taskId);
    increment(report.planned, 'fileReviewTasks');
    if (options.apply) {
      await prisma.$transaction(async (tx) => {
        await tx.reviewTask.upsert({
          where: { id: taskId },
          create: {
            id: taskId,
            sourceType: 'PROJECT_ARCHIVE',
            sourceId: targetArchiveFileId,
            sourceVersionId: targetFileVersionId,
            projectId: file.projectId,
            fileVersionId: targetFileVersionId,
            approvalSnapshot: {
              migrationSource: 'file_reviews',
              legacyFileId: file.id,
              legacyReviewIds: file.reviews.map((review) => review.id),
              legacyFileStatus: file.fileStatus,
              legacyVersion: file.versionNo,
            },
            title: file.originalName,
            locationLabel,
            status: taskStatus,
            reviewMode: reviewers.length > 1 ? 'ALL_SIGN' : 'SINGLE',
            currentStepNo: 1,
            totalSteps: 1,
            submittedBy: file.uploadUserId,
            submittedAt: file.uploadTime,
            completedAt,
            archivedAt: legacyFileArchivedAt(file),
            createdAt: file.createdAt,
            updatedAt:
              latestDate([file.updatedAt, ...file.reviews.map((review) => review.reviewTime)]) ??
              file.updatedAt,
          },
          update: {},
        });
        await tx.reviewStep.upsert({
          where: { id: stepId },
          create: {
            id: stepId,
            reviewTaskId: taskId,
            stepNo: 1,
            mode: reviewers.length > 1 ? 'ALL_SIGN' : 'SINGLE',
            requiredCount: reviewers.length,
            status:
              taskStatus === 'PENDING'
                ? 'ACTIVE'
                : taskStatus === 'APPROVED'
                  ? 'APPROVED'
                  : 'REJECTED',
            configurationSnapshot: {
              migrationSource: 'file_reviews',
              assigneeUserIds: reviewers.map((reviewer) => reviewer.userId),
              requiredCount: reviewers.length,
            },
            startedAt: file.uploadTime,
            completedAt,
            createdAt: file.createdAt,
            updatedAt: completedAt ?? file.updatedAt,
          },
          update: {},
        });
        for (const reviewer of reviewers) {
          const assigneeId = foundationId(
            `review-assignee:legacy-file:${file.id}:${reviewer.userId}`,
          );
          await tx.reviewAssignee.upsert({
            where: { id: assigneeId },
            create: {
              id: assigneeId,
              reviewStepId: stepId,
              assigneeUserId: reviewer.userId,
              resolvedFromType: 'legacy-file-review',
              resolvedFromValue: reviewer.sourceReviewIds.join(',').slice(0, 100),
              status: reviewer.decision ?? 'PENDING',
              decision: reviewer.decision,
              actedAt: reviewer.actedAt,
              comment: reviewer.comment,
              resolutionMetadata: {
                migrationSource: 'file_reviews',
                sourceReviewIds: reviewer.sourceReviewIds,
                legacyReviewTime: reviewer.legacyReviewTime.toISOString(),
                eligibilityChecked: reviewer.decision === null,
              },
              createdAt: reviewer.createdAt,
              updatedAt: reviewer.actedAt ?? reviewer.createdAt,
            },
            update: {},
          });
        }
        await tx.reviewActionEvent.upsert({
          where: {
            id: foundationId(`review-event:legacy-file:${file.id}:submitted`),
          },
          create: {
            id: foundationId(`review-event:legacy-file:${file.id}:submitted`),
            reviewTaskId: taskId,
            stepNo: 1,
            actorUserId: file.uploadUserId,
            action: 'SUBMITTED',
            metadata: {
              migrationSource: 'files',
              legacyFileId: file.id,
              legacyVersion: file.versionNo,
            },
            createdAt: file.uploadTime,
          },
          update: {},
        });
        for (const review of file.reviews) {
          const decision = mapLegacyDecision(review.reviewStatus);
          if (!decision) continue;
          await tx.reviewActionEvent.upsert({
            where: {
              id: foundationId(`review-event:legacy-file-review:${review.id}`),
            },
            create: {
              id: foundationId(`review-event:legacy-file-review:${review.id}`),
              reviewTaskId: taskId,
              stepNo: 1,
              actorUserId: review.reviewUserId,
              action: decision,
              comment: review.reviewComment,
              metadata: {
                migrationSource: 'file_reviews',
                legacyReviewId: review.id,
                legacyStatus: review.reviewStatus,
              },
              createdAt: review.reviewTime,
            },
            update: {},
          });
        }
      });
    }
    increment(report.writtenOrVerified, 'fileReviewTasks');
  }
}

async function resolveApprovalTarget(
  prisma: PrismaClient,
  task: LegacyApprovalTask,
): Promise<TargetReviewSource | null> {
  const businessType = task.businessType.trim();
  if (businessType === 'knowledge') {
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id: task.businessId },
      select: { id: true, version: true },
    });
    if (!article) return null;
    const sourceId = targetContentId(`knowledge:${article.id}:${article.version}`);
    const exists = Boolean(
      await prisma.knowledgeVersion.findUnique({
        where: { id: sourceId },
        select: { id: true },
      }),
    );
    return {
      sourceType: 'KNOWLEDGE',
      sourceId,
      sourceVersionId: sourceId,
      projectId: null,
      fileVersionId: null,
      exists,
      mapping: {
        legacyBusinessType: businessType,
        legacyKnowledgeArticleId: article.id,
        legacyVersion: article.version,
      },
    };
  }

  if (businessType === 'template') {
    const template = await prisma.documentTemplate.findUnique({
      where: { id: task.businessId },
      select: {
        id: true,
        versions: {
          select: { versionNo: true },
          orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
    });
    if (!template) return null;
    const version = template.versions[0]?.versionNo ?? 'V1.0';
    const sourceId = targetContentId(`standard:document-template:${template.id}:${version}`);
    const exists = Boolean(
      await prisma.standardVersion.findUnique({
        where: { id: sourceId },
        select: { id: true },
      }),
    );
    return {
      sourceType: 'STANDARD',
      sourceId,
      sourceVersionId: sourceId,
      projectId: null,
      fileVersionId: null,
      exists,
      mapping: {
        legacyBusinessType: businessType,
        legacyDocumentTemplateId: template.id,
        legacyVersion: version,
      },
    };
  }

  if (businessType === 'archive-template-version' || businessType === 'ARCHIVE_TEMPLATE') {
    const exists = Boolean(
      await prisma.archiveTemplateVersion.findUnique({
        where: { id: task.businessId },
        select: { id: true },
      }),
    );
    return {
      sourceType: 'ARCHIVE_TEMPLATE',
      sourceId: task.businessId,
      sourceVersionId: task.businessId,
      projectId: null,
      fileVersionId: null,
      exists,
      mapping: { legacyBusinessType: businessType },
    };
  }

  if (businessType === 'STANDARD' || businessType === 'standard') {
    const version = await prisma.standardVersion.findUnique({
      where: { id: task.businessId },
      select: { id: true, fileVersionId: true },
    });
    return {
      sourceType: 'STANDARD',
      sourceId: task.businessId,
      sourceVersionId: task.businessId,
      projectId: null,
      fileVersionId: version?.fileVersionId ?? null,
      exists: Boolean(version),
      mapping: { legacyBusinessType: businessType },
    };
  }

  if (businessType === 'KNOWLEDGE') {
    const version = await prisma.knowledgeVersion.findUnique({
      where: { id: task.businessId },
      select: { id: true, fileVersionId: true },
    });
    return {
      sourceType: 'KNOWLEDGE',
      sourceId: task.businessId,
      sourceVersionId: task.businessId,
      projectId: null,
      fileVersionId: version?.fileVersionId ?? null,
      exists: Boolean(version),
      mapping: { legacyBusinessType: businessType },
    };
  }

  if (businessType === 'PROJECT_ARCHIVE_FILE') {
    const archiveFile = await prisma.projectArchiveFile.findUnique({
      where: { id: task.businessId },
      select: {
        id: true,
        projectId: true,
        logicalFile: {
          select: {
            currentVersionId: true,
            versions: {
              where: { archivedAt: null },
              select: { id: true, status: true, uploadedAt: true },
              orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
            },
          },
        },
      },
    });
    if (!archiveFile) {
      return {
        sourceType: 'PROJECT_ARCHIVE',
        sourceId: task.businessId,
        sourceVersionId: null,
        projectId: null,
        fileVersionId: null,
        exists: false,
        mapping: { legacyBusinessType: businessType },
      };
    }
    const pendingCandidates = archiveFile.logicalFile.versions.filter((version) =>
      ['UPLOADED', 'REVIEWING', 'REJECTED'].includes(version.status),
    );
    const selectedVersion =
      pendingCandidates.length === 1
        ? pendingCandidates[0]
        : (archiveFile.logicalFile.versions.find(
            (version) => version.id === archiveFile.logicalFile.currentVersionId,
          ) ?? archiveFile.logicalFile.versions[0]);
    return {
      sourceType: 'PROJECT_ARCHIVE',
      sourceId: archiveFile.id,
      sourceVersionId: selectedVersion?.id ?? null,
      projectId: archiveFile.projectId,
      fileVersionId: selectedVersion?.id ?? null,
      exists: Boolean(selectedVersion),
      mapping: {
        legacyBusinessType: businessType,
        candidateFileVersionIds: pendingCandidates.map((version) => version.id),
      },
    };
  }

  return null;
}

function normalizeApprovalTaskStatus(status: string): 'PENDING' | 'APPROVED' | 'REJECTED' | null {
  const normalized = status.trim().toUpperCase();
  if (normalized === 'PENDING') return 'PENDING';
  if (['APPROVED', 'COMPLETED'].includes(normalized)) return 'APPROVED';
  if (['REJECTED', 'DENIED'].includes(normalized)) return 'REJECTED';
  return null;
}

async function resolveConfiguredReviewerIds(
  prisma: PrismaClient,
  step: LegacyApprovalTask['template']['steps'][number],
  applicantId: string,
  projectId: string | null,
): Promise<string[]> {
  const approverValues = Array.isArray(step.approverValues)
    ? step.approverValues.filter((value): value is string => typeof value === 'string')
    : [];
  const candidateIds =
    step.approverType === 'user'
      ? approverValues
      : (
          await prisma.user.findMany({
            where: {
              deletedAt: null,
              status: 'Active',
              userRoles: {
                some: {
                  role: {
                    roleCode: { in: approverValues },
                    status: 'Active',
                  },
                },
              },
            },
            select: { id: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          })
        ).map((user) => user.id);
  const eligible: string[] = [];
  for (const candidateId of candidateIds) {
    if (await isEligiblePendingReviewer(prisma, candidateId, applicantId, projectId)) {
      eligible.push(candidateId);
    }
  }
  return eligible;
}

interface ApprovalAssigneePlan {
  userId: string;
  decision: 'APPROVED' | 'REJECTED' | null;
  actedAt: Date | null;
  comment: string | null;
  createdAt: Date;
  legacyActionIds: string[];
  resolvedFromType: string;
  resolvedFromValue: string;
  status: string;
}

interface ApprovalStepPlan {
  legacyStepOrder: number;
  stepNo: number;
  mode: 'SINGLE' | 'ALL_SIGN';
  requiredCount: number;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  assignees: ApprovalAssigneePlan[];
}

async function buildApprovalStepPlans(
  prisma: PrismaClient,
  task: LegacyApprovalTask,
  taskStatus: 'PENDING' | 'APPROVED' | 'REJECTED',
  target: TargetReviewSource,
  submittedAt: Date,
): Promise<ApprovalStepPlan[] | null> {
  const configured = [...task.template.steps].sort(
    (left, right) => left.stepOrder - right.stepOrder,
  );
  const decisions = task.actions.filter((action) => Boolean(mapLegacyDecision(action.action)));

  if (taskStatus === 'PENDING') {
    const steps =
      configured.length > 0
        ? configured
        : task.approverId
          ? [
              {
                id: foundationId(`synthetic-approval-step:${task.id}`),
                templateId: task.templateId,
                stepOrder: task.currentStep,
                stepName: '旧审批当前步骤',
                mode: 'SINGLE',
                requiredCount: 1,
                approverType: 'user',
                approverValues: [task.approverId],
                createdAt: task.createdAt,
                updatedAt: task.updatedAt,
              },
            ]
          : [];
    if (steps.length === 0 || !task.approverId) {
      addFinding('ERROR', 'REVIEW', 'ApprovalTask', task.id, 'PENDING_APPROVER_NOT_IDENTIFIABLE', {
        currentStep: task.currentStep,
        approverId: task.approverId,
      });
      return null;
    }

    const plans: ApprovalStepPlan[] = [];
    for (const [index, step] of steps.entries()) {
      const stepActions = decisions.filter((action) => action.stepOrder === step.stepOrder);
      const beforeCurrent = step.stepOrder < task.currentStep;
      const isCurrent = step.stepOrder === task.currentStep;
      let assignees: ApprovalAssigneePlan[] = [];

      if (beforeCurrent) {
        const actors = new Map<string, typeof stepActions>();
        for (const action of stepActions) {
          const rows = actors.get(action.actorId) ?? [];
          rows.push(action);
          actors.set(action.actorId, rows);
        }
        if (actors.size === 0) {
          addFinding(
            'ERROR',
            'REVIEW',
            'ApprovalTask',
            task.id,
            'PENDING_TASK_MISSING_COMPLETED_STEP_HISTORY',
            { legacyStepOrder: step.stepOrder },
          );
          return null;
        }
        assignees = [...actors].map(([userId, actions]) => {
          const latest = actions[actions.length - 1];
          const decision = mapLegacyDecision(latest.action);
          return {
            userId,
            decision,
            actedAt: latest.createdAt,
            comment: latest.comment,
            createdAt: actions[0].createdAt,
            legacyActionIds: actions.map((action) => action.id),
            resolvedFromType: 'legacy-action',
            resolvedFromValue: String(step.stepOrder),
            status: decision ?? 'APPROVED',
          };
        });
        if (assignees.some((assignee) => assignee.decision !== 'APPROVED')) {
          addFinding(
            'ERROR',
            'REVIEW',
            'ApprovalTask',
            task.id,
            'PENDING_TASK_HAS_NON_APPROVED_PRIOR_STEP',
            { legacyStepOrder: step.stepOrder },
          );
          return null;
        }
      } else if (isCurrent) {
        if (
          !(await isEligiblePendingReviewer(
            prisma,
            task.approverId,
            task.applicantId,
            target.projectId,
          ))
        ) {
          addFinding(
            'ERROR',
            'REVIEW',
            'ApprovalTask',
            task.id,
            'PENDING_CURRENT_APPROVER_NOT_ELIGIBLE',
            { approverId: task.approverId, legacyStepOrder: step.stepOrder },
          );
          return null;
        }
        assignees = [
          {
            userId: task.approverId,
            decision: null,
            actedAt: null,
            comment: task.comment,
            createdAt: task.updatedAt,
            legacyActionIds: [],
            resolvedFromType: step.approverType,
            resolvedFromValue: Array.isArray(step.approverValues)
              ? step.approverValues.join(',')
              : null,
            status: 'PENDING',
          },
        ];
      } else {
        const candidates = await resolveConfiguredReviewerIds(
          prisma,
          step,
          task.applicantId,
          target.projectId,
        );
        if (candidates.length !== 1) {
          addFinding(
            'ERROR',
            'REVIEW',
            'ApprovalTask',
            task.id,
            'AMBIGUOUS_PENDING_FUTURE_REVIEWER',
            {
              legacyStepOrder: step.stepOrder,
              approverType: step.approverType,
              approverValues: step.approverValues,
              eligibleCandidateIds: candidates,
            },
          );
          return null;
        }
        assignees = [
          {
            userId: candidates[0],
            decision: null,
            actedAt: null,
            comment: null,
            createdAt: task.createdAt,
            legacyActionIds: [],
            resolvedFromType: step.approverType,
            resolvedFromValue: Array.isArray(step.approverValues)
              ? step.approverValues.join(',')
              : null,
            status: 'WAITING',
          },
        ];
      }

      const completedAt = beforeCurrent
        ? latestDate(assignees.map((assignee) => assignee.actedAt))
        : null;
      plans.push({
        legacyStepOrder: step.stepOrder,
        stepNo: index + 1,
        mode: assignees.length > 1 ? 'ALL_SIGN' : 'SINGLE',
        requiredCount: assignees.length,
        status: beforeCurrent ? 'APPROVED' : isCurrent ? 'ACTIVE' : 'WAITING',
        startedAt: beforeCurrent || isCurrent ? submittedAt : null,
        completedAt,
        assignees,
      });
    }
    return plans;
  }

  let effectiveDecisions = [...decisions];
  if (effectiveDecisions.length === 0) {
    if (!task.approverId) {
      addFinding(
        'ERROR',
        'REVIEW',
        'ApprovalTask',
        task.id,
        'COMPLETED_TASK_WITHOUT_DECISION_ACTOR',
        { status: task.status, decidedAt: dateJson(task.decidedAt) },
      );
      return null;
    }
    const decisionTime = task.decidedAt ?? task.updatedAt;
    effectiveDecisions = [
      {
        id: foundationId(`synthetic-approval-action:${task.id}`),
        taskId: task.id,
        stepOrder: task.currentStep,
        action: taskStatus,
        actorId: task.approverId,
        comment: task.comment,
        createdAt: decisionTime,
      },
    ];
    addFinding(
      'REVIEW',
      'REVIEW',
      'ApprovalTask',
      task.id,
      'DECISION_SYNTHESIZED_FROM_TASK_STATE',
      {
        decision: taskStatus,
        actorUserId: task.approverId,
        decidedAt: decisionTime.toISOString(),
      },
    );
  }

  const actionsByStep = new Map<number, typeof effectiveDecisions>();
  for (const action of effectiveDecisions) {
    const actions = actionsByStep.get(action.stepOrder) ?? [];
    actions.push(action);
    actionsByStep.set(action.stepOrder, actions);
  }
  const plans: ApprovalStepPlan[] = [];
  const stepOrders = [...actionsByStep.keys()].sort((left, right) => left - right);
  for (const [index, legacyStepOrder] of stepOrders.entries()) {
    const stepActions = actionsByStep.get(legacyStepOrder) ?? [];
    const byActor = new Map<string, typeof stepActions>();
    for (const action of stepActions) {
      const actions = byActor.get(action.actorId) ?? [];
      actions.push(action);
      byActor.set(action.actorId, actions);
    }
    const assignees: ApprovalAssigneePlan[] = [...byActor].map(([userId, actions]) => {
      const latest = actions[actions.length - 1];
      const decision = mapLegacyDecision(latest.action);
      return {
        userId,
        decision,
        actedAt: latest.createdAt,
        comment: latest.comment,
        createdAt: actions[0].createdAt,
        legacyActionIds: actions.map((action) => action.id),
        resolvedFromType: 'legacy-action',
        resolvedFromValue: String(legacyStepOrder),
        status: decision ?? taskStatus,
      };
    });
    const rejected = assignees.some((assignee) => assignee.decision === 'REJECTED');
    plans.push({
      legacyStepOrder,
      stepNo: index + 1,
      mode: assignees.length > 1 ? 'ALL_SIGN' : 'SINGLE',
      requiredCount: assignees.length,
      status: rejected ? 'REJECTED' : 'APPROVED',
      startedAt: index === 0 ? submittedAt : (plans[index - 1]?.completedAt ?? submittedAt),
      completedAt: latestDate(assignees.map((assignee) => assignee.actedAt)),
      assignees,
    });
  }
  return plans;
}

async function migrateApprovalTasks(
  prisma: PrismaClient,
  options: MigrationOptions,
): Promise<void> {
  const tasks = await prisma.approvalTask.findMany({
    include: {
      actions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      template: {
        include: { steps: { orderBy: [{ stepOrder: 'asc' }, { id: 'asc' }] } },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  report.scanned.approvalTasks = tasks.length;
  report.scanned.approvalActions = tasks.reduce((sum, task) => sum + task.actions.length, 0);

  for (const task of tasks) {
    const taskStatus = normalizeApprovalTaskStatus(task.status);
    if (!taskStatus) {
      addFinding('ERROR', 'REVIEW', 'ApprovalTask', task.id, 'UNMAPPED_APPROVAL_TASK_STATUS', {
        legacyStatus: task.status,
      });
      continue;
    }
    const target = await resolveApprovalTarget(prisma, task);
    if (!target) {
      addFinding(
        taskStatus === 'PENDING' ? 'ERROR' : 'REVIEW',
        'REVIEW',
        'ApprovalTask',
        task.id,
        'UNSUPPORTED_OR_MISSING_LEGACY_APPROVAL_SOURCE',
        {
          businessType: task.businessType,
          businessId: task.businessId,
          status: task.status,
          note: '已删除业务域或尚未迁移的附件修订不会被错误映射到统一审核。',
        },
      );
      continue;
    }
    if (!target.exists) {
      addFinding(
        taskStatus === 'PENDING' ? 'ERROR' : 'REVIEW',
        'REVIEW',
        'ApprovalTask',
        task.id,
        'TARGET_REVIEW_SOURCE_NOT_PRESENT',
        {
          sourceType: target.sourceType,
          sourceId: target.sourceId,
          status: taskStatus,
          mapping: target.mapping,
        },
      );
      if (taskStatus === 'PENDING') continue;
    }
    if (
      taskStatus === 'PENDING' &&
      target.sourceType === 'PROJECT_ARCHIVE' &&
      (!target.fileVersionId ||
        (Array.isArray(target.mapping.candidateFileVersionIds) &&
          target.mapping.candidateFileVersionIds.length > 1))
    ) {
      addFinding('ERROR', 'REVIEW', 'ApprovalTask', task.id, 'AMBIGUOUS_PENDING_FILE_VERSION', {
        sourceId: target.sourceId,
        mapping: target.mapping,
      });
      continue;
    }

    const submittedAction = task.actions.find(
      (action) => action.action.trim().toUpperCase() === 'SUBMITTED',
    );
    const submittedAt = submittedAction?.createdAt ?? task.createdAt;
    const stepPlans = await buildApprovalStepPlans(prisma, task, taskStatus, target, submittedAt);
    if (!stepPlans || stepPlans.length === 0) continue;
    const completedAt =
      taskStatus === 'PENDING'
        ? null
        : (task.decidedAt ??
          latestDate(stepPlans.map((step) => step.completedAt)) ??
          task.updatedAt);
    const taskId = foundationId(`review-task:legacy-approval:${task.id}`);
    const existingTask = await prisma.reviewTask.findUnique({
      where: { id: taskId },
      select: { sourceType: true, sourceId: true, sourceVersionId: true },
    });
    if (
      existingTask &&
      (existingTask.sourceType !== target.sourceType ||
        existingTask.sourceId !== target.sourceId ||
        existingTask.sourceVersionId !== target.sourceVersionId)
    ) {
      addFinding('ERROR', 'REVIEW', 'ReviewTask', taskId, 'TARGET_REVIEW_TASK_CONFLICT', {
        legacyApprovalTaskId: task.id,
      });
      continue;
    }
    if (taskStatus === 'PENDING') {
      const competingPendingTask = await prisma.reviewTask.findFirst({
        where: {
          id: { not: taskId },
          sourceType: target.sourceType,
          sourceId: target.sourceId,
          sourceVersionId: target.sourceVersionId,
          status: 'PENDING',
          archivedAt: null,
        },
        select: { id: true },
      });
      if (competingPendingTask) {
        addFinding('ERROR', 'REVIEW', 'ApprovalTask', task.id, 'COMPETING_PENDING_REVIEW_TASK', {
          existingReviewTaskId: competingPendingTask.id,
          targetReviewTaskId: taskId,
        });
        continue;
      }
    }

    context.expectedReviewTaskIds.add(taskId);
    increment(report.planned, 'approvalReviewTasks');
    if (options.apply) {
      await prisma.$transaction(async (tx) => {
        await tx.reviewTask.upsert({
          where: { id: taskId },
          create: {
            id: taskId,
            sourceType: target.sourceType,
            sourceId: target.sourceId,
            sourceVersionId: target.sourceVersionId,
            projectId: target.projectId,
            fileVersionId: target.fileVersionId,
            approvalTemplateId: task.templateId,
            approvalTemplateVersion: task.template.updatedAt.toISOString(),
            approvalSnapshot: {
              migrationSource: 'approval_tasks',
              legacyApprovalTaskId: task.id,
              legacyBusinessType: task.businessType,
              legacyBusinessId: task.businessId,
              legacyStatus: task.status,
              legacyCurrentStep: task.currentStep,
              legacyTaskComment: task.comment,
              targetMapping: target.mapping,
              template: {
                id: task.template.id,
                code: task.template.templateCode,
                name: task.template.templateName,
                steps: task.template.steps.map((step) => ({
                  legacyStepOrder: step.stepOrder,
                  stepName: step.stepName,
                  approverType: step.approverType,
                  mode: step.mode,
                  requiredCount: step.requiredCount,
                  approverValues: step.approverValues,
                })),
              },
            },
            title: task.businessTitle ?? `${task.template.templateName}（历史任务）`,
            locationLabel: task.businessTitle,
            status: taskStatus,
            reviewMode: stepPlans.length > 1 ? 'SERIAL' : stepPlans[0].mode,
            currentStepNo:
              taskStatus === 'PENDING'
                ? (stepPlans.find((step) => step.status === 'ACTIVE')?.stepNo ?? 1)
                : stepPlans[stepPlans.length - 1].stepNo,
            totalSteps: stepPlans.length,
            submittedBy: task.applicantId,
            submittedAt,
            completedAt,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
          },
          update: {},
        });

        for (const stepPlan of stepPlans) {
          const stepId = foundationId(
            `review-step:legacy-approval:${task.id}:${stepPlan.legacyStepOrder}`,
          );
          await tx.reviewStep.upsert({
            where: { id: stepId },
            create: {
              id: stepId,
              reviewTaskId: taskId,
              stepNo: stepPlan.stepNo,
              mode: stepPlan.mode,
              requiredCount: stepPlan.requiredCount,
              status: stepPlan.status,
              configurationSnapshot: {
                migrationSource: 'approval_tasks',
                legacyStepOrder: stepPlan.legacyStepOrder,
                assigneeUserIds: stepPlan.assignees.map((assignee) => assignee.userId),
              },
              startedAt: stepPlan.startedAt,
              completedAt: stepPlan.completedAt,
              createdAt: task.createdAt,
              updatedAt: stepPlan.completedAt ?? task.updatedAt,
            },
            update: {},
          });
          for (const assignee of stepPlan.assignees) {
            const assigneeId = foundationId(
              `review-assignee:legacy-approval:${task.id}:${stepPlan.legacyStepOrder}:${assignee.userId}`,
            );
            await tx.reviewAssignee.upsert({
              where: { id: assigneeId },
              create: {
                id: assigneeId,
                reviewStepId: stepId,
                assigneeUserId: assignee.userId,
                resolvedFromType: assignee.resolvedFromType.slice(0, 30),
                resolvedFromValue: assignee.resolvedFromValue.slice(0, 100),
                status: assignee.status,
                decision: assignee.decision,
                actedAt: assignee.actedAt,
                comment: assignee.comment,
                resolutionMetadata: {
                  migrationSource: 'approval_tasks',
                  legacyActionIds: assignee.legacyActionIds,
                  legacyStepOrder: stepPlan.legacyStepOrder,
                  eligibilityChecked: taskStatus === 'PENDING' && !assignee.decision,
                },
                createdAt: assignee.createdAt,
                updatedAt: assignee.actedAt ?? assignee.createdAt,
              },
              update: {},
            });
          }
        }

        const hasSubmittedEvent = task.actions.some(
          (action) => action.action.trim().toUpperCase() === 'SUBMITTED',
        );
        for (const action of task.actions) {
          const mappedDecision = mapLegacyDecision(action.action);
          const mappedAction =
            action.action.trim().toUpperCase() === 'SUBMITTED'
              ? 'SUBMITTED'
              : (mappedDecision ?? action.action.trim().toUpperCase().slice(0, 30));
          const mappedStep = stepPlans.find((step) => step.legacyStepOrder === action.stepOrder);
          await tx.reviewActionEvent.upsert({
            where: {
              id: foundationId(`review-event:legacy-approval-action:${action.id}`),
            },
            create: {
              id: foundationId(`review-event:legacy-approval-action:${action.id}`),
              reviewTaskId: taskId,
              stepNo: mappedStep?.stepNo,
              actorUserId: action.actorId,
              action: mappedAction || 'LEGACY_ACTION',
              comment: action.comment,
              metadata: {
                migrationSource: 'approval_actions',
                legacyActionId: action.id,
                legacyAction: action.action,
                legacyStepOrder: action.stepOrder,
              },
              createdAt: action.createdAt,
            },
            update: {},
          });
        }
        if (!hasSubmittedEvent) {
          await tx.reviewActionEvent.upsert({
            where: {
              id: foundationId(`review-event:legacy-approval:${task.id}:submitted`),
            },
            create: {
              id: foundationId(`review-event:legacy-approval:${task.id}:submitted`),
              reviewTaskId: taskId,
              stepNo: 1,
              actorUserId: task.applicantId,
              action: 'SUBMITTED',
              metadata: {
                migrationSource: 'approval_tasks',
                legacyApprovalTaskId: task.id,
                synthesized: true,
              },
              createdAt: submittedAt,
            },
            update: {},
          });
        }
        if (
          taskStatus !== 'PENDING' &&
          !task.actions.some((action) => Boolean(mapLegacyDecision(action.action)))
        ) {
          const finalStep = stepPlans[stepPlans.length - 1];
          const finalAssignee = finalStep.assignees[finalStep.assignees.length - 1];
          await tx.reviewActionEvent.upsert({
            where: {
              id: foundationId(`review-event:legacy-approval:${task.id}:decision`),
            },
            create: {
              id: foundationId(`review-event:legacy-approval:${task.id}:decision`),
              reviewTaskId: taskId,
              stepNo: finalStep.stepNo,
              actorUserId: finalAssignee.userId,
              action: taskStatus,
              comment: task.comment,
              metadata: {
                migrationSource: 'approval_tasks',
                legacyApprovalTaskId: task.id,
                synthesized: true,
              },
              createdAt: finalAssignee.actedAt ?? completedAt ?? task.updatedAt,
            },
            update: {},
          });
        }
      });
    }
    increment(report.writtenOrVerified, 'approvalReviewTasks');
  }
}

function chunks<T>(values: readonly T[], size = 500): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function validateAppliedMigration(prisma: PrismaClient): Promise<void> {
  const projectIds = [...context.expectedProjectIds];
  for (const batch of chunks(projectIds)) {
    const projects = await prisma.project.findMany({
      where: { id: { in: batch } },
      select: { id: true, status: true, currentStage: true },
    });
    increment(report.validation, 'projectsFound', projects.length);
    const byId = new Map(projects.map((project) => [project.id, project]));
    for (const id of batch) {
      const project = byId.get(id);
      if (!project) {
        addFinding('ERROR', 'PROJECT', 'Project', id, 'TARGET_PROJECT_MISSING', {});
      } else if (!project.status || !project.currentStage) {
        addFinding('ERROR', 'PROJECT', 'Project', id, 'TARGET_PROJECT_STATE_INCOMPLETE', {
          status: project.status,
          currentStage: project.currentStage,
        });
      }
    }
  }

  const folderIds = [...context.expectedFolderIds];
  for (const batch of chunks(folderIds)) {
    const rows = await prisma.projectArchiveFolder.findMany({
      where: { id: { in: batch } },
      select: { id: true, projectId: true },
    });
    increment(report.validation, 'projectArchiveFoldersFound', rows.length);
    const found = new Set(rows.map((row) => row.id));
    for (const id of batch) {
      if (!found.has(id)) {
        addFinding(
          'ERROR',
          'ARCHIVE',
          'ProjectArchiveFolder',
          id,
          'TARGET_ROW_MISSING_AFTER_APPLY',
          {},
        );
      }
    }
  }

  const entryIds = [...context.expectedEntryIds];
  for (const batch of chunks(entryIds)) {
    const rows = await prisma.projectArchiveEntry.findMany({
      where: { id: { in: batch } },
      select: {
        id: true,
        projectId: true,
        folder: { select: { projectId: true } },
      },
    });
    increment(report.validation, 'projectArchiveEntriesFound', rows.length);
    const found = new Set(rows.map((row) => row.id));
    for (const row of rows) {
      if (row.projectId !== row.folder.projectId) {
        addFinding(
          'ERROR',
          'ARCHIVE',
          'ProjectArchiveEntry',
          row.id,
          'TARGET_FOLDER_PROJECT_MISMATCH',
          { entryProjectId: row.projectId, folderProjectId: row.folder.projectId },
        );
      }
    }
    for (const id of batch) {
      if (!found.has(id)) {
        addFinding(
          'ERROR',
          'ARCHIVE',
          'ProjectArchiveEntry',
          id,
          'TARGET_ROW_MISSING_AFTER_APPLY',
          {},
        );
      }
    }
  }

  const archiveFileIds = [...context.expectedProjectArchiveFileIds];
  for (const batch of chunks(archiveFileIds)) {
    const rows = await prisma.projectArchiveFile.findMany({
      where: { id: { in: batch } },
      select: {
        id: true,
        projectId: true,
        archiveItemId: true,
        logicalFileId: true,
        archiveItem: { select: { projectId: true } },
        logicalFile: { select: { ownerType: true, ownerId: true } },
      },
    });
    increment(report.validation, 'projectArchiveFilesFound', rows.length);
    const found = new Set(rows.map((row) => row.id));
    for (const row of rows) {
      if (
        row.projectId !== row.archiveItem.projectId ||
        row.logicalFile.ownerType !== 'PROJECT_ARCHIVE' ||
        row.logicalFile.ownerId !== row.archiveItemId
      ) {
        addFinding(
          'ERROR',
          'FILE',
          'ProjectArchiveFile',
          row.id,
          'TARGET_ARCHIVE_FILE_RELATION_INVALID',
          {
            projectId: row.projectId,
            archiveItemProjectId: row.archiveItem.projectId,
            logicalFileId: row.logicalFileId,
            logicalOwnerType: row.logicalFile.ownerType,
            logicalOwnerId: row.logicalFile.ownerId,
            archiveItemId: row.archiveItemId,
          },
        );
      }
    }
    for (const id of batch) {
      if (!found.has(id)) {
        addFinding('ERROR', 'FILE', 'ProjectArchiveFile', id, 'TARGET_ROW_MISSING_AFTER_APPLY', {});
      }
    }
  }

  const logicalFileIds = [...context.expectedLogicalFileIds];
  for (const batch of chunks(logicalFileIds)) {
    const rows = await prisma.logicalFile.findMany({
      where: { id: { in: batch } },
      select: { id: true },
    });
    increment(report.validation, 'logicalFilesFound', rows.length);
    const found = new Set(rows.map((row) => row.id));
    for (const id of batch) {
      if (!found.has(id)) {
        addFinding('ERROR', 'FILE', 'LogicalFile', id, 'TARGET_ROW_MISSING_AFTER_APPLY', {});
      }
    }
  }

  const assetIds = [...context.expectedAssetIds];
  for (const batch of chunks(assetIds)) {
    const rows = await prisma.fileAsset.findMany({
      where: { id: { in: batch } },
      select: { id: true },
    });
    increment(report.validation, 'fileAssetsFound', rows.length);
    const found = new Set(rows.map((row) => row.id));
    for (const id of batch) {
      if (!found.has(id)) {
        addFinding('ERROR', 'FILE', 'FileAsset', id, 'TARGET_ROW_MISSING_AFTER_APPLY', {});
      }
    }
  }

  const versionIds = [...context.expectedFileVersionIds];
  for (const batch of chunks(versionIds)) {
    const rows = await prisma.fileVersion.findMany({
      where: { id: { in: batch } },
      select: {
        id: true,
        logicalFileId: true,
        assetId: true,
        logicalFile: { select: { id: true } },
        asset: { select: { id: true } },
      },
    });
    increment(report.validation, 'fileVersionsFound', rows.length);
    const found = new Set(rows.map((row) => row.id));
    for (const row of rows) {
      if (row.logicalFileId !== row.logicalFile.id || row.assetId !== row.asset.id) {
        addFinding(
          'ERROR',
          'FILE',
          'FileVersion',
          row.id,
          'TARGET_FILE_VERSION_RELATION_INVALID',
          {},
        );
      }
    }
    for (const id of batch) {
      if (!found.has(id)) {
        addFinding('ERROR', 'FILE', 'FileVersion', id, 'TARGET_ROW_MISSING_AFTER_APPLY', {});
      }
    }
  }

  const taskIds = [...context.expectedReviewTaskIds];
  for (const batch of chunks(taskIds)) {
    const rows = await prisma.reviewTask.findMany({
      where: { id: { in: batch } },
      select: {
        id: true,
        status: true,
        sourceType: true,
        sourceId: true,
        fileVersionId: true,
        fileVersion: { select: { logicalFileId: true } },
        steps: {
          select: {
            id: true,
            assignees: { select: { id: true } },
          },
        },
        actionEvents: { select: { id: true } },
      },
    });
    increment(report.validation, 'reviewTasksFound', rows.length);
    const found = new Set(rows.map((row) => row.id));
    const projectArchiveSourceIds = rows
      .filter((row) => row.sourceType === 'PROJECT_ARCHIVE')
      .map((row) => row.sourceId);
    const archiveFiles = await prisma.projectArchiveFile.findMany({
      where: { id: { in: projectArchiveSourceIds } },
      select: { id: true, logicalFileId: true },
    });
    const archiveFileById = new Map(archiveFiles.map((file) => [file.id, file]));
    for (const row of rows) {
      const assigneeCount = row.steps.reduce((sum, step) => sum + step.assignees.length, 0);
      if (row.steps.length === 0 || assigneeCount === 0 || row.actionEvents.length === 0) {
        addFinding('ERROR', 'REVIEW', 'ReviewTask', row.id, 'TARGET_REVIEW_HISTORY_INCOMPLETE', {
          status: row.status,
          stepCount: row.steps.length,
          assigneeCount,
          actionEventCount: row.actionEvents.length,
        });
      }
      if (row.sourceType === 'PROJECT_ARCHIVE') {
        const archiveFile = archiveFileById.get(row.sourceId);
        if (
          !archiveFile ||
          !row.fileVersionId ||
          row.fileVersion?.logicalFileId !== archiveFile.logicalFileId
        ) {
          addFinding(
            'ERROR',
            'REVIEW',
            'ReviewTask',
            row.id,
            'TARGET_REVIEW_FILE_RELATION_INVALID',
            {
              sourceId: row.sourceId,
              fileVersionId: row.fileVersionId,
              archiveLogicalFileId: archiveFile?.logicalFileId ?? null,
              versionLogicalFileId: row.fileVersion?.logicalFileId ?? null,
            },
          );
        }
      }
    }
    for (const id of batch) {
      if (!found.has(id)) {
        addFinding('ERROR', 'REVIEW', 'ReviewTask', id, 'TARGET_ROW_MISSING_AFTER_APPLY', {});
      }
    }
  }
}

function collectDryRunValidationCounts(): void {
  report.validation.expectedProjectRows = context.expectedProjectIds.size;
  report.validation.expectedProjectArchiveFolders = context.expectedFolderIds.size;
  report.validation.expectedProjectArchiveEntries = context.expectedEntryIds.size;
  report.validation.expectedProjectArchiveFiles = context.expectedProjectArchiveFileIds.size;
  report.validation.expectedLogicalFiles = context.expectedLogicalFileIds.size;
  report.validation.expectedFileAssets = context.expectedAssetIds.size;
  report.validation.expectedFileVersions = context.expectedFileVersionIds.size;
  report.validation.expectedReviewTasks = context.expectedReviewTaskIds.size;
}

async function recordFindings(prisma: PrismaClient): Promise<void> {
  for (const finding of report.findings) {
    await prisma.migrationException.upsert({
      where: {
        domain_entityType_entityId_code: {
          domain: finding.domain,
          entityType: finding.entityType,
          entityId: finding.entityId,
          code: finding.code,
        },
      },
      create: {
        domain: finding.domain,
        entityType: finding.entityType,
        entityId: finding.entityId,
        code: finding.code,
        details: {
          severity: finding.severity,
          migrationScript: 'migrate-target-foundation.ts',
          ...finding.details,
        },
      },
      update: {
        status: 'OPEN',
        resolvedAt: null,
        resolvedBy: null,
        details: {
          severity: finding.severity,
          migrationScript: 'migrate-target-foundation.ts',
          ...finding.details,
        },
      },
    });
  }
}

async function run(options: MigrationOptions): Promise<void> {
  const prisma = new PrismaClient();
  report.mode = options.apply ? 'APPLY' : options.verify ? 'VERIFY' : 'DRY_RUN';
  report.actorUserId = options.actorUserId ?? null;
  report.scopes = [...options.scopes];
  try {
    if (options.apply) {
      await assertActor(prisma, options.actorUserId!);
    }
    report.targetCountsBefore = await collectTargetCounts(prisma);

    if (options.scopes.has('projects')) {
      await migrateProjectState(prisma, options);
    }

    let legacyArchiveItems: LegacyArchiveItem[] = [];
    if (options.scopes.has('archive')) {
      legacyArchiveItems = await migrateArchiveStructure(prisma, options);
      await migrateArchiveFiles(prisma, options, legacyArchiveItems);
    }

    if (options.scopes.has('reviews')) {
      await migrateFileReviews(prisma, options);
      await migrateApprovalTasks(prisma, options);
    }

    collectDryRunValidationCounts();
    if (options.apply || options.verify) {
      await validateAppliedMigration(prisma);
    }
    if (options.apply) {
      await recordFindings(prisma);
    }
    report.targetCountsAfter = await collectTargetCounts(prisma);
    if (options.apply) {
      await prisma.operationLog.create({
        data: {
          userId: options.actorUserId!,
          module: 'migration',
          action: 'target_foundation_apply',
          targetType: 'Migration',
          targetId: options.actorUserId!,
          beforeData: report.targetCountsBefore,
          afterData: {
            scopes: [...options.scopes],
            planned: report.planned,
            writtenOrVerified: report.writtenOrVerified,
            validation: report.validation,
            targetCountsAfter: report.targetCountsAfter,
            findingCount: report.findings.length,
          },
          result: 'success',
          traceId: `target-foundation:${Date.now()}`,
        },
      });
    }

    const summary = {
      ...report,
      findingSummary: {
        total: report.findings.length,
        errors: report.findings.filter((finding) => finding.severity === 'ERROR').length,
        reviewRequired: report.findings.filter((finding) => finding.severity === 'REVIEW').length,
      },
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (options.strict && report.findings.length > 0) {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

function start(): void {
  let options: MigrationOptions;
  try {
    options = parseMigrationOptions(process.argv.slice(2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Invalid migration arguments: ${message}\n`);
    process.stderr.write('Run with --help for usage.\n');
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  void run(options).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Target foundation migration failed: ${message}\n`);
    process.exitCode = 1;
  });
}

start();
