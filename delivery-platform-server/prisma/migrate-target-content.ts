import { Prisma, PrismaClient } from '@prisma/client';
import { Client as MinioClient } from 'minio';
import { basename, extname } from 'path';
import { v5 as uuidv5 } from 'uuid';

import {
  parseTargetContentMigrationOptions,
  targetContentErrorsAreBlocking,
  TARGET_CONTENT_MIGRATION_HELP,
} from './target-content-migration-options';
import {
  buildStandardGeneratedObjectPlan,
  isArchiveStateConsistent,
  isPrimaryFileVersionStatusValid,
  validateKnowledgePrimaryContent,
  verifyStoredObject,
} from './target-content-migration-support';

const prisma = new PrismaClient();
const namespace = '4f06e048-f6fb-4df8-bb93-2571db0e6f45';
const args = process.argv.slice(2);
let apply = false;
let verify = false;
let strict = false;
let actorUserId: string | undefined;
let actorUsername: string | undefined;
const plannedStandardFileBackfills = new Set<string>();
const plannedSourceMappings = new Set<string>();
const knowledgeDryRunRollback = new Error('KNOWLEDGE_DRY_RUN_ROLLBACK');

interface SourceMappingPlan {
  domain: Finding['domain'];
  entityType: string;
  entityId: string;
}

interface Finding {
  domain: 'STANDARD' | 'KNOWLEDGE';
  entityType: string;
  entityId: string;
  code: string;
  severity: 'WARNING' | 'ERROR';
  details: Prisma.InputJsonObject;
}

interface IntegrityCounts {
  standards: number;
  standardVersions: number;
  standardFileBackfillRequired: number;
  standardFileReferencesInvalid: number;
  standardStorageObjectsInvalid: number;
  standardPublishedPointersInvalid: number;
  knowledgeItems: number;
  knowledgeVersions: number;
  knowledgePrimaryContentInvalid: number;
  knowledgeFileReferencesInvalid: number;
  knowledgeStorageObjectsInvalid: number;
  knowledgePublishedPointersInvalid: number;
  knowledgeArchiveStatesInvalid: number;
  openContentMigrationExceptions: number;
  logicalFiles: number;
  fileAssets: number;
  fileVersions: number;
  knowledgeSupportingFiles: number;
  sourceTargetMappingsInvalid: number;
  targetAggregatesWithoutVersions: number;
}

interface MigrationReport {
  mode: 'DRY_RUN' | 'APPLY' | 'VERIFY';
  scanned: Record<string, number>;
  planned: Record<string, number>;
  createdOrVerified: Record<string, number>;
  integrityBefore?: IntegrityCounts;
  integrityAfter?: IntegrityCounts;
  findings: Finding[];
}

const report: MigrationReport = {
  mode: apply ? 'APPLY' : 'DRY_RUN',
  scanned: {},
  planned: {},
  createdOrVerified: {},
  findings: [],
};

interface LegacyObjectDescriptor {
  sourceKey: string;
  storageBucket: string;
  storageKey: string;
  originalName: string;
  extension: string;
  mimeType: string;
  size: bigint;
  uploadedBy: string;
  uploadedAt: Date;
  checksum?: string | null;
}

interface VerifiedLegacyObjectDescriptor extends LegacyObjectDescriptor {
  checksum: string;
  verified: true;
}

let storageConfig: { client: MinioClient; defaultBucket: string } | null | undefined;

function stableId(value: string): string {
  return uuidv5(value, namespace);
}

function getStorageConfig(): { client: MinioClient; defaultBucket: string } | null {
  if (storageConfig !== undefined) return storageConfig;
  const rawEndpoint = process.env.MINIO_ENDPOINT?.trim();
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;
  const defaultBucket = process.env.MINIO_BUCKET;
  if (!rawEndpoint || !accessKey || !secretKey || !defaultBucket) {
    storageConfig = null;
    return storageConfig;
  }
  const endpointHasProtocol = /^https?:\/\//iu.test(rawEndpoint);
  const endpointUrl = new URL(endpointHasProtocol ? rawEndpoint : `http://${rawEndpoint}`);
  const endpoint = endpointUrl.hostname;
  const port = Number(endpointUrl.port || process.env.MINIO_PORT || 9000);
  const useSSL = endpointHasProtocol
    ? endpointUrl.protocol === 'https:'
    : process.env.MINIO_USE_SSL === 'true';
  storageConfig = {
    client: new MinioClient({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    }),
    defaultBucket,
  };
  return storageConfig;
}

function descriptorFromAttachment(attachment: {
  id: string;
  originalName: string;
  fileExt: string;
  fileSize: bigint;
  mimeType: string;
  storageBucket: string;
  storagePath: string;
  uploadedBy: string;
  createdAt: Date;
}): LegacyObjectDescriptor {
  return {
    sourceKey: `attachment:${attachment.id}`,
    storageBucket: attachment.storageBucket,
    storageKey: attachment.storagePath,
    originalName: attachment.originalName,
    extension: attachment.fileExt.replace(/^\./u, '').toLowerCase(),
    mimeType: attachment.mimeType,
    size: attachment.fileSize,
    uploadedBy: attachment.uploadedBy,
    uploadedAt: attachment.createdAt,
  };
}

async function verifyLegacyObjectDescriptor(
  descriptor: LegacyObjectDescriptor,
): Promise<VerifiedLegacyObjectDescriptor | null> {
  const config = getStorageConfig();
  if (!config || descriptor.size > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const verification = await verifyStoredObject(config.client, {
    bucket: descriptor.storageBucket,
    key: descriptor.storageKey,
    expectedSize: Number(descriptor.size),
    expectedChecksum: descriptor.checksum,
  });
  if (!verification.ok || !verification.actualChecksum) return null;
  return {
    ...descriptor,
    checksum: verification.actualChecksum,
    verified: true,
  };
}

async function descriptorFromStoragePath(
  sourceKey: string,
  storagePath: string,
  uploadedBy: string,
  uploadedAt: Date,
  fallbackExtension?: string | null,
): Promise<VerifiedLegacyObjectDescriptor | null> {
  if (!storagePath.trim() || /^https?:\/\//iu.test(storagePath)) return null;
  const config = getStorageConfig();
  if (!config) return null;
  let bucket = config.defaultBucket;
  let key = storagePath
    .trim()
    .replace(/\\/gu, '/')
    .replace(/^\/+|\/+$/gu, '');
  if (key.startsWith('s3://')) {
    const segments = key.slice(5).split('/');
    bucket = segments.shift() || bucket;
    key = segments.join('/');
  } else if (key.startsWith(`${bucket}/`)) {
    key = key.slice(bucket.length + 1);
  }
  if (!key || key.split('/').some((segment) => segment === '..')) return null;
  try {
    const stat = await config.client.statObject(bucket, key);
    const originalName = decodeURIComponent(basename(key));
    const extension = (fallbackExtension || extname(originalName))
      .replace(/^\./u, '')
      .toLowerCase();
    const metadata = stat.metaData as Record<string, string | undefined>;
    return verifyLegacyObjectDescriptor({
      sourceKey,
      storageBucket: bucket,
      storageKey: key,
      originalName,
      extension,
      mimeType: metadata['content-type'] || mimeTypeFor(extension),
      size: BigInt(stat.size),
      uploadedBy,
      uploadedAt: stat.lastModified || uploadedAt,
      checksum: stat.etag || null,
    });
  } catch {
    return null;
  }
}

function mimeTypeFor(extension: string): string {
  const values: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    md: 'text/markdown',
    markdown: 'text/markdown',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  };
  return values[extension] || 'application/octet-stream';
}

function processingTypesFor(extension: string, size: bigint): string[] {
  const normalized = extension.toLowerCase();
  const types = new Set<string>();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(normalized)) {
    types.add('THUMBNAIL');
    if (size >= BigInt(20 * 1024 * 1024)) types.add('LARGE_IMAGE_TILE');
  } else if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(normalized)) {
    types.add('PDF_PREVIEW');
    types.add('THUMBNAIL');
  } else if (normalized === 'pdf') {
    types.add('THUMBNAIL');
  } else if (['dwg', 'dxf'].includes(normalized)) {
    types.add('CAD_CONVERT');
    types.add('THUMBNAIL');
  } else if (['vsd', 'vsdx'].includes(normalized)) {
    types.add('VISIO_CONVERT');
    types.add('THUMBNAIL');
  } else if (normalized === 'xmind') {
    types.add('XMIND_PARSE');
  } else if (['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(normalized)) {
    types.add('VIDEO_TRANSCODE');
    types.add('THUMBNAIL');
  }
  return Array.from(types);
}

async function ensureLegacyFile(
  tx: Prisma.TransactionClient,
  descriptor: VerifiedLegacyObjectDescriptor,
  ownerType: 'STANDARD' | 'KNOWLEDGE',
  ownerId: string,
  status: 'DRAFT' | 'APPROVED',
  logicalArchivedAt: Date | null = null,
): Promise<string> {
  const logicalFileId = stableId(`legacy-file:${descriptor.sourceKey}:logical`);
  const preferredAssetId = stableId(`legacy-file:${descriptor.sourceKey}:asset`);
  const preferredFileVersionId = stableId(`legacy-file:${descriptor.sourceKey}:version`);
  const logicalFileStatus = logicalArchivedAt ? 'ARCHIVED' : status;
  const existingLogicalFile = await tx.logicalFile.findUnique({
    where: { id: logicalFileId },
    select: { ownerType: true, ownerId: true, status: true, archivedAt: true },
  });
  if (
    existingLogicalFile &&
    (existingLogicalFile.ownerType !== ownerType ||
      existingLogicalFile.ownerId !== ownerId ||
      (!logicalArchivedAt &&
        (existingLogicalFile.status === 'ARCHIVED' || existingLogicalFile.archivedAt !== null)))
  ) {
    throw new Error('LEGACY_LOGICAL_FILE_ID_COLLISION');
  }
  if (!existingLogicalFile) {
    await tx.logicalFile.create({
      data: {
        id: logicalFileId,
        ownerType,
        ownerId,
        displayName: descriptor.originalName,
        status: logicalFileStatus,
        createdBy: descriptor.uploadedBy,
        archivedAt: logicalArchivedAt,
      },
    });
  }

  const assetByObject = await tx.fileAsset.findUnique({
    where: {
      storageBucket_storageKey: {
        storageBucket: descriptor.storageBucket,
        storageKey: descriptor.storageKey,
      },
    },
    select: {
      id: true,
      ownerType: true,
      ownerId: true,
      size: true,
      checksum: true,
      storageProvider: true,
      status: true,
      archivedAt: true,
    },
  });
  if (
    assetByObject &&
    (assetByObject.ownerType !== ownerType ||
      assetByObject.ownerId !== ownerId ||
      assetByObject.size !== descriptor.size ||
      assetByObject.storageProvider.toLowerCase() !== 'minio' ||
      assetByObject.status !== 'AVAILABLE' ||
      (Boolean(assetByObject.checksum?.match(/^[a-f\d]{64}$/iu)) &&
        assetByObject.checksum?.toLowerCase() !== descriptor.checksum.toLowerCase()) ||
      assetByObject.archivedAt !== null)
  ) {
    throw new Error('LEGACY_FILE_ASSET_OBJECT_COLLISION');
  }
  const assetById = assetByObject
    ? null
    : await tx.fileAsset.findUnique({ where: { id: preferredAssetId }, select: { id: true } });
  if (assetById) throw new Error('LEGACY_FILE_ASSET_ID_COLLISION');
  const assetId = assetByObject?.id ?? preferredAssetId;
  if (assetByObject && !/^[a-f\d]{64}$/iu.test(assetByObject.checksum ?? '')) {
    const checksumUpdate = await tx.fileAsset.updateMany({
      where: { id: assetByObject.id, checksum: assetByObject.checksum },
      data: { checksum: descriptor.checksum },
    });
    if (checksumUpdate.count !== 1) throw new Error('LEGACY_FILE_ASSET_CHECKSUM_CONFLICT');
  }
  if (!assetByObject) {
    await tx.fileAsset.create({
      data: {
        id: assetId,
        ownerType,
        ownerId,
        originalName: descriptor.originalName,
        extension: descriptor.extension,
        mimeType: descriptor.mimeType,
        size: descriptor.size,
        storageProvider: 'minio',
        storageBucket: descriptor.storageBucket,
        storageKey: descriptor.storageKey,
        checksum: descriptor.checksum,
        status: 'AVAILABLE',
        createdBy: descriptor.uploadedBy,
        createdAt: descriptor.uploadedAt,
      },
    });
  }
  for (const type of processingTypesFor(descriptor.extension, descriptor.size)) {
    const existingJob = await tx.fileProcessingJob.findFirst({
      where: { fileAssetId: assetId, type },
      select: { id: true },
    });
    if (!existingJob) {
      await tx.fileProcessingJob.create({
        data: {
          id: stableId(`file-processing:${assetId}:${type}`),
          fileAssetId: assetId,
          type,
          status: 'PENDING',
          progress: 0,
        },
      });
    }
  }
  const existingFileVersion = await tx.fileVersion.findUnique({
    where: {
      logicalFileId_version: { logicalFileId, version: 'V1.0' },
    },
    select: { id: true, assetId: true, status: true, archivedAt: true },
  });
  if (
    existingFileVersion &&
    (existingFileVersion.assetId !== assetId ||
      existingFileVersion.status === 'ARCHIVED' ||
      existingFileVersion.archivedAt !== null)
  ) {
    throw new Error('LEGACY_FILE_VERSION_OBJECT_COLLISION');
  }
  if (!existingFileVersion) {
    const fileVersionIdCollision = await tx.fileVersion.findUnique({
      where: { id: preferredFileVersionId },
      select: { id: true },
    });
    if (fileVersionIdCollision) throw new Error('LEGACY_FILE_VERSION_ID_COLLISION');
    await tx.fileVersion.create({
      data: {
        id: preferredFileVersionId,
        logicalFileId,
        version: 'V1.0',
        versionSequence: 1,
        revisionLevel: 'MINOR',
        assetId,
        status,
        changeDescription: '历史文件索引迁移',
        uploadedBy: descriptor.uploadedBy,
        uploadedAt: descriptor.uploadedAt,
        approvedAt: status === 'APPROVED' ? descriptor.uploadedAt : null,
      },
    });
  }
  const fileVersionId = existingFileVersion?.id ?? preferredFileVersionId;
  const logicalFileUpdate = await tx.logicalFile.updateMany({
    where: {
      id: logicalFileId,
      OR: [{ currentVersionId: null }, { currentVersionId: fileVersionId }],
    },
    data: {
      currentVersionId: fileVersionId,
      status: logicalFileStatus,
      archivedAt: logicalArchivedAt,
    },
  });
  if (logicalFileUpdate.count !== 1) throw new Error('LEGACY_LOGICAL_FILE_CURRENT_CONFLICT');
  return fileVersionId;
}

