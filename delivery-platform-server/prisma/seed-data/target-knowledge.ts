import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Prisma, PrismaClient } from '@prisma/client';
import { v5 as uuidv5 } from 'uuid';

const TARGET_SEED_NAMESPACE = 'a34a65f4-287f-4d0c-8bda-2960aa8e31de';
const publishedAt = new Date('2026-07-11T00:00:00.000Z');

interface KnowledgeCatalogFile {
  name: string;
  kind: string;
}

interface KnowledgeCatalogContent {
  id: string;
  title: string;
  files: KnowledgeCatalogFile[];
}

interface KnowledgeCatalogModule {
  id: string;
  name: string;
  description: string;
  contents: KnowledgeCatalogContent[];
}

interface KnowledgeCatalog {
  modules: KnowledgeCatalogModule[];
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function loadKnowledgeCatalog(): Promise<KnowledgeCatalog> {
  const filePath = join(__dirname, 'knowledge-catalog.json');
  const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
  if (!isKnowledgeCatalog(parsed)) {
    throw new Error('knowledge-catalog.json 结构无效');
  }
  return parsed;
}

function isKnowledgeCatalog(value: unknown): value is KnowledgeCatalog {
  if (!value || typeof value !== 'object' || !('modules' in value)) return false;
  const modules = (value as { modules?: unknown }).modules;
  if (!Array.isArray(modules)) return false;
  return modules.every((module) => {
    if (!module || typeof module !== 'object') return false;
    const candidate = module as Record<string, unknown>;
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.name === 'string' &&
      typeof candidate.description === 'string' &&
      Array.isArray(candidate.contents) &&
      candidate.contents.every((content) => {
        if (!content || typeof content !== 'object') return false;
        const contentCandidate = content as Record<string, unknown>;
        return (
          typeof contentCandidate.id === 'string' &&
          typeof contentCandidate.title === 'string' &&
          Array.isArray(contentCandidate.files) &&
          contentCandidate.files.every((file) => {
            if (!file || typeof file !== 'object') return false;
            const fileCandidate = file as Record<string, unknown>;
            return typeof fileCandidate.name === 'string' && typeof fileCandidate.kind === 'string';
          })
        );
      })
    );
  });
}

function buildMarkdown(module: KnowledgeCatalogModule, content: KnowledgeCatalogContent): string {
  const fileList = content.files.length
    ? content.files.map((file) => `- ${file.name}（${file.kind}）`).join('\n')
    : '- 暂无资料清单';
  return [
    `# ${content.title}`,
    '',
    module.description,
    '',
    '## 资料清单',
    '',
    fileList,
    '',
    '> 初始化种子仅建立知识索引，不伪造对象存储文件；正式文件需通过统一文件中心上传并发布。',
  ].join('\n');
}

export async function seedTargetKnowledge(prisma: PrismaClient): Promise<void> {
  const admin = await prisma.user.findUnique({
    where: { username: 'admin' },
    select: { id: true },
  });
  if (!admin) {
    throw new Error('目标知识种子依赖 admin 用户，请先执行用户种子');
  }
  const catalog = await loadKnowledgeCatalog();

  await prisma.$transaction(
    async (tx) => {
      for (const [moduleIndex, module] of catalog.modules.entries()) {
        const existingCategory = await tx.knowledgeCategory.findFirst({
          where: { name: module.name, parentId: null },
          select: { id: true },
        });
        const categoryId =
          existingCategory?.id ?? uuidv5(`knowledge-category:${module.id}`, TARGET_SEED_NAMESPACE);
        await tx.knowledgeCategory.upsert({
          where: { id: categoryId },
          create: {
            id: categoryId,
            name: module.name,
            description: module.description,
            sortOrder: (moduleIndex + 1) * 10,
            status: 'Active',
          },
          update: {},
        });

        for (const content of module.contents) {
          const deterministicItemId = uuidv5(
            `knowledge-item:${module.id}:${content.id}`,
            TARGET_SEED_NAMESPACE,
          );
          const existingItem = await tx.knowledgeItem.findFirst({
            where: {
              categoryId,
              title: content.title,
              archivedAt: null,
            },
            select: { id: true },
          });
          const itemId = existingItem?.id ?? deterministicItemId;
          const item = await tx.knowledgeItem.upsert({
            where: { id: itemId },
            create: {
              id: itemId,
              title: content.title,
              categoryId,
              summary: module.description,
              contentType: 'MARKDOWN',
              status: 'PUBLISHED',
              effectiveAt: publishedAt,
              createdBy: admin.id,
              updatedBy: admin.id,
            },
            update: {},
            select: { id: true },
          });
          if (existingItem && existingItem.id !== deterministicItemId) continue;

          const version = await tx.knowledgeVersion.upsert({
            where: {
              knowledgeItemId_version: {
                knowledgeItemId: item.id,
                version: 'V1.0',
              },
            },
            create: {
              knowledgeItemId: item.id,
              version: 'V1.0',
              contentType: 'MARKDOWN',
              markdownContent: buildMarkdown(module, content),
              legacySnapshot: json({
                catalogModuleId: module.id,
                catalogContentId: content.id,
                sourceFiles: content.files,
                binaryObjectsCreated: false,
              }),
              status: 'PUBLISHED',
              changeDescription: '目标架构初始化知识索引',
              submittedBy: admin.id,
              submittedAt: publishedAt,
              publishedAt,
            },
            update: {},
            select: { id: true, status: true },
          });

          if (version.status === 'PUBLISHED') {
            await tx.knowledgeItem.updateMany({
              where: { id: item.id, currentPublishedVersionId: null },
              data: {
                currentPublishedVersionId: version.id,
                status: 'PUBLISHED',
                effectiveAt: publishedAt,
              },
            });
          }
        }
      }
    },
    {
      maxWait: 30_000,
      timeout: 600_000,
    },
  );
}
