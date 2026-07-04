import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';
import { Client } from 'minio';

import { knowledgeIndexEntries } from './knowledge-index';

const knowledgeCategories = [
  '项目管理',
  '电气工程',
  '软件工程',
  '运维管理',
  '安全管理',
  '通用标准',
  '流程标准',
  '绩效与激励',
  '团队文化',
  '日常制度',
  '客户与跨文化',
  '物流与供应商',
];

const legacyCategoryNames = [
  '专业技术',
  '制度文化',
  '交付资源',
  '项目管理',
  '电气工程',
  '软件工程',
  '运维管理',
  '安全管理',
  '通用标准',
  '流程标准',
  '绩效与激励',
  '团队文化',
  '日常制度',
  '客户与跨文化',
  '物流与供应商',
];

interface KnowledgeSampleFile {
  title: string;
  category: string;
  fileName: string;
  mimeType: string;
  summary: string;
}

const sampleFiles: KnowledgeSampleFile[] = [
  {
    title: '交付知识库在线预览测试-DOC',
    category: '项目管理',
    fileName: 'knowledge-preview-doc.doc',
    mimeType: 'application/msword',
    summary: '验证旧版 doc 文件上传、鉴权读取和在线查阅。',
  },
  {
    title: '交付知识库在线预览测试-XLSX',
    category: '电气工程',
    fileName: 'knowledge-preview-table.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    summary: '验证 xlsx 表格按工作表和单元格在线查阅。',
  },
  {
    title: '交付知识库在线预览测试-PPT',
    category: '软件工程',
    fileName: 'knowledge-preview-slides.ppt',
    mimeType: 'application/vnd.ms-powerpoint',
    summary: '验证 ppt 演示资料上传后按页面内容在线查阅。',
  },
  {
    title: '交付知识库在线预览测试-PDF',
    category: '流程标准',
    fileName: 'knowledge-preview-pdf.pdf',
    mimeType: 'application/pdf',
    summary: '验证 PDF 资料在浏览器中通过鉴权 Blob 在线查阅。',
  },
  {
    title: '交付知识库在线预览测试-图片',
    category: '运维管理',
    fileName: 'knowledge-preview-image.png',
    mimeType: 'image/png',
    summary: '验证现场图片类资料上传后在线查阅。',
  },
];

export async function seedKnowledge(prisma: PrismaClient): Promise<void> {
  console.log('Seeding knowledge categories, index and preview samples...');

  const categoryIds = new Map<string, string>();
  let sortOrder = 10;

  for (const name of knowledgeCategories) {
    const category = await syncCategory(
      prisma,
      name,
      `${name}相关制度、手册、标准、案例与模板`,
      null,
      sortOrder,
    );
    categoryIds.set(name, category.id);
    sortOrder += 10;
  }

  await cleanupDuplicateCategories(prisma);

  const admin = await prisma.user.findUnique({
    where: { username: 'admin' },
    select: { id: true },
  });

  if (!admin) {
    console.warn('  Admin user not found, skipping knowledge entries');
    return;
  }

  await seedKnowledgeIndex(prisma, categoryIds, admin.id);
  await seedKnowledgeSampleFiles(prisma, categoryIds, admin.id);

  console.log(`Seeded ${knowledgeIndexEntries.length} knowledge index entries.`);
}