function increment(key: string, target: Record<string, number>): void {
  target[key] = (target[key] ?? 0) + 1;
}

function sourceMappingKey(plan: SourceMappingPlan): string {
  return `${plan.domain}\u0000${plan.entityType}\u0000${plan.entityId}`;
}

function markSourceMappingPlanned(plan: SourceMappingPlan): void {
  const mappingKey = sourceMappingKey(plan);
  if (plannedSourceMappings.has(mappingKey)) return;
  plannedSourceMappings.add(mappingKey);
  increment('sourceMappings', report.planned);
}

function markDeterministicSourceMappingsPlanned(): void {
  for (const finding of report.findings) {
    if (
      finding.code === 'TARGET_CONTENT_SOURCE_MAPPING_INVALID' &&
      plannedSourceMappings.has(
        sourceMappingKey({
          domain: finding.domain,
          entityType: finding.entityType,
          entityId: finding.entityId,
        }),
      )
    ) {
      finding.severity = 'WARNING';
      finding.details = { ...finding.details, deterministicMigrationPlanned: true };
    }
  }
}

function markDeterministicStandardBackfillsPlanned(): void {
  for (const finding of report.findings) {
    if (
      finding.code === 'STANDARD_FILE_VERSION_REQUIRED' &&
      plannedStandardFileBackfills.has(finding.entityId)
    ) {
      finding.severity = 'WARNING';
      finding.details = { ...finding.details, deterministicBackfillPlanned: true };
    }
  }
}

const managedFindingCodes = new Set([
  'TARGET_CONTENT_SOURCE_MAPPING_INVALID',
  'TARGET_CONTENT_AGGREGATE_WITHOUT_VERSION',
  'TARGET_CODE_COLLISION',
  'STANDARD_TARGET_MIGRATION_CONFLICT',
  'LEGACY_FILE_OBJECT_UNAVAILABLE',
  'DOCUMENT_TEMPLATE_SOURCE_OBJECT_REQUIRED',
  'STANDARD_OBJECT_STORAGE_UNAVAILABLE',
  'STANDARD_STORAGE_BUCKET_UNAVAILABLE',
  'STANDARD_GENERATED_OBJECT_INVALID',
  'STANDARD_FILE_BACKFILL_CONFLICT',
  'STANDARD_FILE_BACKFILL_OBJECT_CLEANUP_FAILED',
  'STANDARD_PRIMARY_FILE_AND_MIGRATION_SOURCE_MISSING',
  'STANDARD_FILE_VERSION_REQUIRED',
  'STANDARD_PRIMARY_FILE_REFERENCE_INVALID',
  'STANDARD_PRIMARY_FILE_STATUS_INVALID',
  'STANDARD_PRIMARY_FILE_CHECKSUM_INVALID',
  'STANDARD_PRIMARY_STORAGE_VERIFICATION_UNAVAILABLE',
  'STANDARD_PRIMARY_STORAGE_OBJECT_INVALID',
  'STANDARD_CURRENT_PUBLISHED_POINTER_INVALID',
  'MIXED_LEGACY_CONTENT',
  'LEGACY_ATTACHMENT_OBJECT_UNAVAILABLE',
  'KNOWLEDGE_PRIMARY_FILE_UNAVAILABLE',
  'IN_FLIGHT_REVIEW_REQUIRES_MANUAL_RECONCILIATION',
  'KNOWLEDGE_TARGET_MIGRATION_CONFLICT',
  'KNOWLEDGE_CONTENT_TYPE_UNSUPPORTED',
  'KNOWLEDGE_PRIMARY_CONTENT_MISSING',
  'KNOWLEDGE_MULTIPLE_PRIMARY_CONTENTS',
  'KNOWLEDGE_PRIMARY_CONTENT_TYPE_MISMATCH',
  'KNOWLEDGE_EXTERNAL_URL_INVALID',
  'KNOWLEDGE_PRIMARY_CONTENT_INVALID',
  'KNOWLEDGE_PRIMARY_FILE_REFERENCE_INVALID',
  'KNOWLEDGE_PRIMARY_FILE_STATUS_INVALID',
  'KNOWLEDGE_PRIMARY_FILE_CHECKSUM_INVALID',
  'KNOWLEDGE_PRIMARY_STORAGE_VERIFICATION_UNAVAILABLE',
  'KNOWLEDGE_PRIMARY_STORAGE_OBJECT_INVALID',
  'KNOWLEDGE_SUPPORTING_FILE_ROLE_INVALID',
  'KNOWLEDGE_SUPPORTING_FILE_REFERENCE_INVALID',
  'KNOWLEDGE_SUPPORTING_FILE_CHECKSUM_INVALID',
  'KNOWLEDGE_SUPPORTING_STORAGE_VERIFICATION_UNAVAILABLE',
  'KNOWLEDGE_SUPPORTING_STORAGE_OBJECT_INVALID',
  'KNOWLEDGE_LEGACY_ATTACHMENT_FILE_REFERENCE_INVALID',
  'KNOWLEDGE_LEGACY_ATTACHMENT_FILE_CHECKSUM_INVALID',
  'KNOWLEDGE_LEGACY_ATTACHMENT_STORAGE_VERIFICATION_UNAVAILABLE',
  'KNOWLEDGE_LEGACY_ATTACHMENT_STORAGE_OBJECT_INVALID',
  'KNOWLEDGE_ITEM_CONTENT_TYPE_UNSUPPORTED',
  'KNOWLEDGE_ITEM_ARCHIVE_STATE_INVALID',
  'KNOWLEDGE_VERSION_ARCHIVE_STATE_INVALID',
  'KNOWLEDGE_CURRENT_PUBLISHED_POINTER_INVALID',
  'TARGET_FILE_CHECKSUM_BACKFILL_UNAVAILABLE',
  'TARGET_FILE_CHECKSUM_BACKFILL_FAILED',
  'TARGET_FILE_CHECKSUM_CONCURRENT_CHANGE',
  'TARGET_CONTENT_ROW_COUNT_DECREASED',
]);

function addFinding(
  domain: Finding['domain'],
  entityType: string,
  entityId: string,
  code: string,
  details: Prisma.InputJsonObject,
  severity: Finding['severity'] = 'WARNING',
): void {
  report.findings.push({ domain, entityType, entityId, code, severity, details });
}

function publishedStatus(status: string): boolean {
  return ['active', 'published'].includes(status.toLowerCase());
}

