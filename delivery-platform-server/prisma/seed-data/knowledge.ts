import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';
import { Client } from 'minio';

interface KnowledgeCatalog {
  modules: KnowledgeCatalogModule[];
}

interface KnowledgeCatalogModule {
  id: string;
  name: string;
  description: string;
  contents: KnowledgeCatalogContent[];
}

interface KnowledgeCatalogContent {
  id: string;
  title: string;
  updateFrequency?: string;
  files: KnowledgeCatalogFile[];
}

interface KnowledgeCatalogFile {
  name: string;
  kind: 'document' | 'spreadsheet' | 'presentation' | 'pdf' | 'image';
  needsRevision?: boolean;
}

const legacyCategoryNames = [
  '项目管理',
  '电气专业',
  '软件专业',
  '电气工程',
  '软件工程',
  '安全管理',
  '通用标准',
  '流程标准',
  '绩效与激励',
  '团队文化',
  '日常制度',
  '客户与跨文化',
  '物流与供应商',
  '专业技术',
  '制度文化',
  '交付资源',
];

export async function seedKnowledge(prisma: PrismaClient): Promise<void> {
  console.log('Seeding standard knowledge categories, articles and files...');

  const catalog = await loadKnowledgeCatalog();
  const categoryIds = await seedKnowledgeCategories(prisma, catalog);

  await collapseSeedChildCategories(prisma, catalog, categoryIds);
  await cleanupLegacyAndDuplicateCategories(prisma);

  const admin = await prisma.user.findUnique({
    where: { username: 'admin' },
    select: { id: true },
  });

  if (!admin) {
    console.warn('  Admin user not found, skipping knowledge entries');
    return;
  }

  await seedKnowledgeArticlesAndFiles(prisma, catalog, categoryIds, admin.id);

  const fileCount = catalog.modules.reduce(
    (total, module) =>
      total +
      module.contents.reduce((subtotal, content) => subtotal + content.files.length, 0),
    0,
  );
  console.log(
    `Seeded ${catalog.modules.length} knowledge modules and ${fileCount} sample files.`,
  );
}

async function loadKnowledgeCatalog(): Promise<KnowledgeCatalog> {
  const raw = await readFile(join(__dirname, 'knowledge-catalog.json'), 'utf8');
  return JSON.parse(raw) as KnowledgeCatalog;
}

async function seedKnowledgeCategories(
  prisma: PrismaClient,
  catalog: KnowledgeCatalog,
): Promise<Map<string, string>> {
  const categoryIds = new Map<string, string>();
  let moduleSortOrder = 10;

  for (const module of catalog.modules) {
    const moduleCategory = await syncCategory(
      prisma,
      module.name,
      module.description,
      null,
      moduleSortOrder,
    );
    categoryIds.set(module.id, moduleCategory.id);

    moduleSortOrder += 10;
  }

  return categoryIds;
}

async function seedKnowledgeArticlesAndFiles(
  prisma: PrismaClient,
  catalog: KnowledgeCatalog,
  categoryIds: Map<string, string>,
  adminId: string,
): Promise<void> {
  const storage = createMinioClient();
  if (!storage) {
    console.warn('  MinIO environment is incomplete, skipping knowledge file upload seed');
    return;
  }

  await ensureBucket(storage.client, storage.bucket);
  const sampleDir = join(__dirname, '../seed-files/knowledge-catalog');

  for (const module of catalog.modules) {
    for (const content of module.contents) {
      const categoryId = categoryIds.get(module.id);
      if (!categoryId) continue;

      const article = await upsertArticle(prisma, {
        categoryId,
        title: `${module.name} - ${content.title}`,
        background: `${module.name}模块下的${content.title}资料，共 ${content.files.length} 个文件。`,
        standardPractice:
          '按知识分类维护原始资料，所有文件必须可下载、可在线查阅，并保留版本和修订状态。',
        markdownContent: buildArticleMarkdown(module, content),
        contentType: 'article',
        sourceStatus: 'Ready',
        needsRevision: content.files.some((file) => file.needsRevision),
        authorId: adminId,
      });

      await seedAttachmentsForArticle(
        prisma,
        storage,
        sampleDir,
        article.id,
        content.files,
        adminId,
      );
    }
  }
}

