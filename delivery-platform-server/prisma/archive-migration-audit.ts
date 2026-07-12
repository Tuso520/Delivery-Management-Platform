import { Prisma, PrismaClient } from '@prisma/client';

type Severity = 'ERROR' | 'REVIEW';

interface Finding {
  severity: Severity;
  domain: 'ARCHIVE' | 'FILE';
  entityType: string;
  entityId: string;
  code: string;
  details: Prisma.InputJsonObject;
}

interface HierarchyNode {
  id: string;
  parentId: string | null;
  scopeId: string;
  storedLevel: number;
}

const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));
const shouldRecord = args.has('--record-exceptions');
const strict = args.has('--strict');

function finding(
  severity: Severity,
  domain: Finding['domain'],
  entityType: string,
  entityId: string,
  code: string,
  details: Prisma.InputJsonObject,
): Finding {
  return { severity, domain, entityType, entityId, code, details };
}

function auditHierarchy(
  nodes: HierarchyNode[],
  entityType: string,
): Finding[] {
  const findings: Finding[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));

  for (const node of nodes) {
    const visited = new Set<string>([node.id]);
    let depth = 1;
    let current = node;

    while (current.parentId) {
      const parent = byId.get(current.parentId);
      if (!parent) {
        findings.push(
          finding('ERROR', 'ARCHIVE', entityType, node.id, 'ORPHAN_PARENT', {
            parentId: current.parentId,
          }),
        );
        break;
      }
      if (parent.scopeId !== node.scopeId) {
        findings.push(
          finding('ERROR', 'ARCHIVE', entityType, node.id, 'CROSS_SCOPE_PARENT', {
            parentId: parent.id,
            nodeScopeId: node.scopeId,
            parentScopeId: parent.scopeId,
          }),
        );
        break;
      }
      if (visited.has(parent.id)) {
        findings.push(
          finding('ERROR', 'ARCHIVE', entityType, node.id, 'HIERARCHY_CYCLE', {
            repeatedNodeId: parent.id,
          }),
        );
        break;
      }

      visited.add(parent.id);
      depth += 1;
      current = parent;
    }

    if (depth > 2) {
      findings.push(
        finding('ERROR', 'ARCHIVE', entityType, node.id, 'DEPTH_EXCEEDS_TWO', {
          depth,
        }),
      );
    }
    if (node.storedLevel !== depth) {
      findings.push(
        finding('REVIEW', 'ARCHIVE', entityType, node.id, 'STORED_LEVEL_MISMATCH', {
          storedLevel: node.storedLevel,
          computedDepth: depth,
        }),
      );
    }
  }

  return findings;
}