async function assertActor(): Promise<string> {
  if (!actorUserId && !actorUsername) {
    throw new Error('--apply requires --actor-user-id or --actor-username');
  }
  const actor = await prisma.user.findFirst({
    where: {
      ...(actorUserId ? { id: actorUserId } : { username: actorUsername }),
      status: 'Active',
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!actor) throw new Error('Migration actor does not exist or is not active');
  actorUserId = actor.id;
  return actor.id;
}

async function ensureStandard(input: {
  id: string;
  code: string;
  name: string;
  type: string;
  category?: string | null;
  versionId: string;
  version: string;
  status: 'DRAFT' | 'PUBLISHED';
  createdBy: string;
  structuredContent: Prisma.InputJsonValue;
  applicability?: Prisma.InputJsonValue;
  legacySnapshot: Prisma.InputJsonValue;
  publishedAt?: Date | null;
  legacyFile?: VerifiedLegacyObjectDescriptor | null;
  sourceMapping?: SourceMappingPlan;
}): Promise<void> {
  const [collision, standardById, versionByIdentity, versionById] = await Promise.all([
    prisma.standard.findUnique({
      where: { code: input.code },
      select: { id: true },
    }),
    prisma.standard.findUnique({
      where: { id: input.id },
      select: { code: true },
    }),
    prisma.standardVersion.findUnique({
      where: {
        standardId_version: {
          standardId: input.id,
          version: input.version,
        },
      },
      select: {
        id: true,
        fileVersionId: true,
        legacySnapshot: true,
      },
    }),
    prisma.standardVersion.findUnique({
      where: { id: input.versionId },
      select: {
        standardId: true,
        version: true,
      },
    }),
  ]);
  if (collision && collision.id !== input.id) {
    addFinding(
      'STANDARD',
      'Standard',
      input.id,
      'TARGET_CODE_COLLISION',
      {
        code: input.code,
        conflictingStandardId: collision.id,
      },
      'ERROR',
    );
    return;
  }
  const expectedLegacyFileVersionId = input.legacyFile
    ? stableId(`legacy-file:${input.legacyFile.sourceKey}:version`)
    : null;
  const conflictReason =
    standardById && standardById.code !== input.code
      ? 'STANDARD_ID_COLLISION'
      : versionByIdentity && versionByIdentity.id !== input.versionId
        ? 'STANDARD_VERSION_IDENTITY_COLLISION'
        : versionById &&
            (versionById.standardId !== input.id || versionById.version !== input.version)
          ? 'STANDARD_VERSION_ID_COLLISION'
          : versionByIdentity &&
              input.sourceMapping &&
              jsonString(versionByIdentity.legacySnapshot, 'sourceId') !==
                input.sourceMapping.entityId
            ? 'STANDARD_VERSION_SOURCE_MAPPING_CONFLICT'
            : expectedLegacyFileVersionId &&
                versionByIdentity &&
                versionByIdentity.fileVersionId !== null &&
                versionByIdentity.fileVersionId !== expectedLegacyFileVersionId
              ? 'STANDARD_VERSION_FILE_CONFLICT'
              : null;
  if (conflictReason) {
    addFinding(
      'STANDARD',
      'Standard',
      input.id,
      'STANDARD_TARGET_MIGRATION_CONFLICT',
      { reason: conflictReason },
      'ERROR',
    );
    return;
  }
  if (!apply) {
    if (input.sourceMapping) markSourceMappingPlanned(input.sourceMapping);
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const fileVersionId = input.legacyFile
        ? await ensureLegacyFile(
            tx,
            input.legacyFile,
            'STANDARD',
            input.id,
            input.status === 'PUBLISHED' ? 'APPROVED' : 'DRAFT',
          )
        : null;
      await tx.standard.upsert({
        where: { id: input.id },
        create: {
          id: input.id,
          code: input.code,
          name: input.name,
          type: input.type,
          category: input.category,
          status: input.status,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
        update: {},
      });
      const targetVersion = await tx.standardVersion.upsert({
        where: {
          standardId_version: {
            standardId: input.id,
            version: input.version,
          },
        },
        create: {
          id: input.versionId,
          standardId: input.id,
          version: input.version,
          fileVersionId,
          structuredContent: input.structuredContent,
          applicability: input.applicability,
          legacySnapshot: input.legacySnapshot,
          status: input.status,
          submittedBy: input.createdBy,
          publishedAt: input.publishedAt,
        },
        update: {},
        select: { id: true, fileVersionId: true },
      });
      if (fileVersionId && targetVersion.fileVersionId !== fileVersionId) {
        const generatedFallbackId = stableId(`standard-content:${targetVersion.id}:file-version`);
        if (targetVersion.fileVersionId && targetVersion.fileVersionId !== generatedFallbackId) {
          throw new Error('STANDARD_VERSION_FILE_CONFLICT');
        }
        const linked = await tx.standardVersion.updateMany({
          where: {
            id: targetVersion.id,
            fileVersionId: targetVersion.fileVersionId ?? null,
          },
          data: { fileVersionId },
        });
        if (linked.count !== 1) throw new Error('STANDARD_VERSION_FILE_CONCURRENT_CHANGE');
      }
      if (input.status === 'PUBLISHED') {
        await tx.standard.updateMany({
          where: {
            id: input.id,
            OR: [
              { currentPublishedVersionId: null },
              { currentPublishedVersionId: targetVersion.id },
            ],
          },
          data: {
            status: 'PUBLISHED',
            currentPublishedVersionId: targetVersion.id,
          },
        });
      }
    });
  } catch (error: unknown) {
    addFinding(
      'STANDARD',
      'Standard',
      input.id,
      'STANDARD_TARGET_MIGRATION_CONFLICT',
      { reason: error instanceof Error ? error.message : 'UNKNOWN' },
      'ERROR',
    );
    return;
  }
  increment('standards', report.createdOrVerified);
}

async function migrateWorkflows(actorId: string): Promise<void> {
  const documents = await prisma.workflowDocument.findMany({
    include: { category: { select: { name: true } } },
  });
  report.scanned.workflows = documents.length;
  for (const document of documents) {
    const standardId = stableId(`standard:workflow:${document.id}`);
    const versionId = stableId(`standard:workflow:${document.id}:${document.version}`);
    await ensureStandard({
      id: standardId,
      code: `WF-${document.id}`.slice(0, 50),
      name: document.name,
      type: 'DELIVERY_WORKFLOW',
      category: document.category.name,
      versionId,
      version: document.version,
      status: publishedStatus(document.status) ? 'PUBLISHED' : 'DRAFT',
      createdBy: actorId,
      structuredContent: {
        applicableScope: document.applicableScope,
        triggerCondition: document.triggerCondition,
        inputMaterials: document.inputMaterials,
        outputMaterials: document.outputMaterials,
        responsibleRole: document.responsibleRole,
        steps: document.steps,
        relatedChecklist: document.relatedChecklist,
        relatedTemplates: document.relatedTemplates,
        relatedArchive: document.relatedArchive,
        riskNotes: document.riskNotes,
      },
      legacySnapshot: {
        sourceTable: 'workflow_documents',
        sourceId: document.id,
        sourceStatus: document.status,
      },
      publishedAt: publishedStatus(document.status) ? document.updatedAt : null,
      sourceMapping: {
        domain: 'STANDARD',
        entityType: 'WorkflowDocument',
        entityId: document.id,
      },
    });
  }
}

async function migrateChecklists(actorId: string): Promise<void> {
  const templates = await prisma.checklistTemplate.findMany({
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  report.scanned.checklistTemplates = templates.length;
  for (const template of templates) {
    const standardId = stableId(`standard:checklist:${template.id}`);
    const versionId = stableId(`standard:checklist:${template.id}:${template.version}`);
    await ensureStandard({
      id: standardId,
      code: `CHK-${template.templateCode}`.slice(0, 50),
      name: template.templateName,
      type: 'CHECK_STANDARD',
      category: '检查标准',
      versionId,
      version: template.version,
      status: publishedStatus(template.status) ? 'PUBLISHED' : 'DRAFT',
      createdBy: actorId,
      structuredContent: {
        items: template.items.map((item) => ({
          legacyId: item.id,
          name: item.itemName,
          description: item.itemDescription,
          checkStandard: item.checkStandard,
          evidenceRequired: item.evidenceRequired,
          relatedArchiveTemplateItemId: item.relatedArchiveTemplateItemId,
          required: item.isRequired,
          riskLevel: item.riskLevel,
          responsibleRole: item.responsibleRole,
          reviewRole: item.reviewRole,
          evidenceTypes: item.evidenceTypes,
          minEvidenceCount: item.minEvidenceCount,
          allowAlbum: item.allowAlbum,
          requireLocation: item.requireLocation,
          sortOrder: item.sortOrder,
        })),
      },
      applicability: {
        countryCode: template.countryCode,
        projectType: template.projectType,
        stageCode: template.stageCode,
      },
      legacySnapshot: {
        sourceTable: 'checklist_templates',
        sourceId: template.id,
        sourceStatus: template.status,
      },
      publishedAt: publishedStatus(template.status) ? template.updatedAt : null,
      sourceMapping: {
        domain: 'STANDARD',
        entityType: 'ChecklistTemplate',
        entityId: template.id,
      },
    });
  }
}

async function migrateDocumentTemplates(actorId: string): Promise<void> {
  const templates = await prisma.documentTemplate.findMany({
    include: { versions: { orderBy: { publishedAt: 'asc' } } },
  });
  report.scanned.documentTemplates = templates.length;
  for (const template of templates) {
    const standardId = stableId(`standard:document-template:${template.id}`);
    const versions = template.versions.length
      ? template.versions
      : [
          {
            id: template.id,
            versionNo: 'V1.0',
            storagePath: template.storagePath ?? '',
            changeNotes: null,
            publisherId: template.authorId,
            publishedAt: template.publishedAt ?? template.createdAt,
            createdAt: template.createdAt,
            templateId: template.id,
          },
        ];
    for (const version of versions) {
      const versionId = stableId(`standard:document-template:${template.id}:${version.versionNo}`);
      const isCurrent = version === versions[versions.length - 1];
      const legacyStoragePath = version.storagePath || template.storagePath;
      const legacyFile = legacyStoragePath
        ? await descriptorFromStoragePath(
            `document-template-version:${version.id}`,
            legacyStoragePath,
            version.publisherId ?? template.authorId ?? actorId,
            version.publishedAt,
            template.fileFormat,
          )
        : null;
      const isPublished =
        isCurrent &&
        publishedStatus(template.status) &&
        (!legacyStoragePath || Boolean(legacyFile));
      await ensureStandard({
        id: standardId,
        code: `DOC-${template.templateNo}`.slice(0, 50),
        name: template.name,
        type: 'DOCUMENT_TEMPLATE',
        category: template.category,
        versionId,
        version: version.versionNo,
        status: isPublished ? 'PUBLISHED' : 'DRAFT',
        createdBy: template.authorId ?? actorId,
        structuredContent: {
          fileFormat: template.fileFormat,
          legacyStoragePath,
          changeNotes: version.changeNotes,
        },
        applicability: {
          countryCode: template.countryCode,
          projectType: template.projectType,
          stageCode: template.stageCode,
          applicableRole: template.applicableRole,
          language: template.language,
        },
        legacySnapshot: {
          sourceTable: 'document_template_versions',
          sourceId: version.id,
          storagePath: legacyStoragePath,
          sourceStatus: template.status,
        },
        publishedAt: isPublished ? version.publishedAt : null,
        legacyFile,
        sourceMapping:
          !legacyStoragePath || legacyFile
            ? {
                domain: 'STANDARD',
                entityType: 'DocumentTemplateVersion',
                entityId: version.id,
              }
            : undefined,
      });
      if (legacyStoragePath && !legacyFile) {
        addFinding(
          'STANDARD',
          'DocumentTemplateVersion',
          version.id,
          'LEGACY_FILE_OBJECT_UNAVAILABLE',
          {
            targetStandardId: standardId,
            targetVersionId: versionId,
            storagePath: legacyStoragePath,
          },
          'ERROR',
        );
      }
    }
  }
}

function knowledgeContentType(article: {
  markdownContent: string | null;
  fileUrl: string | null;
  contentType: string;
}): 'MARKDOWN' | 'FILE' | 'LINK' {
  if (article.markdownContent?.trim()) return 'MARKDOWN';
  if (
    article.contentType.toLowerCase() === 'link' &&
    /^https?:\/\//iu.test(article.fileUrl ?? '')
  ) {
    return 'LINK';
  }
  if (article.fileUrl) return 'FILE';
  return article.contentType.toLowerCase() === 'link' ? 'LINK' : 'MARKDOWN';
}

async function migrateKnowledge(): Promise<void> {
  const articles = await prisma.knowledgeArticle.findMany({
    include: {
      versions: { orderBy: { createdAt: 'asc' } },
      category: { select: { id: true } },
    },
  });
  report.scanned.knowledgeArticles = articles.length;
  for (const article of articles) {
    const findingStart = report.findings.length;
    const attachments = await prisma.attachment.findMany({
      where: {
        ownerType: 'KnowledgeArticle',
        ownerId: article.id,
      },
      select: {
        id: true,
        originalName: true,
        fileExt: true,
        fileSize: true,
        mimeType: true,
        storageBucket: true,
        storagePath: true,
        uploadedBy: true,
        deletedAt: true,
        createdAt: true,
      },
    });
    const itemId = stableId(`knowledge:${article.id}`);
    const contentType = knowledgeContentType(article);
    const attachmentVerification = await Promise.all(
      attachments.map(async (attachment) => ({
        attachment,
        descriptor: await verifyLegacyObjectDescriptor(descriptorFromAttachment(attachment)),
      })),
    );
    const activeAttachments = attachments.filter((attachment) => attachment.deletedAt === null);
    const attachmentDescriptors = attachmentVerification.flatMap(({ attachment, descriptor }) =>
      attachment.deletedAt === null && descriptor ? [descriptor] : [],
    );
    for (const { attachment, descriptor } of attachmentVerification) {
      if (descriptor) continue;
      addFinding(
        'KNOWLEDGE',
        'Attachment',
        attachment.id,
        'LEGACY_ATTACHMENT_OBJECT_UNAVAILABLE',
        {
          targetKnowledgeItemId: itemId,
          sourceArticleId: article.id,
          storageBucket: attachment.storageBucket,
          storagePath: attachment.storagePath,
          deletedAt: attachment.deletedAt?.toISOString() ?? null,
        },
        'ERROR',
      );
    }
    const legacyUrlDescriptor = article.fileUrl
      ? await descriptorFromStoragePath(
          `knowledge-article:${article.id}:file-url`,
          article.fileUrl,
          article.authorId,
          article.updatedAt,
          article.fileExt,
        )
      : null;
    const matchingAttachment = article.fileUrl
      ? attachmentDescriptors.find(
          (descriptor) =>
            article.fileUrl === descriptor.storageKey ||
            article.fileUrl?.endsWith(`/${descriptor.storageKey}`),
        )
      : undefined;
    const primaryFile =
      contentType === 'FILE'
        ? (matchingAttachment ??
          legacyUrlDescriptor ??
          (attachmentDescriptors.length === 1 ? attachmentDescriptors[0] : null))
        : null;
    const supportingFiles = attachmentDescriptors.filter(
      (descriptor) => descriptor.sourceKey !== primaryFile?.sourceKey,
    );
    if (
      contentType === 'MARKDOWN' &&
      legacyUrlDescriptor &&
      !supportingFiles.some(
        (descriptor) =>
          descriptor.storageBucket === legacyUrlDescriptor.storageBucket &&
          descriptor.storageKey === legacyUrlDescriptor.storageKey,
      )
    ) {
      supportingFiles.push(legacyUrlDescriptor);
    }
    const fileMigrationPending = contentType === 'FILE' && !primaryFile;
    const sourcePublished = article.status === 'Published';
    const targetArchivedAt =
      article.deletedAt ?? (article.status === 'Archived' ? article.updatedAt : null);
    const targetArchived = targetArchivedAt !== null;
    const targetPublished = sourcePublished && !fileMigrationPending && !targetArchived;
    const targetItemStatus = targetArchived ? 'ARCHIVED' : targetPublished ? 'PUBLISHED' : 'DRAFT';
    if (article.markdownContent?.trim() && (article.fileUrl || activeAttachments.length > 0)) {
      addFinding(
        'KNOWLEDGE',
        'KnowledgeArticle',
        article.id,
        'MIXED_LEGACY_CONTENT',
        {
          selectedPrimaryType: 'MARKDOWN',
          attachmentCount: activeAttachments.length,
          hasFileUrl: Boolean(article.fileUrl),
        },
        'ERROR',
      );
    }
    if (fileMigrationPending) {
      addFinding(
        'KNOWLEDGE',
        'KnowledgeArticle',
        article.id,
        'KNOWLEDGE_PRIMARY_FILE_UNAVAILABLE',
        {
          targetKnowledgeItemId: itemId,
          attachmentIds: activeAttachments.map((attachment) => attachment.id),
          legacyFileUrl: article.fileUrl,
          reason:
            attachmentDescriptors.length > 1
              ? 'AMBIGUOUS_PRIMARY_ATTACHMENT'
              : 'STORAGE_OBJECT_NOT_FOUND_OR_EXTERNAL_URL',
        },
        'ERROR',
      );
    }
    if (article.status === 'Reviewing') {
      addFinding(
        'KNOWLEDGE',
        'KnowledgeArticle',
        article.id,
        'IN_FLIGHT_REVIEW_REQUIRES_MANUAL_RECONCILIATION',
        { sourceStatus: article.status },
        'ERROR',
      );
    }
    if (
      !apply &&
      report.findings.slice(findingStart).some((finding) => finding.severity === 'ERROR')
    ) {
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const targetItem = await tx.knowledgeItem.upsert({
          where: { id: itemId },
          create: {
            id: itemId,
            title: article.title,
            categoryId: article.category.id,
            summary: article.background?.slice(0, 1000),
            contentType,
            status: targetItemStatus,
            createdBy: article.authorId,
            updatedBy: article.authorId,
            archivedAt: targetArchivedAt,
          },
          update: {
            status: targetItemStatus,
            archivedAt: targetArchivedAt,
            ...(!targetPublished ? { currentPublishedVersionId: null, effectiveAt: null } : {}),
          },
          select: {
            id: true,
            title: true,
            categoryId: true,
            contentType: true,
            status: true,
            createdBy: true,
            archivedAt: true,
          },
        });
        if (
          targetItem.id !== itemId ||
          targetItem.title !== article.title ||
          targetItem.categoryId !== article.category.id ||
          targetItem.contentType !== contentType ||
          targetItem.status !== targetItemStatus ||
          targetItem.createdBy !== article.authorId ||
          !isArchiveStateConsistent(targetItem.status, targetItem.archivedAt) ||
          (targetArchived && targetItem.archivedAt === null)
        ) {
          throw new Error('KNOWLEDGE_ITEM_TARGET_MISMATCH');
        }

        for (const { attachment, descriptor } of attachmentVerification) {
          if (!attachment.deletedAt || !descriptor) continue;
          await ensureLegacyFile(
            tx,
            descriptor,
            'KNOWLEDGE',
            itemId,
            'DRAFT',
            attachment.deletedAt,
          );
        }

        const sourceVersions = new Map(
          article.versions.map((version) => [
            version.version,
            {
              version: version.version,
              markdownContent: version.markdownContent,
              changeDescription: version.changeNotes,
              submittedBy: version.createdBy,
              createdAt: version.createdAt,
            },
          ]),
        );
        sourceVersions.set(article.version, {
          version: article.version,
          markdownContent: article.markdownContent,
          changeDescription: '旧知识文章当前版本迁移',
          submittedBy: article.authorId,
          createdAt: article.updatedAt,
        });

        let resolvedCurrentVersionId: string | null = null;
        for (const sourceVersion of sourceVersions.values()) {
          const versionId = stableId(`knowledge:${article.id}:${sourceVersion.version}`);
          const isCurrent = sourceVersion.version === article.version;
          const primaryFileVersionId =
            isCurrent && primaryFile
              ? await ensureLegacyFile(
                  tx,
                  primaryFile,
                  'KNOWLEDGE',
                  itemId,
                  targetPublished ? 'APPROVED' : 'DRAFT',
                )
              : null;
          const supportingFileVersionIds: string[] = [];
          if (isCurrent) {
            for (const supportingFile of supportingFiles) {
              supportingFileVersionIds.push(
                await ensureLegacyFile(
                  tx,
                  supportingFile,
                  'KNOWLEDGE',
                  itemId,
                  targetPublished ? 'APPROVED' : 'DRAFT',
                ),
              );
            }
          }
          const targetContentType = isCurrent ? contentType : 'MARKDOWN';
          const targetExternalUrl =
            isCurrent && contentType === 'LINK' && /^https?:\/\//iu.test(article.fileUrl ?? '')
              ? article.fileUrl
              : null;
          const expectedFileVersionId = targetContentType === 'FILE' ? primaryFileVersionId : null;
          const expectedMarkdown =
            targetContentType === 'MARKDOWN' ? sourceVersion.markdownContent : null;
          const expectedExternalUrl = targetContentType === 'LINK' ? targetExternalUrl : null;
          const targetVersionStatus = targetArchived
            ? 'ARCHIVED'
            : isCurrent && targetPublished
              ? 'PUBLISHED'
              : 'DRAFT';
          const targetVersionPublishedAt =
            isCurrent && targetPublished ? (article.publishedAt ?? article.updatedAt) : null;
          const targetVersion = await tx.knowledgeVersion.upsert({
            where: {
              knowledgeItemId_version: {
                knowledgeItemId: itemId,
                version: sourceVersion.version,
              },
            },
            create: {
              id: versionId,
              knowledgeItemId: itemId,
              version: sourceVersion.version,
              contentType: targetContentType,
              fileVersionId: expectedFileVersionId,
              markdownContent: expectedMarkdown,
              externalUrl: expectedExternalUrl,
              status: targetVersionStatus,
              changeDescription: sourceVersion.changeDescription,
              submittedBy: sourceVersion.submittedBy,
              publishedAt: targetVersionPublishedAt,
              archivedAt: targetArchivedAt,
              legacySnapshot: {
                sourceTable: 'knowledge_articles',
                sourceArticleId: article.id,
                sourceVersion: sourceVersion.version,
                fileUrl: isCurrent ? article.fileUrl : null,
                fileSize: isCurrent ? (article.fileSize?.toString() ?? null) : null,
                fileExt: isCurrent ? article.fileExt : null,
                attachments: isCurrent
                  ? attachments.map((attachment) => ({
                      ...attachment,
                      fileSize: attachment.fileSize.toString(),
                      deletedAt: attachment.deletedAt?.toISOString() ?? null,
                      createdAt: attachment.createdAt.toISOString(),
                    }))
                  : [],
              },
            },
            update: {
              status: targetVersionStatus,
              publishedAt: targetVersionPublishedAt,
              archivedAt: targetArchivedAt,
            },
            select: {
              id: true,
              contentType: true,
              fileVersionId: true,
              markdownContent: true,
              externalUrl: true,
              legacySnapshot: true,
              status: true,
              archivedAt: true,
            },
          });
          if (isCurrent) resolvedCurrentVersionId = targetVersion.id;
          if (
            targetVersion.id !== versionId ||
            targetVersion.contentType !== targetContentType ||
            jsonString(targetVersion.legacySnapshot, 'sourceArticleId') !== article.id ||
            jsonString(targetVersion.legacySnapshot, 'sourceVersion') !== sourceVersion.version ||
            targetVersion.status !== targetVersionStatus ||
            !isArchiveStateConsistent(targetVersion.status, targetVersion.archivedAt) ||
            (targetArchived && targetVersion.archivedAt === null) ||
            (targetVersion.fileVersionId !== null &&
              targetVersion.fileVersionId !== expectedFileVersionId) ||
            (targetVersion.markdownContent !== null &&
              targetVersion.markdownContent !== expectedMarkdown) ||
            (targetVersion.externalUrl !== null &&
              targetVersion.externalUrl !== expectedExternalUrl)
          ) {
            throw new Error('KNOWLEDGE_VERSION_TARGET_MISMATCH');
          }
          const hasConflictingRepresentation =
            (targetContentType !== 'FILE' && targetVersion.fileVersionId !== null) ||
            (targetContentType !== 'MARKDOWN' && Boolean(targetVersion.markdownContent?.trim())) ||
            (targetContentType !== 'LINK' && Boolean(targetVersion.externalUrl?.trim()));
          if (targetVersion.contentType === targetContentType && !hasConflictingRepresentation) {
            if (
              targetContentType === 'FILE' &&
              !targetVersion.fileVersionId &&
              expectedFileVersionId
            ) {
              await tx.knowledgeVersion.updateMany({
                where: { id: targetVersion.id, fileVersionId: null },
                data: { fileVersionId: expectedFileVersionId },
              });
            } else if (
              targetContentType === 'MARKDOWN' &&
              !targetVersion.markdownContent?.trim() &&
              expectedMarkdown?.trim()
            ) {
              await tx.knowledgeVersion.updateMany({
                where: { id: targetVersion.id, markdownContent: null },
                data: { markdownContent: expectedMarkdown },
              });
            } else if (
              targetContentType === 'LINK' &&
              !targetVersion.externalUrl?.trim() &&
              expectedExternalUrl
            ) {
              await tx.knowledgeVersion.updateMany({
                where: { id: targetVersion.id, externalUrl: null },
                data: { externalUrl: expectedExternalUrl },
              });
            }
          }
          for (const [sortOrder, fileVersionId] of supportingFileVersionIds.entries()) {
            await tx.knowledgeVersionFile.upsert({
              where: {
                knowledgeVersionId_fileVersionId: {
                  knowledgeVersionId: targetVersion.id,
                  fileVersionId,
                },
              },
              create: {
                id: stableId(`knowledge-version-file:${targetVersion.id}:${fileVersionId}`),
                knowledgeVersionId: targetVersion.id,
                fileVersionId,
                role: 'SUPPORTING',
                sortOrder,
              },
              update: {},
            });
          }
          const assertedVersion = await tx.knowledgeVersion.findUnique({
            where: { id: targetVersion.id },
            select: {
              fileVersionId: true,
              markdownContent: true,
              externalUrl: true,
            },
          });
          if (
            !assertedVersion ||
            assertedVersion.fileVersionId !== expectedFileVersionId ||
            assertedVersion.markdownContent !== expectedMarkdown ||
            assertedVersion.externalUrl !== expectedExternalUrl
          ) {
            throw new Error('KNOWLEDGE_VERSION_CONTENT_MISMATCH');
          }
        }
        if (targetPublished && resolvedCurrentVersionId) {
          await tx.knowledgeItem.updateMany({
            where: {
              id: itemId,
              OR: [
                { currentPublishedVersionId: null },
                { currentPublishedVersionId: resolvedCurrentVersionId },
              ],
            },
            data: {
              status: 'PUBLISHED',
              currentPublishedVersionId: resolvedCurrentVersionId,
              effectiveAt: article.publishedAt ?? article.updatedAt,
            },
          });
        }
        if (!apply) {
          markSourceMappingPlanned({
            domain: 'KNOWLEDGE',
            entityType: 'KnowledgeArticle',
            entityId: article.id,
          });
          for (const sourceVersion of sourceVersions.values()) {
            markSourceMappingPlanned({
              domain: 'KNOWLEDGE',
              entityType: 'KnowledgeArticleVersion',
              entityId: `${article.id}:${sourceVersion.version}`,
            });
          }
          for (const { attachment, descriptor } of attachmentVerification) {
            if (!descriptor) continue;
            markSourceMappingPlanned({
              domain: 'KNOWLEDGE',
              entityType: 'Attachment',
              entityId: attachment.id,
            });
          }
          throw knowledgeDryRunRollback;
        }
      });
    } catch (error: unknown) {
      if (error === knowledgeDryRunRollback) continue;
      addFinding(
        'KNOWLEDGE',
        'KnowledgeArticle',
        article.id,
        'KNOWLEDGE_TARGET_MIGRATION_CONFLICT',
        { reason: error instanceof Error ? error.message : 'UNKNOWN' },
        'ERROR',
      );
      continue;
    }
    increment('knowledgeItems', report.createdOrVerified);
  }
}

function standardFileStatus(
  status: string,
): 'DRAFT' | 'REVIEWING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED' {
  const values: Record<string, 'DRAFT' | 'REVIEWING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'> = {
    DRAFT: 'DRAFT',
    IN_REVIEW: 'REVIEWING',
    PUBLISHED: 'APPROVED',
    REJECTED: 'REJECTED',
    ARCHIVED: 'ARCHIVED',
  };
  return values[status] ?? 'DRAFT';
}

async function removeUnboundGeneratedStandardObject(
  storage: NonNullable<ReturnType<typeof getStorageConfig>>,
  plan: ReturnType<typeof buildStandardGeneratedObjectPlan>,
): Promise<void> {
  const referenced = await prisma.fileAsset.findUnique({
    where: {
      storageBucket_storageKey: {
        storageBucket: storage.defaultBucket,
        storageKey: plan.storageKey,
      },
    },
    select: { id: true },
  });
  if (!referenced) {
    await storage.client.removeObject(storage.defaultBucket, plan.storageKey);
  }
}

async function ensureStandardGeneratedFile(input: {
  id: string;
  standardId: string;
  version: string;
  structuredContent: Prisma.JsonValue;
  applicability: Prisma.JsonValue | null;
  status: string;
  submittedBy: string;
  createdAt: Date;
  publishedAt: Date | null;
  standard: { code: string; name: string; type: string; category: string | null };
}): Promise<void> {
  const plan = buildStandardGeneratedObjectPlan({
    standardId: input.standardId,
    standardVersionId: input.id,
    code: input.standard.code,
    name: input.standard.name,
    type: input.standard.type,
    category: input.standard.category,
    version: input.version,
    structuredContent: input.structuredContent,
    applicability: input.applicability,
  });
  increment('standardFileBackfills', report.planned);
  const storage = getStorageConfig();
  if (!storage) {
    addFinding(
      'STANDARD',
      'StandardVersion',
      input.id,
      'STANDARD_OBJECT_STORAGE_UNAVAILABLE',
      { targetStandardId: input.standardId, storageKey: plan.storageKey },
      'ERROR',
    );
    return;
  }
  const bucketExists = await storage.client.bucketExists(storage.defaultBucket).catch(() => false);
  if (!bucketExists) {
    addFinding(
      'STANDARD',
      'StandardVersion',
      input.id,
      'STANDARD_STORAGE_BUCKET_UNAVAILABLE',
      { targetStandardId: input.standardId, storageBucket: storage.defaultBucket },
      'ERROR',
    );
    return;
  }
  const logicalFileId = stableId(`standard-content:${input.id}:logical-file`);
  const preferredAssetId = stableId(`standard-content:${input.id}:asset`);
  const fileVersionId = stableId(`standard-content:${input.id}:file-version`);
  const fileStatus = standardFileStatus(input.status);
  const [plannedLogicalFile, plannedAssetByObject, plannedAssetById, plannedFileVersion] =
    await Promise.all([
      prisma.logicalFile.findUnique({
        where: { id: logicalFileId },
        select: { ownerType: true, ownerId: true, currentVersionId: true },
      }),
      prisma.fileAsset.findUnique({
        where: {
          storageBucket_storageKey: {
            storageBucket: storage.defaultBucket,
            storageKey: plan.storageKey,
          },
        },
        select: {
          id: true,
          ownerType: true,
          ownerId: true,
          size: true,
          checksum: true,
          storageProvider: true,
          status: true,
          archivedAt: true,
        },
      }),
      prisma.fileAsset.findUnique({
        where: { id: preferredAssetId },
        select: { id: true },
      }),
      prisma.fileVersion.findUnique({
        where: { id: fileVersionId },
        select: {
          logicalFileId: true,
          assetId: true,
          version: true,
          status: true,
          archivedAt: true,
        },
      }),
    ]);
  let planConflict: string | undefined;
  if (
    plannedLogicalFile &&
    (plannedLogicalFile.ownerType !== 'STANDARD' ||
      plannedLogicalFile.ownerId !== input.standardId ||
      (plannedLogicalFile.currentVersionId !== null &&
        plannedLogicalFile.currentVersionId !== fileVersionId))
  ) {
    planConflict = 'LOGICAL_FILE_ID_COLLISION';
  }
  if (
    !planConflict &&
    plannedAssetByObject &&
    (plannedAssetByObject.ownerType !== 'STANDARD' ||
      plannedAssetByObject.ownerId !== input.standardId ||
      plannedAssetByObject.size !== BigInt(plan.body.length) ||
      plannedAssetByObject.checksum?.toLowerCase() !== plan.checksum ||
      plannedAssetByObject.storageProvider.toLowerCase() !== 'minio' ||
      plannedAssetByObject.status !== 'AVAILABLE' ||
      plannedAssetByObject.archivedAt !== null)
  ) {
    planConflict = 'FILE_ASSET_OBJECT_COLLISION';
  }
  if (!planConflict && plannedAssetById && plannedAssetByObject?.id !== plannedAssetById.id) {
    planConflict = 'FILE_ASSET_ID_COLLISION';
  }
  const plannedAssetId = plannedAssetByObject?.id ?? preferredAssetId;
  if (
    !planConflict &&
    plannedFileVersion &&
    (plannedFileVersion.logicalFileId !== logicalFileId ||
      plannedFileVersion.assetId !== plannedAssetId ||
      plannedFileVersion.version !== input.version ||
      plannedFileVersion.status !== fileStatus ||
      plannedFileVersion.archivedAt !== null)
  ) {
    planConflict = 'FILE_VERSION_ID_COLLISION';
  }
  if (planConflict) {
    addFinding(
      'STANDARD',
      'StandardVersion',
      input.id,
      'STANDARD_FILE_BACKFILL_CONFLICT',
      { targetStandardId: input.standardId, reason: planConflict },
      'ERROR',
    );
    return;
  }
  if (!apply) {
    plannedStandardFileBackfills.add(input.id);
    return;
  }

  let uploadedByThisRun = false;
  let objectVerification = await verifyStoredObject(storage.client, {
    bucket: storage.defaultBucket,
    key: plan.storageKey,
    expectedSize: plan.body.length,
    expectedChecksum: plan.checksum,
  });
  if (!objectVerification.ok && objectVerification.code === 'OBJECT_NOT_FOUND') {
    try {
      await storage.client.putObject(
        storage.defaultBucket,
        plan.storageKey,
        plan.body,
        plan.body.length,
        {
          'Content-Type': 'text/markdown; charset=utf-8',
          'x-amz-meta-content-sha256': plan.checksum,
          'x-amz-meta-migration-source': 'standard-structured-content',
        },
      );
      uploadedByThisRun = true;
      objectVerification = await verifyStoredObject(storage.client, {
        bucket: storage.defaultBucket,
        key: plan.storageKey,
        expectedSize: plan.body.length,
        expectedChecksum: plan.checksum,
      });
    } catch {
      objectVerification = { ok: false, code: 'OBJECT_STAT_FAILED' };
    }
  }
  if (!objectVerification.ok) {
    if (uploadedByThisRun) {
      try {
        await removeUnboundGeneratedStandardObject(storage, plan);
      } catch (cleanupError: unknown) {
        addFinding(
          'STANDARD',
          'StandardVersion',
          input.id,
          'STANDARD_FILE_BACKFILL_OBJECT_CLEANUP_FAILED',
          {
            targetStandardId: input.standardId,
            storageBucket: storage.defaultBucket,
            storageKey: plan.storageKey,
            reason: cleanupError instanceof Error ? cleanupError.message : 'UNKNOWN',
          },
          'ERROR',
        );
      }
    }
    addFinding(
      'STANDARD',
      'StandardVersion',
      input.id,
      'STANDARD_GENERATED_OBJECT_INVALID',
      {
        targetStandardId: input.standardId,
        storageBucket: storage.defaultBucket,
        storageKey: plan.storageKey,
        reason: objectVerification.code ?? 'UNKNOWN',
        expectedSize: plan.body.length,
        actualSize: objectVerification.actualSize ?? null,
      },
      'ERROR',
    );
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existingLogicalFile = await tx.logicalFile.findUnique({
        where: { id: logicalFileId },
        select: { ownerType: true, ownerId: true, currentVersionId: true },
      });
      if (
        existingLogicalFile &&
        (existingLogicalFile.ownerType !== 'STANDARD' ||
          existingLogicalFile.ownerId !== input.standardId)
      ) {
        throw new Error('LOGICAL_FILE_ID_COLLISION');
      }
      if (!existingLogicalFile) {
        await tx.logicalFile.create({
          data: {
            id: logicalFileId,
            ownerType: 'STANDARD',
            ownerId: input.standardId,
            displayName: plan.originalName,
            status: fileStatus,
            createdBy: input.submittedBy,
            createdAt: input.createdAt,
          },
        });
      }

      const assetByObject = await tx.fileAsset.findUnique({
        where: {
          storageBucket_storageKey: {
            storageBucket: storage.defaultBucket,
            storageKey: plan.storageKey,
          },
        },
        select: {
          id: true,
          ownerType: true,
          ownerId: true,
          size: true,
          checksum: true,
          archivedAt: true,
        },
      });
      const assetById = assetByObject
        ? null
        : await tx.fileAsset.findUnique({ where: { id: preferredAssetId }, select: { id: true } });
      if (assetById) throw new Error('FILE_ASSET_ID_COLLISION');
      if (
        assetByObject &&
        (assetByObject.ownerType !== 'STANDARD' ||
          assetByObject.ownerId !== input.standardId ||
          assetByObject.size !== BigInt(plan.body.length) ||
          assetByObject.checksum?.toLowerCase() !== plan.checksum ||
          assetByObject.archivedAt !== null)
      ) {
        throw new Error('FILE_ASSET_OBJECT_COLLISION');
      }
      const assetId = assetByObject?.id ?? preferredAssetId;
      if (!assetByObject) {
        await tx.fileAsset.create({
          data: {
            id: assetId,
            ownerType: 'STANDARD',
            ownerId: input.standardId,
            originalName: plan.originalName,
            extension: 'md',
            mimeType: 'text/markdown',
            size: BigInt(plan.body.length),
            storageProvider: 'minio',
            storageBucket: storage.defaultBucket,
            storageKey: plan.storageKey,
            checksum: plan.checksum,
            status: 'AVAILABLE',
            createdBy: input.submittedBy,
            createdAt: input.createdAt,
          },
        });
      }

      const existingFileVersion = await tx.fileVersion.findUnique({
        where: { id: fileVersionId },
        select: { logicalFileId: true, assetId: true, version: true },
      });
      if (
        existingFileVersion &&
        (existingFileVersion.logicalFileId !== logicalFileId ||
          existingFileVersion.assetId !== assetId ||
          existingFileVersion.version !== input.version)
      ) {
        throw new Error('FILE_VERSION_ID_COLLISION');
      }
      if (!existingFileVersion) {
        await tx.fileVersion.create({
          data: {
            id: fileVersionId,
            logicalFileId,
            version: input.version,
            versionSequence: 1,
            revisionLevel: 'MINOR',
            assetId,
            status: fileStatus,
            changeDescription: '结构化标准内容文件化迁移',
            uploadedBy: input.submittedBy,
            uploadedAt: input.createdAt,
            approvedAt:
              input.status === 'PUBLISHED' ? (input.publishedAt ?? input.createdAt) : null,
          },
        });
      }
      const logicalFileUpdate = await tx.logicalFile.updateMany({
        where: {
          id: logicalFileId,
          OR: [{ currentVersionId: null }, { currentVersionId: fileVersionId }],
        },
        data: { currentVersionId: fileVersionId, status: fileStatus },
      });
      if (logicalFileUpdate.count !== 1) throw new Error('LOGICAL_FILE_CURRENT_VERSION_CONFLICT');

      const versionUpdate = await tx.standardVersion.updateMany({
        where: { id: input.id, fileVersionId: null },
        data: { fileVersionId },
      });
      if (versionUpdate.count !== 1) {
        const current = await tx.standardVersion.findUnique({
          where: { id: input.id },
          select: { fileVersionId: true },
        });
        if (current?.fileVersionId !== fileVersionId) {
          throw new Error('STANDARD_VERSION_CONCURRENT_CONTENT_CHANGE');
        }
      }
    });
    increment('standardFileBackfills', report.createdOrVerified);
  } catch (error: unknown) {
    if (uploadedByThisRun) {
      try {
        await removeUnboundGeneratedStandardObject(storage, plan);
      } catch (cleanupError: unknown) {
        addFinding(
          'STANDARD',
          'StandardVersion',
          input.id,
          'STANDARD_FILE_BACKFILL_OBJECT_CLEANUP_FAILED',
          {
            targetStandardId: input.standardId,
            storageBucket: storage.defaultBucket,
            storageKey: plan.storageKey,
            reason: cleanupError instanceof Error ? cleanupError.message : 'UNKNOWN',
          },
          'ERROR',
        );
      }
    }
    addFinding(
      'STANDARD',
      'StandardVersion',
      input.id,
      'STANDARD_FILE_BACKFILL_CONFLICT',
      {
        targetStandardId: input.standardId,
        reason: error instanceof Error ? error.message : 'UNKNOWN',
      },
      'ERROR',
    );
  }
}