async function seedAttachmentsForArticle(
  prisma: PrismaClient,
  storage: { client: Client; bucket: string },
  sampleDir: string,
  articleId: string,
  files: KnowledgeCatalogFile[],
  adminId: string,
): Promise<void> {
  const expectedNames = new Set(files.map((file) => file.name));

  for (const file of files) {
    const filePath = join(sampleDir, file.name);
    const buffer = await readFile(filePath);
    const objectName = `attachments/KnowledgeArticle/${articleId}/seed-${file.name.replace(/[\\/]/gu, '-')}`;
    const mimeType = mimeTypeFor(file.name);

    await storage.client.putObject(storage.bucket, objectName, buffer, buffer.length, {
      'Content-Type': mimeType,
      'X-Amz-Meta-Original-Name': encodeURIComponent(file.name),
    });

    const existing = await prisma.attachment.findFirst({
      where: {
        ownerType: 'KnowledgeArticle',
        ownerId: articleId,
        originalName: file.name,
        deletedAt: null,
      },
      select: { id: true },
    });

    const attachmentData = {
      ownerType: 'KnowledgeArticle',
      ownerId: articleId,
      category: 'document',
      fileName: file.name,
      originalName: file.name,
      fileExt: fileExt(file.name),
      fileSize: BigInt(buffer.length),
      mimeType,
      storageBucket: storage.bucket,
      storagePath: objectName,
      uploadedBy: adminId,
      remark: file.needsRevision
        ? '知识库标准目录样例文件，当前标记为待修订'
        : '知识库标准目录样例文件',
    };

    if (existing) {
      await prisma.attachment.update({
        where: { id: existing.id },
        data: attachmentData,
      });
    } else {
      await prisma.attachment.create({ data: attachmentData });
    }
  }

  await prisma.attachment.updateMany({
    where: {
      ownerType: 'KnowledgeArticle',
      ownerId: articleId,
      deletedAt: null,
      originalName: { notIn: [...expectedNames] },
    },
    data: { deletedAt: new Date() },
  });
}

async function syncCategory(
  prisma: PrismaClient,
  name: string,
  description: string,
  parentId: string | null,
  sortOrder: number,
): Promise<{ id: string }> {
  const existing = await prisma.knowledgeCategory.findFirst({
    where: { name, parentId, status: 'Active' },
    select: { id: true },
  });

  if (existing) {
    return prisma.knowledgeCategory.update({
      where: { id: existing.id },
      data: { description, parentId, sortOrder, status: 'Active' },
      select: { id: true },
    });
  }

  return prisma.knowledgeCategory.create({
    data: { name, description, parentId, sortOrder, status: 'Active' },
    select: { id: true },
  });
}

async function collapseSeedChildCategories(
  prisma: PrismaClient,
  catalog: KnowledgeCatalog,
  categoryIds: Map<string, string>,
): Promise<void> {
  if (
    typeof prisma.knowledgeCategory.findMany !== 'function' ||
    typeof prisma.knowledgeCategory.updateMany !== 'function' ||
    typeof prisma.knowledgeArticle.updateMany !== 'function'
  ) {
    return;
  }

  for (const module of catalog.modules) {
    const rootCategoryId = categoryIds.get(module.id);
    if (!rootCategoryId) continue;

    const childNames = module.contents.map((content) => content.title);
    if (!childNames.length) continue;

    const childCategories = await prisma.knowledgeCategory.findMany({
      where: {
        parentId: rootCategoryId,
        name: { in: childNames },
        status: 'Active',
      },
      select: { id: true },
    });

    if (!childCategories.length) continue;

    const childIds = childCategories.map((category) => category.id);
    await prisma.knowledgeArticle.updateMany({
      where: {
        categoryId: { in: childIds },
        deletedAt: null,
      },
      data: { categoryId: rootCategoryId },
    });
    await prisma.knowledgeCategory.updateMany({
      where: { id: { in: childIds } },
      data: {
        status: 'Inactive',
        description: '已合并到一级知识分类，原二级内容保留在知识条目标题和文件索引中',
      },
    });
  }
}

async function upsertArticle(
  prisma: PrismaClient,
  data: {
    categoryId: string;
    title: string;
    background: string;
    standardPractice: string;
    markdownContent: string;
    contentType: string;
    sourceStatus: string;
    needsRevision: boolean;
    authorId: string;
  },
): Promise<{ id: string }> {
  const existing = await prisma.knowledgeArticle.findFirst({
    where: {
      title: data.title,
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, categoryId: true },
  });

  const articleData = {
    ...data,
    status: 'Published' as const,
    publishedAt: new Date(),
  };

  if (existing) {
    if (
      existing.categoryId &&
      existing.categoryId !== data.categoryId &&
      typeof prisma.knowledgeArticle.update === 'function'
    ) {
      await prisma.knowledgeArticle.update({
        where: { id: existing.id },
        data: { categoryId: data.categoryId },
      });
    }
    await softDeleteDuplicateArticles(prisma, existing.id, data.categoryId, data.title);
    return existing;
  }

  const created = await prisma.knowledgeArticle.create({
    data: articleData,
    select: { id: true },
  });
  await softDeleteDuplicateArticles(prisma, created.id, data.categoryId, data.title);
  return created;
}