async function collectFindings(): Promise<Finding[]> {
  const [templateItems, projectItems, files, reviews] = await Promise.all([
    prisma.archiveTemplateItem.findMany({
      select: { id: true, templateId: true, parentId: true, level: true },
    }),
    prisma.projectArchiveItem.findMany({
      select: {
        id: true,
        projectId: true,
        templateItemId: true,
        parentId: true,
        level: true,
      },
    }),
    prisma.file.findMany({
      select: {
        id: true,
        projectId: true,
        archiveItemId: true,
        versionNo: true,
        isCurrent: true,
        storageBucket: true,
        storagePath: true,
        deletedAt: true,
      },
    }),
    prisma.fileReview.findMany({
      select: { id: true, fileId: true, archiveItemId: true },
    }),
  ]);

  const findings: Finding[] = [
    ...auditHierarchy(
      templateItems.map((item) => ({
        id: item.id,
        parentId: item.parentId,
        scopeId: item.templateId,
        storedLevel: item.level,
      })),
      'ArchiveTemplateItem',
    ),
    ...auditHierarchy(
      projectItems.map((item) => ({
        id: item.id,
        parentId: item.parentId,
        scopeId: item.projectId,
        storedLevel: item.level,
      })),
      'ProjectArchiveItem',
    ),
  ];

  const projectItemById = new Map(projectItems.map((item) => [item.id, item]));
  const childrenByParent = new Map<string, number>();
  for (const item of projectItems) {
    if (item.parentId) {
      childrenByParent.set(
        item.parentId,
        (childrenByParent.get(item.parentId) ?? 0) + 1,
      );
    }
  }

  const activeFilesByArchiveItem = new Map<string, number>();
  const activeFiles = files.filter((file) => file.deletedAt === null);
  for (const file of activeFiles) {
    if (file.archiveItemId) {
      activeFilesByArchiveItem.set(
        file.archiveItemId,
        (activeFilesByArchiveItem.get(file.archiveItemId) ?? 0) + 1,
      );
    }

    if (!file.storageBucket.trim() || !file.storagePath.trim()) {
      findings.push(
        finding('ERROR', 'FILE', 'File', file.id, 'MISSING_STORAGE_LOCATION', {
          storageBucket: file.storageBucket,
          storagePath: file.storagePath,
        }),
      );
    }

    if (file.archiveItemId) {
      const archiveItem = projectItemById.get(file.archiveItemId);
      if (!archiveItem) {
        findings.push(
          finding('ERROR', 'FILE', 'File', file.id, 'ORPHAN_ARCHIVE_ITEM', {
            archiveItemId: file.archiveItemId,
          }),
        );
      } else if (archiveItem.projectId !== file.projectId) {
        findings.push(
          finding('ERROR', 'FILE', 'File', file.id, 'CROSS_PROJECT_ARCHIVE_ITEM', {
            fileProjectId: file.projectId,
            archiveProjectId: archiveItem.projectId,
            archiveItemId: file.archiveItemId,
          }),
        );
      }
    }
  }

  for (const item of projectItems) {
    if (
      (childrenByParent.get(item.id) ?? 0) > 0 &&
      (activeFilesByArchiveItem.get(item.id) ?? 0) > 0
    ) {
      findings.push(
        finding(
          'REVIEW',
          'ARCHIVE',
          'ProjectArchiveItem',
          item.id,
          'FOLDER_WITH_DIRECT_FILES',
          {
            mapping: 'CREATE_FOLDER_AND_SYNTHETIC_SAME_NAME_ITEM',
            childCount: childrenByParent.get(item.id) ?? 0,
            fileCount: activeFilesByArchiveItem.get(item.id) ?? 0,
          },
        ),
      );
    }
  }

  const fileGroups = new Map<string, typeof activeFiles>();
  for (const file of activeFiles) {
    const groupKey = `${file.projectId}:${file.archiveItemId ?? 'UNASSIGNED'}`;
    const group = fileGroups.get(groupKey) ?? [];
    group.push(file);
    fileGroups.set(groupKey, group);
  }

  for (const [groupKey, group] of fileGroups) {
    const current = group.filter((file) => file.isCurrent);
    if (current.length > 1) {
      findings.push(
        finding('ERROR', 'FILE', 'LogicalFileCandidate', groupKey, 'MULTIPLE_CURRENT_FILES', {
          fileIds: current.map((file) => file.id),
        }),
      );
    }

    const versionToFileIds = new Map<string, string[]>();
    for (const file of group) {
      const fileIds = versionToFileIds.get(file.versionNo) ?? [];
      fileIds.push(file.id);
      versionToFileIds.set(file.versionNo, fileIds);
    }
    for (const [versionNo, fileIds] of versionToFileIds) {
      if (fileIds.length > 1) {
        findings.push(
          finding('ERROR', 'FILE', 'LogicalFileCandidate', groupKey, 'DUPLICATE_VERSION', {
            versionNo,
            fileIds,
          }),
        );
      }
    }
  }

  const fileById = new Map(files.map((file) => [file.id, file]));
  for (const review of reviews) {
    const file = fileById.get(review.fileId);
    if (!file) {
      findings.push(
        finding('ERROR', 'FILE', 'FileReview', review.id, 'ORPHAN_FILE', {
          fileId: review.fileId,
        }),
      );
    } else if (file.archiveItemId !== review.archiveItemId) {
      findings.push(
        finding('ERROR', 'FILE', 'FileReview', review.id, 'ARCHIVE_ITEM_MISMATCH', {
          reviewArchiveItemId: review.archiveItemId,
          fileArchiveItemId: file.archiveItemId,
        }),
      );
    }
  }

  return findings;
}

async function recordFindings(findings: Finding[]): Promise<void> {
  for (const item of findings) {
    await prisma.migrationException.upsert({
      where: {
        domain_entityType_entityId_code: {
          domain: item.domain,
          entityType: item.entityType,
          entityId: item.entityId,
          code: item.code,
        },
      },
      update: { details: item.details, status: 'OPEN', resolvedAt: null },
      create: {
        domain: item.domain,
        entityType: item.entityType,
        entityId: item.entityId,
        code: item.code,
        details: item.details,
      },
    });
  }
}

async function main(): Promise<void> {
  const findings = await collectFindings();
  if (shouldRecord) {
    await recordFindings(findings);
  }

  const summary = {
    mode: shouldRecord ? 'RECORD_EXCEPTIONS' : 'DRY_RUN',
    total: findings.length,
    errors: findings.filter((item) => item.severity === 'ERROR').length,
    reviewRequired: findings.filter((item) => item.severity === 'REVIEW').length,
    findings,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (strict && findings.length > 0) {
    process.exitCode = 2;
  }
}

void main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Archive migration audit failed: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