async function backfillStandardFiles(): Promise<void> {
  const versions = await prisma.standardVersion.findMany({
    where: { fileVersionId: null },
    select: {
      id: true,
      standardId: true,
      version: true,
      structuredContent: true,
      applicability: true,
      status: true,
      submittedBy: true,
      createdAt: true,
      publishedAt: true,
      legacySnapshot: true,
      standard: { select: { code: true, name: true, type: true, category: true } },
    },
    orderBy: [{ standardId: 'asc' }, { createdAt: 'asc' }],
  });
  report.scanned.standardVersionsForFileBackfill = versions.length;
  for (const version of versions) {
    const declaredLegacyStoragePath = jsonString(version.legacySnapshot, 'storagePath');
    if (version.standard.type === 'DOCUMENT_TEMPLATE' && declaredLegacyStoragePath) {
      addFinding(
        'STANDARD',
        'StandardVersion',
        version.id,
        'DOCUMENT_TEMPLATE_SOURCE_OBJECT_REQUIRED',
        {
          targetStandardId: version.standardId,
          storagePath: declaredLegacyStoragePath,
        },
        'ERROR',
      );
      continue;
    }
    if (version.structuredContent === null) {
      addFinding(
        'STANDARD',
        'StandardVersion',
        version.id,
        'STANDARD_PRIMARY_FILE_AND_MIGRATION_SOURCE_MISSING',
        { targetStandardId: version.standardId, version: version.version },
        'ERROR',
      );
      continue;
    }
    await ensureStandardGeneratedFile({
      ...version,
      structuredContent: version.structuredContent,
    });
  }
}