async function softDeleteDuplicateArticles(
  prisma: PrismaClient,
  keepId: string,
  categoryId: string,
  title: string,
): Promise<void> {
  if (typeof prisma.knowledgeArticle.updateMany !== 'function') {
    return;
  }
  await prisma.knowledgeArticle.updateMany({
    where: {
      title,
      categoryId,
      id: { not: keepId },
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });
}

async function cleanupLegacyAndDuplicateCategories(prisma: PrismaClient): Promise<void> {
  if (typeof prisma.knowledgeCategory.updateMany === 'function') {
    await prisma.knowledgeCategory.updateMany({
      where: {
        name: { in: legacyCategoryNames },
        status: 'Active',
      },
      data: { status: 'Inactive' },
    });
  }

  if (typeof prisma.knowledgeCategory.findMany !== 'function') {
    return;
  }

  const activeCategories = await prisma.knowledgeCategory.findMany({
    where: { status: 'Active' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, parentId: true },
  });

  const primaryByIdentity = new Map<string, string>();
  for (const category of activeCategories) {
    const identity = `${category.parentId ?? 'root'}::${category.name.trim().toLowerCase()}`;
    const primaryId = primaryByIdentity.get(identity);
    if (!primaryId) {
      primaryByIdentity.set(identity, category.id);
      continue;
    }

    await prisma.knowledgeArticle.updateMany({
      where: { categoryId: category.id },
      data: { categoryId: primaryId },
    });
    await prisma.knowledgeCategory.update({
      where: { id: category.id },
      data: {
        status: 'Inactive',
        description: '已合并到同级同名知识分类',
      },
    });
  }
}

function buildArticleMarkdown(
  module: KnowledgeCatalogModule,
  content: KnowledgeCatalogContent,
): string {
  return [
    `# ${module.name} / ${content.title}`,
    '',
    module.description,
    '',
    content.updateFrequency ? `更新频率：${content.updateFrequency}` : '更新频率：按制度变更维护',
    '',
    '## 文件索引',
    '',
    '| 文件 | 类型 | 状态 |',
    '| --- | --- | --- |',
    ...content.files.map((file) =>
      `| ${file.name}（${content.title}） | ${labelForKind(file.kind)} | ${
        file.needsRevision ? '待修订' : '已生成样例'
      } |`,
    ),
    '',
    '## 验收要求',
    '',
    '1. 文件必须挂在当前知识分类下。',
    '2. 文件必须可通过附件接口下载。',
    '3. Word、Excel、PPT、PDF 和图片必须可以在线预览。',
  ].join('\n');
}

function labelForKind(kind: KnowledgeCatalogFile['kind']): string {
  const labels: Record<KnowledgeCatalogFile['kind'], string> = {
    document: 'Word 文档',
    spreadsheet: 'Excel 表格',
    presentation: 'PPT 演示',
    pdf: 'PDF 文档',
    image: '图片',
  };
  return labels[kind];
}

function fileExt(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function mimeTypeFor(fileName: string): string {
  const ext = fileExt(fileName);
  const mimeTypes: Record<string, string> = {
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    txt: 'text/plain; charset=utf-8',
  };
  return mimeTypes[ext] ?? 'application/octet-stream';
}

function createMinioClient(): { client: Client; bucket: string } | undefined {
  const endpoint = process.env.MINIO_ENDPOINT;
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;
  const bucket = process.env.MINIO_BUCKET;

  if (!endpoint || !accessKey || !secretKey || !bucket) {
    return undefined;
  }

  return {
    bucket,
    client: new Client({
      endPoint: endpoint,
      port: Number(process.env.MINIO_PORT ?? 9000),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey,
      secretKey,
    }),
  };
}

async function ensureBucket(client: Client, bucket: string): Promise<void> {
  const exists = await client.bucketExists(bucket);
  if (!exists) {
    await client.makeBucket(bucket);
  }
}
