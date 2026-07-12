import { Prisma, PrismaClient } from '@prisma/client';
import { Client as MinioClient } from 'minio';
import { basename, extname } from 'path';
import { v5 as uuidv5 } from 'uuid';

import {
  parseTargetContentMigrationOptions,
  TARGET_CONTENT_MIGRATION_HELP,
} from './target-content-migration-options';

const prisma = new PrismaClient();
const namespace = '4f06e048-f6fb-4df8-bb93-2571db0e6f45';
const args = process.argv.slice(2);
let apply = false;
let actorUserId: string | undefined;

interface Finding {
  domain: 'STANDARD' | 'KNOWLEDGE';
  entityType: string;
  entityId: string;
  code: string;
  details: Prisma.InputJsonObject;
}

interface MigrationReport {
  mode: 'DRY_RUN' | 'APPLY';
  scanned: Record<string, number>;
  createdOrVerified: Record<string, number>;
  findings: Finding[];
}

const report: MigrationReport = {
  mode: apply ? 'APPLY' : 'DRY_RUN',
  scanned: {},
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

async function descriptorFromStoragePath(
  sourceKey: string,
  storagePath: string,
  uploadedBy: string,
  uploadedAt: Date,
  fallbackExtension?: string | null,
): Promise<LegacyObjectDescriptor | null> {
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
    return {
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
    };
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
  descriptor: LegacyObjectDescriptor,
  ownerType: 'STANDARD' | 'KNOWLEDGE',
  ownerId: string,
  status: 'DRAFT' | 'APPROVED',
): Promise<string> {
  const logicalFileId = stableId(`legacy-file:${descriptor.sourceKey}:logical`);
  const preferredAssetId = stableId(`legacy-file:${descriptor.sourceKey}:asset`);
  const fileVersionId = stableId(`legacy-file:${descriptor.sourceKey}:version`);
  await tx.logicalFile.upsert({
    where: { id: logicalFileId },
    create: {
      id: logicalFileId,
      ownerType,
      ownerId,
      displayName: descriptor.originalName,
      status,
      createdBy: descriptor.uploadedBy,
    },
    update: {},
  });
  const existingAsset = await tx.fileAsset.findUnique({
    where: {
      storageBucket_storageKey: {
        storageBucket: descriptor.storageBucket,
        storageKey: descriptor.storageKey,
      },
    },
    select: { id: true },
  });
  const assetId = existingAsset?.id ?? preferredAssetId;
  if (!existingAsset) {
    await tx.fileAsset.upsert({
      where: { id: assetId },
      create: {
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
      update: {},
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
  await tx.fileVersion.upsert({
    where: {
      logicalFileId_version: { logicalFileId, version: 'V1.0' },
    },
    create: {
      id: fileVersionId,
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
    update: {},
  });
  await tx.logicalFile.updateMany({
    where: {
      id: logicalFileId,
      OR: [{ currentVersionId: null }, { currentVersionId: fileVersionId }],
    },
    data: { currentVersionId: fileVersionId, status },
  });
  return fileVersionId;
}

function increment(key: string, target: Record<string, number>): void {
  target[key] = (target[key] ?? 0) + 1;
}

function addFinding(
  domain: Finding['domain'],
  entityType: string,
  entityId: string,
  code: string,
  details: Prisma.InputJsonObject,
): void {
  report.findings.push({ domain, entityType, entityId, code, details });
}

function publishedStatus(status: string): boolean {
  return ['active', 'published'].includes(status.toLowerCase());
}

async function assertActor(): Promise<string> {
  if (!actorUserId) {
    throw new Error('--apply requires --actor-user-id=<active-user-id>');
  }
  const actor = await prisma.user.findFirst({
    where: { id: actorUserId, status: 'Active', deletedAt: null },
    select: { id: true },
  });
  if (!actor) throw new Error('Migration actor does not exist or is not active');
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
  legacyFile?: LegacyObjectDescriptor | null;
}): Promise<void> {
  const collision = await prisma.standard.findUnique({
    where: { code: input.code },
    select: { id: true },
  });
  if (collision && collision.id !== input.id) {
    addFinding('STANDARD', 'Standard', input.id, 'TARGET_CODE_COLLISION', {
      code: input.code,
      conflictingStandardId: collision.id,
    });
    return;
  }
  if (!apply) return;

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
    await tx.standardVersion.upsert({
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
    });
    if (input.status === 'PUBLISHED') {
      await tx.standard.updateMany({
        where: {
          id: input.id,
          OR: [{ currentPublishedVersionId: null }, { currentPublishedVersionId: input.versionId }],
        },
        data: {
          status: 'PUBLISHED',
          currentPublishedVersionId: input.versionId,
        },
      });
    }
  });
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
  if (article.fileUrl) return 'FILE';
  return article.contentType.toLowerCase() === 'link' ? 'LINK' : 'MARKDOWN';
}

async function migrateKnowledge(): Promise<void> {
  const articles = await prisma.knowledgeArticle.findMany({
    where: { deletedAt: null },
    include: {
      versions: { orderBy: { createdAt: 'asc' } },
      category: { select: { id: true } },
    },
  });
  report.scanned.knowledgeArticles = articles.length;
  for (const article of articles) {
    const attachments = await prisma.attachment.findMany({
      where: {
        ownerType: 'KnowledgeArticle',
        ownerId: article.id,
        deletedAt: null,
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
        createdAt: true,
      },
    });
    const itemId = stableId(`knowledge:${article.id}`);
    const contentType = knowledgeContentType(article);
    const attachmentDescriptors = attachments.map(descriptorFromAttachment);
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
    const targetPublished = sourcePublished && !fileMigrationPending;
    const currentVersionId = stableId(`knowledge:${article.id}:${article.version}`);

    if (article.markdownContent?.trim() && (article.fileUrl || attachments.length > 0)) {
      addFinding('KNOWLEDGE', 'KnowledgeArticle', article.id, 'MIXED_LEGACY_CONTENT', {
        selectedPrimaryType: 'MARKDOWN',
        attachmentCount: attachments.length,
        hasFileUrl: Boolean(article.fileUrl),
      });
    }
    if (fileMigrationPending) {
      addFinding(
        'KNOWLEDGE',
        'KnowledgeArticle',
        article.id,
        'KNOWLEDGE_PRIMARY_FILE_UNAVAILABLE',
        {
          targetKnowledgeItemId: itemId,
          attachmentIds: attachments.map((attachment) => attachment.id),
          legacyFileUrl: article.fileUrl,
          reason:
            attachmentDescriptors.length > 1
              ? 'AMBIGUOUS_PRIMARY_ATTACHMENT'
              : 'STORAGE_OBJECT_NOT_FOUND_OR_EXTERNAL_URL',
        },
      );
    }
    if (article.status === 'Reviewing') {
      addFinding(
        'KNOWLEDGE',
        'KnowledgeArticle',
        article.id,
        'IN_FLIGHT_REVIEW_REQUIRES_MANUAL_RECONCILIATION',
        { sourceStatus: article.status },
      );
    }
    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      await tx.knowledgeItem.upsert({
        where: { id: itemId },
        create: {
          id: itemId,
          title: article.title,
          categoryId: article.category.id,
          summary: article.background?.slice(0, 1000),
          contentType,
          status: targetPublished ? 'PUBLISHED' : 'DRAFT',
          createdBy: article.authorId,
          updatedBy: article.authorId,
          archivedAt: article.status === 'Archived' ? article.updatedAt : null,
        },
        update: {},
      });

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
        await tx.knowledgeVersion.upsert({
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
            contentType: isCurrent ? contentType : 'MARKDOWN',
            fileVersionId: primaryFileVersionId,
            markdownContent: sourceVersion.markdownContent,
            status: isCurrent && targetPublished ? 'PUBLISHED' : 'DRAFT',
            changeDescription: sourceVersion.changeDescription,
            submittedBy: sourceVersion.submittedBy,
            publishedAt:
              isCurrent && targetPublished ? (article.publishedAt ?? article.updatedAt) : null,
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
                    createdAt: attachment.createdAt.toISOString(),
                  }))
                : [],
            },
          },
          update: {},
        });
        for (const [sortOrder, fileVersionId] of supportingFileVersionIds.entries()) {
          await tx.knowledgeVersionFile.upsert({
            where: {
              knowledgeVersionId_fileVersionId: {
                knowledgeVersionId: versionId,
                fileVersionId,
              },
            },
            create: {
              id: stableId(`knowledge-version-file:${versionId}:${fileVersionId}`),
              knowledgeVersionId: versionId,
              fileVersionId,
              role: 'SUPPORTING',
              sortOrder,
            },
            update: {},
          });
        }
      }
      if (targetPublished) {
        await tx.knowledgeItem.updateMany({
          where: {
            id: itemId,
            OR: [
              { currentPublishedVersionId: null },
              { currentPublishedVersionId: currentVersionId },
            ],
          },
          data: {
            status: 'PUBLISHED',
            currentPublishedVersionId: currentVersionId,
            effectiveAt: article.publishedAt ?? article.updatedAt,
          },
        });
      }
    });
    increment('knowledgeItems', report.createdOrVerified);
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
  for (const item of report.findings) {
    await prisma.migrationException.upsert({
      where: {
        domain_entityType_entityId_code: {
          domain: item.domain,
          entityType: item.entityType,
          entityId: item.entityId,
          code: item.code,
        },
      },
      create: {
        domain: item.domain,
        entityType: item.entityType,
        entityId: item.entityId,
        code: item.code,
        details: item.details,
      },
      update: { details: item.details, status: 'OPEN', resolvedAt: null },
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
  actorUserId = options.actorUserId;
  report.mode = apply ? 'APPLY' : 'DRY_RUN';
  const actorId = apply ? await assertActor() : (actorUserId ?? 'DRY_RUN_ACTOR_REQUIRED');
  await migrateWorkflows(actorId);
  await migrateChecklists(actorId);
  await migrateDocumentTemplates(actorId);
  await migrateKnowledge();
  await queueTargetFileProcessing();
  await recordFindings();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
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