async function backfillTargetAssetChecksums(): Promise<void> {
  const assets = await prisma.fileAsset.findMany({
    where: {
      versions: {
        some: {
          OR: [
            { standardVersions: { some: {} } },
            { knowledgeVersionsV2: { some: {} } },
            { knowledgeVersionFiles: { some: {} } },
          ],
        },
      },
    },
    select: {
      id: true,
      ownerType: true,
      storageBucket: true,
      storageKey: true,
      size: true,
      checksum: true,
    },
    orderBy: { id: 'asc' },
  });
  for (const asset of assets) {
    const domain: Finding['domain'] = asset.ownerType === 'KNOWLEDGE' ? 'KNOWLEDGE' : 'STANDARD';
    if (asset.checksum && /^[a-f\d]{64}$/iu.test(asset.checksum)) continue;
    increment('targetAssetChecksumBackfills', report.planned);
    const storage = getStorageConfig();
    if (!storage || asset.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      addFinding(
        domain,
        'FileAsset',
        asset.id,
        'TARGET_FILE_CHECKSUM_BACKFILL_UNAVAILABLE',
        { storageBucket: asset.storageBucket, storageKey: asset.storageKey },
        'ERROR',
      );
      continue;
    }
    const verification = await verifyStoredObject(storage.client, {
      bucket: asset.storageBucket,
      key: asset.storageKey,
      expectedSize: Number(asset.size),
    });
    if (!verification.ok || !verification.actualChecksum) {
      addFinding(
        domain,
        'FileAsset',
        asset.id,
        'TARGET_FILE_CHECKSUM_BACKFILL_FAILED',
        {
          storageBucket: asset.storageBucket,
          storageKey: asset.storageKey,
          reason: verification.code ?? 'UNKNOWN',
        },
        'ERROR',
      );
      continue;
    }
    if (!apply) continue;
    const updated = await prisma.fileAsset.updateMany({
      where: { id: asset.id, checksum: asset.checksum },
      data: { checksum: verification.actualChecksum },
    });
    if (updated.count !== 1) {
      addFinding(
        domain,
        'FileAsset',
        asset.id,
        'TARGET_FILE_CHECKSUM_CONCURRENT_CHANGE',
        {},
        'ERROR',
      );
      continue;
    }
    increment('targetAssetChecksumBackfills', report.createdOrVerified);
  }
}