async function seedKnowledgeIndex(
  prisma: PrismaClient,
  categoryIds: Map<string, string>,
  adminId: string,
): Promise<void> {
  const seen = new Set<string>();

  for (const entry of knowledgeIndexEntries) {
    const categoryId = categoryIds.get(entry.category);
    if (!categoryId) continue;

    const key = `${categoryId}::${entry.title.trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const markdownContent = [
      `# ${entry.title}`,
      '',
      entry.summary,
      '',
      '## 资料状态',
      '',
      '- 可维护 Markdown 正文、关联流程、关联检查项和附件。',
      '- 原始文件上传后可在本条目中在线预览、下载和维护版本。',
    ].join('\n');

    const data = {
      categoryId,
      title: entry.title.trim(),
      background: entry.summary,
      standardPractice: '按知识条目关联的制度、手册或模板执行。',
      markdownContent,
      contentType: 'article',
      sourceStatus: 'Ready',
      needsRevision: entry.needsRevision ?? false,
      authorId: adminId,
    };

    const article = await findOrCreateArticle(prisma, data);
    await softDeleteDuplicateArticles(prisma, article.id, categoryId, data.title);
  }
}

async function seedKnowledgeSampleFiles(
  prisma: PrismaClient,
  categoryIds: Map<string, string>,
  adminId: string,
): Promise<void> {
  const storage = createMinioClient();
  if (!storage) {
    console.warn('  MinIO environment is incomplete, skipping knowledge preview sample attachments');
    return;
  }

  await ensureBucket(storage.client, storage.bucket);
  const sampleDir = join(__dirname, '../seed-files/knowledge-samples');

  for (const sample of sampleFiles) {
    const categoryId = categoryIds.get(sample.category);
    if (!categoryId) continue;

    const article = await findOrCreateArticle(prisma, {
      categoryId,
      title: sample.title,
      background: sample.summary,
      standardPractice: '用于本地 Docker 验收知识库文件上传、在线查阅和预览能力。',
      markdownContent: [
        `# ${sample.title}`,
        '',
        sample.summary,
        '',
        '## 验收动作',
        '',
        '1. 打开条目详情。',
        '2. 在附件列表点击“在线预览”。',
        '3. 确认预览窗口能显示文件内容。',
      ].join('\n'),
      contentType: 'article',
      sourceStatus: 'Ready',
      needsRevision: false,
      authorId: adminId,
    });

    const filePath = join(sampleDir, sample.fileName);
    const buffer = await readFile(filePath);
    const objectName = `attachments/KnowledgeArticle/${article.id}/seed-${sample.fileName}`;

    await storage.client.putObject(storage.bucket, objectName, buffer, buffer.length, {
      'Content-Type': sample.mimeType,
      'X-Amz-Meta-Original-Name': encodeURIComponent(sample.fileName),
    });

    const fileExt = sample.fileName.split('.').pop()?.toLowerCase() ?? '';
    const existing = await prisma.attachment.findFirst({
      where: {
        ownerType: 'KnowledgeArticle',
        ownerId: article.id,
        originalName: sample.fileName,
        deletedAt: null,
      },
      select: { id: true },
    });

    const attachmentData = {
      ownerType: 'KnowledgeArticle',
      ownerId: article.id,
      category: 'document',
      fileName: sample.fileName,
      originalName: sample.fileName,
      fileExt,
      fileSize: BigInt(buffer.length),
      mimeType: sample.mimeType,
      storageBucket: storage.bucket,
      storagePath: objectName,
      uploadedBy: adminId,
      remark: '知识库在线预览本地验收样例',
    };

    if (existing) {
      await prisma.attachment.update({
        where: { id: existing.id },
        data: attachmentData,
      });
    } else {
      await prisma.attachment.create({ data: attachmentData });
    }

    await softDeleteDuplicateArticles(prisma, article.id, categoryId, sample.title);
  }
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

async function findOrCreateArticle(
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
      categoryId: data.categoryId,
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (existing) {
    return existing;
  }

  return prisma.knowledgeArticle.create({
    data,
    select: { id: true },
  });
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

async function cleanupDuplicateCategories(prisma: PrismaClient): Promise<void> {
  if (typeof prisma.knowledgeCategory.updateMany === 'function') {
    await prisma.knowledgeCategory.updateMany({
      where: { name: { in: legacyCategoryNames } },
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
      data: { status: 'Inactive', description: '已合并到同名知识分类' },
    });
  }
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