async function auditFileVersionStorage(input: {
  domain: Finding['domain'];
  entityType: string;
  entityId: string;
  ownerType: 'STANDARD' | 'KNOWLEDGE';
  ownerId: string;
  fileVersionId: string;
  codePrefix: string;
  contentVersionStatus?: string;
  logicalFileArchived?: boolean;
}): Promise<{ referenceValid: boolean; storageValid: boolean }> {
  const fileVersion = await prisma.fileVersion.findUnique({
    where: { id: input.fileVersionId },
    select: {
      id: true,
      status: true,
      archivedAt: true,
      logicalFile: {
        select: { ownerType: true, ownerId: true, status: true, archivedAt: true },
      },
      asset: {
        select: {
          ownerType: true,
          ownerId: true,
          storageProvider: true,
          storageBucket: true,
          storageKey: true,
          size: true,
          checksum: true,
          status: true,
          archivedAt: true,
        },
      },
    },
  });
  const logicalArchiveInvalid = input.logicalFileArchived
    ? fileVersion?.logicalFile.status !== 'ARCHIVED' || fileVersion.logicalFile.archivedAt === null
    : fileVersion?.logicalFile.status === 'ARCHIVED' ||
      fileVersion?.logicalFile.archivedAt !== null;
  if (
    !fileVersion ||
    fileVersion.logicalFile.ownerType !== input.ownerType ||
    fileVersion.logicalFile.ownerId !== input.ownerId ||
    fileVersion.asset.ownerType !== input.ownerType ||
    fileVersion.asset.ownerId !== input.ownerId ||
    fileVersion.archivedAt !== null ||
    fileVersion.asset.archivedAt !== null ||
    logicalArchiveInvalid ||
    fileVersion.status === 'ARCHIVED' ||
    fileVersion.asset.status !== 'AVAILABLE' ||
    fileVersion.asset.storageProvider.toLowerCase() !== 'minio'
  ) {
    addFinding(
      input.domain,
      input.entityType,
      input.entityId,
      `${input.codePrefix}_FILE_REFERENCE_INVALID`,
      {
        ownerId: input.ownerId,
        fileVersionId: input.fileVersionId,
        expectedLogicalFileArchived: input.logicalFileArchived ?? false,
      },
      'ERROR',
    );
    return { referenceValid: false, storageValid: false };
  }

  const primaryStatusInvalid =
    input.contentVersionStatus !== undefined &&
    !isPrimaryFileVersionStatusValid(input.contentVersionStatus, fileVersion.status);
  if (primaryStatusInvalid) {
    addFinding(
      input.domain,
      input.entityType,
      input.entityId,
      `${input.codePrefix}_FILE_STATUS_INVALID`,
      {
        ownerId: input.ownerId,
        fileVersionId: input.fileVersionId,
        contentVersionStatus: input.contentVersionStatus ?? null,
        actualFileVersionStatus: fileVersion.status,
        expectedFileVersionStatus: 'APPROVED',
      },
      'ERROR',
    );
  }
  const referenceValid = !primaryStatusInvalid;

  if (!fileVersion.asset.checksum || !/^[a-f\d]{64}$/iu.test(fileVersion.asset.checksum)) {
    addFinding(
      input.domain,
      input.entityType,
      input.entityId,
      `${input.codePrefix}_FILE_CHECKSUM_INVALID`,
      { ownerId: input.ownerId, fileVersionId: input.fileVersionId },
      'ERROR',
    );
    return { referenceValid, storageValid: false };
  }

  const storage = getStorageConfig();
  if (!storage || fileVersion.asset.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    addFinding(
      input.domain,
      input.entityType,
      input.entityId,
      `${input.codePrefix}_STORAGE_VERIFICATION_UNAVAILABLE`,
      {
        ownerId: input.ownerId,
        fileVersionId: input.fileVersionId,
        storageBucket: fileVersion.asset.storageBucket,
        storageKey: fileVersion.asset.storageKey,
      },
      'ERROR',
    );
    return { referenceValid, storageValid: false };
  }
  const result = await verifyStoredObject(storage.client, {
    bucket: fileVersion.asset.storageBucket,
    key: fileVersion.asset.storageKey,
    expectedSize: Number(fileVersion.asset.size),
    expectedChecksum: fileVersion.asset.checksum,
  });
  if (!result.ok) {
    addFinding(
      input.domain,
      input.entityType,
      input.entityId,
      `${input.codePrefix}_STORAGE_OBJECT_INVALID`,
      {
        ownerId: input.ownerId,
        fileVersionId: input.fileVersionId,
        storageBucket: fileVersion.asset.storageBucket,
        storageKey: fileVersion.asset.storageKey,
        reason: result.code ?? 'UNKNOWN',
        actualSize: result.actualSize ?? null,
      },
      'ERROR',
    );
    return { referenceValid, storageValid: false };
  }
  return { referenceValid, storageValid: true };
}

function emptyIntegrityCounts(): IntegrityCounts {
  return {
    standards: 0,
    standardVersions: 0,
    standardFileBackfillRequired: 0,
    standardFileReferencesInvalid: 0,
    standardStorageObjectsInvalid: 0,
    standardPublishedPointersInvalid: 0,
    knowledgeItems: 0,
    knowledgeVersions: 0,
    knowledgePrimaryContentInvalid: 0,
    knowledgeFileReferencesInvalid: 0,
    knowledgeStorageObjectsInvalid: 0,
    knowledgePublishedPointersInvalid: 0,
    knowledgeArchiveStatesInvalid: 0,
    openContentMigrationExceptions: 0,
    logicalFiles: 0,
    fileAssets: 0,
    fileVersions: 0,
    knowledgeSupportingFiles: 0,
    sourceTargetMappingsInvalid: 0,
    targetAggregatesWithoutVersions: 0,
  };
}

function jsonString(value: Prisma.JsonValue | null, key: string): string | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  const nested = value[key];
  return typeof nested === 'string' ? nested : null;
}

async function auditSourceTargetCoverage(counts: IntegrityCounts): Promise<void> {
  const missingMapping = (
    domain: Finding['domain'],
    entityType: string,
    entityId: string,
    details: Prisma.InputJsonObject,
  ): void => {
    counts.sourceTargetMappingsInvalid += 1;
    addFinding(
      domain,
      entityType,
      entityId,
      'TARGET_CONTENT_SOURCE_MAPPING_INVALID',
      details,
      'ERROR',
    );
  };

  const workflows = await prisma.workflowDocument.findMany({ select: { id: true, version: true } });
  for (const source of workflows) {
    const targetId = stableId(`standard:workflow:${source.id}:${source.version}`);
    const target = await prisma.standardVersion.findUnique({
      where: { id: targetId },
      select: { standardId: true, legacySnapshot: true },
    });
    if (
      !target ||
      target.standardId !== stableId(`standard:workflow:${source.id}`) ||
      jsonString(target.legacySnapshot, 'sourceId') !== source.id
    ) {
      missingMapping('STANDARD', 'WorkflowDocument', source.id, { targetVersionId: targetId });
    }
  }

  const checklists = await prisma.checklistTemplate.findMany({
    select: { id: true, version: true },
  });
  for (const source of checklists) {
    const targetId = stableId(`standard:checklist:${source.id}:${source.version}`);
    const target = await prisma.standardVersion.findUnique({
      where: { id: targetId },
      select: { standardId: true, legacySnapshot: true },
    });
    if (
      !target ||
      target.standardId !== stableId(`standard:checklist:${source.id}`) ||
      jsonString(target.legacySnapshot, 'sourceId') !== source.id
    ) {
      missingMapping('STANDARD', 'ChecklistTemplate', source.id, { targetVersionId: targetId });
    }
  }

  const templates = await prisma.documentTemplate.findMany({
    select: {
      id: true,
      storagePath: true,
      versions: { select: { id: true, versionNo: true, storagePath: true } },
    },
  });
  for (const template of templates) {
    const versions = template.versions.length
      ? template.versions
      : [{ id: template.id, versionNo: 'V1.0', storagePath: template.storagePath }];
    for (const source of versions) {
      const targetId = stableId(`standard:document-template:${template.id}:${source.versionNo}`);
      const declaredStoragePath = source.storagePath || template.storagePath;
      const expectedLegacyFileVersionId = declaredStoragePath
        ? stableId(`legacy-file:document-template-version:${source.id}:version`)
        : null;
      const target = await prisma.standardVersion.findUnique({
        where: { id: targetId },
        select: { standardId: true, fileVersionId: true, legacySnapshot: true },
      });
      if (
        !target ||
        target.standardId !== stableId(`standard:document-template:${template.id}`) ||
        jsonString(target.legacySnapshot, 'sourceId') !== source.id ||
        (expectedLegacyFileVersionId !== null &&
          target.fileVersionId !== expectedLegacyFileVersionId)
      ) {
        missingMapping('STANDARD', 'DocumentTemplateVersion', source.id, {
          targetVersionId: targetId,
          expectedLegacyFileVersionId,
          declaredStoragePath: declaredStoragePath || null,
        });
      }
    }
  }

  const articles = await prisma.knowledgeArticle.findMany({
    select: {
      id: true,
      version: true,
      status: true,
      deletedAt: true,
      versions: { select: { version: true } },
    },
  });
  for (const article of articles) {
    const targetItemId = stableId(`knowledge:${article.id}`);
    const sourceArchived = article.deletedAt !== null || article.status === 'Archived';
    const item = await prisma.knowledgeItem.findUnique({
      where: { id: targetItemId },
      select: { id: true, status: true, archivedAt: true },
    });
    if (
      !item ||
      (sourceArchived
        ? item.status !== 'ARCHIVED' || item.archivedAt === null
        : item.status === 'ARCHIVED' || item.archivedAt !== null)
    ) {
      missingMapping('KNOWLEDGE', 'KnowledgeArticle', article.id, {
        targetItemId,
        expectedArchived: sourceArchived,
      });
    }
    const versions = new Set(article.versions.map((version) => version.version));
    versions.add(article.version);
    for (const version of versions) {
      const targetVersionId = stableId(`knowledge:${article.id}:${version}`);
      const target = await prisma.knowledgeVersion.findUnique({
        where: { id: targetVersionId },
        select: {
          knowledgeItemId: true,
          legacySnapshot: true,
          status: true,
          archivedAt: true,
        },
      });
      if (
        !target ||
        target.knowledgeItemId !== targetItemId ||
        jsonString(target.legacySnapshot, 'sourceArticleId') !== article.id ||
        jsonString(target.legacySnapshot, 'sourceVersion') !== version ||
        (sourceArchived
          ? target.status !== 'ARCHIVED' || target.archivedAt === null
          : target.status === 'ARCHIVED' || target.archivedAt !== null)
      ) {
        missingMapping('KNOWLEDGE', 'KnowledgeArticleVersion', `${article.id}:${version}`, {
          targetVersionId,
          expectedArchived: sourceArchived,
        });
      }
    }
  }

  const attachments = await prisma.attachment.findMany({
    where: { ownerType: 'KnowledgeArticle' },
    select: { id: true, ownerId: true, deletedAt: true },
  });
  for (const attachment of attachments) {
    const targetKnowledgeItemId = stableId(`knowledge:${attachment.ownerId}`);
    const targetFileVersionId = stableId(`legacy-file:attachment:${attachment.id}:version`);
    const target = await prisma.fileVersion.findUnique({
      where: { id: targetFileVersionId },
      select: {
        logicalFile: {
          select: { ownerType: true, ownerId: true, status: true, archivedAt: true },
        },
      },
    });
    const expectedArchived = attachment.deletedAt !== null;
    if (
      !target ||
      target.logicalFile.ownerType !== 'KNOWLEDGE' ||
      target.logicalFile.ownerId !== targetKnowledgeItemId ||
      (expectedArchived
        ? target.logicalFile.status !== 'ARCHIVED' || target.logicalFile.archivedAt === null
        : target.logicalFile.status === 'ARCHIVED' || target.logicalFile.archivedAt !== null)
    ) {
      missingMapping('KNOWLEDGE', 'Attachment', attachment.id, {
        sourceKnowledgeArticleId: attachment.ownerId,
        targetKnowledgeItemId,
        targetFileVersionId,
        expectedArchived,
      });
      continue;
    }
    const fileAudit = await auditFileVersionStorage({
      domain: 'KNOWLEDGE',
      entityType: 'Attachment',
      entityId: attachment.id,
      ownerType: 'KNOWLEDGE',
      ownerId: targetKnowledgeItemId,
      fileVersionId: targetFileVersionId,
      codePrefix: 'KNOWLEDGE_LEGACY_ATTACHMENT',
      logicalFileArchived: expectedArchived,
    });
    if (!fileAudit.referenceValid) counts.sourceTargetMappingsInvalid += 1;
    if (!fileAudit.storageValid) counts.knowledgeStorageObjectsInvalid += 1;
  }

  const [standardsWithoutVersions, knowledgeWithoutVersions] = await Promise.all([
    prisma.standard.count({ where: { versions: { none: {} } } }),
    prisma.knowledgeItem.count({ where: { versions: { none: {} } } }),
  ]);
  counts.targetAggregatesWithoutVersions = standardsWithoutVersions + knowledgeWithoutVersions;
  if (counts.targetAggregatesWithoutVersions > 0) {
    addFinding(
      'STANDARD',
      'TargetContentMigration',
      'aggregates-without-versions',
      'TARGET_CONTENT_AGGREGATE_WITHOUT_VERSION',
      { standardsWithoutVersions, knowledgeWithoutVersions },
      'ERROR',
    );
  }
}

async function auditTargetContent(includeOpenExceptions = false): Promise<IntegrityCounts> {
  const counts = emptyIntegrityCounts();
  const [
    standardsCount,
    knowledgeItemsCount,
    logicalFiles,
    fileAssets,
    fileVersions,
    supportingFiles,
  ] = await Promise.all([
    prisma.standard.count(),
    prisma.knowledgeItem.count(),
    prisma.logicalFile.count(),
    prisma.fileAsset.count(),
    prisma.fileVersion.count(),
    prisma.knowledgeVersionFile.count(),
  ]);
  counts.standards = standardsCount;
  counts.knowledgeItems = knowledgeItemsCount;
  counts.logicalFiles = logicalFiles;
  counts.fileAssets = fileAssets;
  counts.fileVersions = fileVersions;
  counts.knowledgeSupportingFiles = supportingFiles;
  await auditSourceTargetCoverage(counts);
  const standardVersions = await prisma.standardVersion.findMany({
    select: { id: true, standardId: true, version: true, status: true, fileVersionId: true },
    orderBy: { id: 'asc' },
  });
  counts.standardVersions = standardVersions.length;
  for (const version of standardVersions) {
    if (!version.fileVersionId) {
      counts.standardFileBackfillRequired += 1;
      addFinding(
        'STANDARD',
        'StandardVersion',
        version.id,
        'STANDARD_FILE_VERSION_REQUIRED',
        { targetStandardId: version.standardId, version: version.version },
        'ERROR',
      );
      continue;
    }
    const fileAudit = await auditFileVersionStorage({
      domain: 'STANDARD',
      entityType: 'StandardVersion',
      entityId: version.id,
      ownerType: 'STANDARD',
      ownerId: version.standardId,
      fileVersionId: version.fileVersionId,
      codePrefix: 'STANDARD_PRIMARY',
      contentVersionStatus: version.status,
    });
    if (!fileAudit.referenceValid) counts.standardFileReferencesInvalid += 1;
    if (!fileAudit.storageValid) counts.standardStorageObjectsInvalid += 1;
  }
  const standards = await prisma.standard.findMany({
    select: {
      id: true,
      status: true,
      currentPublishedVersionId: true,
      currentPublishedVersion: {
        select: { standardId: true, status: true, archivedAt: true },
      },
    },
  });
  for (const standard of standards) {
    const pointerRequired = standard.status === 'PUBLISHED';
    const pointerInvalid = standard.currentPublishedVersionId
      ? !standard.currentPublishedVersion ||
        standard.currentPublishedVersion.standardId !== standard.id ||
        standard.currentPublishedVersion.status !== 'PUBLISHED' ||
        standard.currentPublishedVersion.archivedAt !== null
      : pointerRequired;
    if (pointerInvalid) {
      counts.standardPublishedPointersInvalid += 1;
      addFinding(
        'STANDARD',
        'Standard',
        standard.id,
        'STANDARD_CURRENT_PUBLISHED_POINTER_INVALID',
        { currentPublishedVersionId: standard.currentPublishedVersionId },
        'ERROR',
      );
    }
  }

  const knowledgeVersions = await prisma.knowledgeVersion.findMany({
    select: {
      id: true,
      knowledgeItemId: true,
      contentType: true,
      fileVersionId: true,
      markdownContent: true,
      externalUrl: true,
      status: true,
      archivedAt: true,
      supportingFiles: { select: { fileVersionId: true, role: true } },
    },
    orderBy: { id: 'asc' },
  });
  counts.knowledgeVersions = knowledgeVersions.length;
  for (const version of knowledgeVersions) {
    if (!isArchiveStateConsistent(version.status, version.archivedAt)) {
      counts.knowledgeArchiveStatesInvalid += 1;
      addFinding(
        'KNOWLEDGE',
        'KnowledgeVersion',
        version.id,
        'KNOWLEDGE_VERSION_ARCHIVE_STATE_INVALID',
        { status: version.status, archivedAt: version.archivedAt?.toISOString() ?? null },
        'ERROR',
      );
    }
    const contentValidation = validateKnowledgePrimaryContent(version);
    if (!contentValidation.valid) {
      counts.knowledgePrimaryContentInvalid += 1;
      addFinding(
        'KNOWLEDGE',
        'KnowledgeVersion',
        version.id,
        contentValidation.code ?? 'KNOWLEDGE_PRIMARY_CONTENT_INVALID',
        {
          targetKnowledgeItemId: version.knowledgeItemId,
          contentType: version.contentType,
          populatedFields: contentValidation.populatedFields,
        },
        'ERROR',
      );
    }
    if (version.fileVersionId) {
      const fileAudit = await auditFileVersionStorage({
        domain: 'KNOWLEDGE',
        entityType: 'KnowledgeVersion',
        entityId: version.id,
        ownerType: 'KNOWLEDGE',
        ownerId: version.knowledgeItemId,
        fileVersionId: version.fileVersionId,
        codePrefix: 'KNOWLEDGE_PRIMARY',
        contentVersionStatus: version.status,
      });
      if (!fileAudit.referenceValid) counts.knowledgeFileReferencesInvalid += 1;
      if (!fileAudit.storageValid) counts.knowledgeStorageObjectsInvalid += 1;
    }
    for (const supportingFile of version.supportingFiles) {
      if (supportingFile.role !== 'SUPPORTING') {
        counts.knowledgeFileReferencesInvalid += 1;
        addFinding(
          'KNOWLEDGE',
          'KnowledgeVersion',
          version.id,
          'KNOWLEDGE_SUPPORTING_FILE_ROLE_INVALID',
          {
            targetKnowledgeItemId: version.knowledgeItemId,
            fileVersionId: supportingFile.fileVersionId,
            role: supportingFile.role,
          },
          'ERROR',
        );
        continue;
      }
      const fileAudit = await auditFileVersionStorage({
        domain: 'KNOWLEDGE',
        entityType: 'KnowledgeVersion',
        entityId: version.id,
        ownerType: 'KNOWLEDGE',
        ownerId: version.knowledgeItemId,
        fileVersionId: supportingFile.fileVersionId,
        codePrefix: 'KNOWLEDGE_SUPPORTING',
      });
      if (!fileAudit.referenceValid) counts.knowledgeFileReferencesInvalid += 1;
      if (!fileAudit.storageValid) counts.knowledgeStorageObjectsInvalid += 1;
    }
  }
  const knowledgeItems = await prisma.knowledgeItem.findMany({
    select: {
      id: true,
      status: true,
      archivedAt: true,
      contentType: true,
      currentPublishedVersionId: true,
      currentPublishedVersion: {
        select: {
          knowledgeItemId: true,
          status: true,
          contentType: true,
          archivedAt: true,
        },
      },
    },
  });
  for (const item of knowledgeItems) {
    if (!isArchiveStateConsistent(item.status, item.archivedAt)) {
      counts.knowledgeArchiveStatesInvalid += 1;
      addFinding(
        'KNOWLEDGE',
        'KnowledgeItem',
        item.id,
        'KNOWLEDGE_ITEM_ARCHIVE_STATE_INVALID',
        { status: item.status, archivedAt: item.archivedAt?.toISOString() ?? null },
        'ERROR',
      );
    }
    if (!['FILE', 'MARKDOWN', 'LINK'].includes(item.contentType)) {
      counts.knowledgePrimaryContentInvalid += 1;
      addFinding(
        'KNOWLEDGE',
        'KnowledgeItem',
        item.id,
        'KNOWLEDGE_ITEM_CONTENT_TYPE_UNSUPPORTED',
        { contentType: item.contentType },
        'ERROR',
      );
    }
    const pointerRequired = item.status === 'PUBLISHED';
    const pointerInvalid = item.currentPublishedVersionId
      ? !item.currentPublishedVersion ||
        item.currentPublishedVersion.knowledgeItemId !== item.id ||
        item.currentPublishedVersion.status !== 'PUBLISHED' ||
        item.currentPublishedVersion.contentType !== item.contentType ||
        item.currentPublishedVersion.archivedAt !== null
      : pointerRequired;
    if (pointerInvalid) {
      counts.knowledgePublishedPointersInvalid += 1;
      addFinding(
        'KNOWLEDGE',
        'KnowledgeItem',
        item.id,
        'KNOWLEDGE_CURRENT_PUBLISHED_POINTER_INVALID',
        { currentPublishedVersionId: item.currentPublishedVersionId },
        'ERROR',
      );
    }
  }
  if (includeOpenExceptions) {
    const openExceptions = await prisma.migrationException.findMany({
      where: { domain: { in: ['STANDARD', 'KNOWLEDGE'] }, status: 'OPEN' },
      select: { id: true, domain: true, entityType: true, entityId: true, code: true },
      orderBy: { id: 'asc' },
    });
    counts.openContentMigrationExceptions = openExceptions.length;
    for (const exception of openExceptions) {
      addFinding(
        exception.domain === 'STANDARD' ? 'STANDARD' : 'KNOWLEDGE',
        exception.entityType,
        exception.entityId,
        'OPEN_CONTENT_MIGRATION_EXCEPTION',
        { migrationExceptionId: exception.id, migrationExceptionCode: exception.code },
        'ERROR',
      );
    }
  }
  return counts;
}

function assertNonDecreasingTargetCounts(before: IntegrityCounts, after: IntegrityCounts): void {
  const protectedCounts: Array<
    keyof Pick<
      IntegrityCounts,
      | 'standards'
      | 'standardVersions'
      | 'knowledgeItems'
      | 'knowledgeVersions'
      | 'logicalFiles'
      | 'fileAssets'
      | 'fileVersions'
      | 'knowledgeSupportingFiles'
    >
  > = [
    'standards',
    'standardVersions',
    'knowledgeItems',
    'knowledgeVersions',
    'logicalFiles',
    'fileAssets',
    'fileVersions',
    'knowledgeSupportingFiles',
  ];
  for (const key of protectedCounts) {
    if (after[key] >= before[key]) continue;
    addFinding(
      key.startsWith('knowledge') ? 'KNOWLEDGE' : 'STANDARD',
      'TargetContentMigration',
      key,
      'TARGET_CONTENT_ROW_COUNT_DECREASED',
      { tableMetric: key, before: before[key], after: after[key] },
      'ERROR',
    );
  }
}

async function queueTargetFileProcessing(): Promise<void> {
  const assets = await prisma.fileAsset.findMany({
    where: { archivedAt: null },
    select: { id: true, extension: true, size: true },
  });
  report.scanned.fileAssetsForProcessing = assets.length;
  for (const asset of assets) {
    for (const type of processingTypesFor(asset.extension ?? '', asset.size)) {
      const existing = await prisma.fileProcessingJob.findFirst({
        where: { fileAssetId: asset.id, type },
        select: { id: true },
      });
      if (apply && !existing) {
        await prisma.fileProcessingJob.create({
          data: {
            id: stableId(`file-processing:${asset.id}:${type}`),
            fileAssetId: asset.id,
            type,
            status: 'PENDING',
            progress: 0,
          },
        });
      }
      increment('fileProcessingJobs', report.createdOrVerified);
    }
  }
}

async function recordFindings(): Promise<void> {
  if (!apply) return;
  const activeKeys = new Set(
    report.findings.map(
      (item) => `${item.domain}\u0000${item.entityType}\u0000${item.entityId}\u0000${item.code}`,
    ),
  );
  for (const item of report.findings) {
    const where = {
      domain_entityType_entityId_code: {
        domain: item.domain,
        entityType: item.entityType,
        entityId: item.entityId,
        code: item.code,
      },
    } as const;
    await prisma.migrationException.upsert({
      where: {
        ...where,
      },
      create: {
        domain: item.domain,
        entityType: item.entityType,
        entityId: item.entityId,
        code: item.code,
        details: {
          ...item.details,
          severity: item.severity,
          migration: 'TARGET_CONTENT_FILE_ONLY_V1',
        },
      },
      update: {
        details: {
          ...item.details,
          severity: item.severity,
          migration: 'TARGET_CONTENT_FILE_ONLY_V1',
        },
        status: 'OPEN',
        resolvedBy: null,
        resolvedAt: null,
      },
    });
  }
  const openManagedExceptions = await prisma.migrationException.findMany({
    where: {
      domain: { in: ['STANDARD', 'KNOWLEDGE'] },
      status: 'OPEN',
      code: { in: Array.from(managedFindingCodes) },
    },
    select: {
      id: true,
      domain: true,
      entityType: true,
      entityId: true,
      code: true,
      details: true,
    },
  });
  for (const exception of openManagedExceptions) {
    if (jsonString(exception.details, 'migration') !== 'TARGET_CONTENT_FILE_ONLY_V1') {
      continue;
    }
    const key = `${exception.domain}\u0000${exception.entityType}\u0000${exception.entityId}\u0000${exception.code}`;
    if (activeKeys.has(key)) continue;
    await prisma.migrationException.update({
      where: { id: exception.id },
      data: { status: 'RESOLVED', resolvedBy: actorUserId, resolvedAt: new Date() },
    });
  }
}

async function main(): Promise<void> {
  const options = parseTargetContentMigrationOptions(args);
  if (options.help) {
    process.stdout.write(TARGET_CONTENT_MIGRATION_HELP);
    return;
  }
  apply = options.apply;
  verify = options.verify;
  strict = options.strict;
  actorUserId = options.actorUserId;
  actorUsername = options.actorUsername;
  report.mode = apply ? 'APPLY' : verify ? 'VERIFY' : 'DRY_RUN';
  if (verify) {
    report.integrityBefore = await auditTargetContent(true);
    report.integrityAfter = report.integrityBefore;
    const errorCount = report.findings.filter((finding) => finding.severity === 'ERROR').length;
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (targetContentErrorsAreBlocking({ apply, strict }, errorCount)) {
      throw new Error(
        `strict target content verification failed with ${errorCount} error finding(s)`,
      );
    }
    return;
  }

  const beforeFindingCount = report.findings.length;
  report.integrityBefore = await auditTargetContent();
  if (apply) report.findings.splice(beforeFindingCount);
  const actorId = apply
    ? await assertActor()
    : (actorUserId ?? actorUsername ?? 'DRY_RUN_ACTOR_REQUIRED');
  await migrateWorkflows(actorId);
  await migrateChecklists(actorId);
  await migrateDocumentTemplates(actorId);
  await migrateKnowledge();
  await backfillStandardFiles();
  await backfillTargetAssetChecksums();
  await queueTargetFileProcessing();
  if (!apply) {
    markDeterministicStandardBackfillsPlanned();
    markDeterministicSourceMappingsPlanned();
  }
  report.integrityAfter = apply ? await auditTargetContent() : report.integrityBefore;
  if (apply) assertNonDecreasingTargetCounts(report.integrityBefore, report.integrityAfter);
  await recordFindings();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const applyErrorCount = report.findings.filter((finding) => finding.severity === 'ERROR').length;
  if (targetContentErrorsAreBlocking({ apply, strict }, applyErrorCount)) {
    const gate = apply ? 'apply' : 'strict dry-run';
    throw new Error(`target content ${gate} recorded ${applyErrorCount} error finding(s)`);
  }
}

void main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Target content migration failed: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
