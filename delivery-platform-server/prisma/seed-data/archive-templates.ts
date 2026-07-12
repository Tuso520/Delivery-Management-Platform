import { PrismaClient } from '@prisma/client';

import { earlyLevel1Defs, earlyLevel2Defs } from './archive-template-stages-01-03';
import { lateLevel1Defs, lateLevel2Defs } from './archive-template-stages-04-06';

export interface Level1Def {
  stageCode: string;
  itemNo: number;
  level: 1;
  name: string;
  isStar?: boolean;
  isSensitive?: boolean;
  needReview?: boolean;
  responsibleRole?: string;
  reviewRole?: string;
  usageDescription?: string;
  allowedFileTypes?: string;
}

export interface Level2Def {
  stageCode: string;
  parentItemNo: number;
  itemNo: number;
  level: 2;
  name: string;
  secondName: string;
  usageDescription?: string;
}

const DEFAULT_FILE_TYPES = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'jpg',
  'jpeg',
  'png',
  'dwg',
  'cad',
  'zip',
  'rar',
] as const;

function allowedExtensions(definition: Level1Def): string[] {
  const configured = definition.allowedFileTypes
    ?.split(',')
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean);
  return configured?.length ? Array.from(new Set(configured)) : [...DEFAULT_FILE_TYPES];
}

function uploadGuide(definition: Level1Def | Level2Def): string {
  if (definition.usageDescription?.trim()) return definition.usageDescription.trim();
  const subject = 'secondName' in definition ? definition.secondName : definition.name;
  return `请上传“${subject}”对应的最终版本、审批记录或签字材料；如不适用，请在项目档案中说明原因。`;
}

function itemStableKey(parent: Level1Def, child?: Level2Def): string {
  return child
    ? `${parent.stageCode}:item:${child.itemNo}`
    : `${parent.stageCode}:item:${parent.itemNo}:default`;
}

export async function seedArchiveTemplates(prisma: PrismaClient): Promise<void> {
  const admin = await prisma.user.findUnique({
    where: { username: 'admin' },
    select: { id: true },
  });
  if (!admin) {
    throw new Error('目标档案模板种子依赖 admin 用户，请先执行用户种子');
  }

  const reviewTemplate = await prisma.approvalTemplate.findUnique({
    where: { templateCode: 'TARGET_PROJECT_ARCHIVE_REVIEW' },
    select: { id: true },
  });
  if (!reviewTemplate) {
    throw new Error('目标档案模板种子依赖 TARGET_PROJECT_ARCHIVE_REVIEW 审核配置');
  }

  const allLevel1 = [...earlyLevel1Defs, ...lateLevel1Defs];
  const allLevel2 = [...earlyLevel2Defs, ...lateLevel2Defs];
  const roleCodes = Array.from(
    new Set(allLevel1.map((definition) => definition.responsibleRole).filter(Boolean)),
  ) as string[];
  const roles = await prisma.role.findMany({
    where: { roleCode: { in: roleCodes } },
    select: { id: true, roleCode: true },
  });
  const roleIdByCode = new Map(roles.map((role) => [role.roleCode, role.id]));

  await prisma.$transaction(
    async (tx) => {
      const template = await tx.archiveTemplate.upsert({
        where: { templateCode: 'DC-ARCH-DEFAULT' },
        create: {
          templateCode: 'DC-ARCH-DEFAULT',
          templateName: '标准项目档案模板',
          languageCode: 'zh-CN',
          version: 'V1.0',
          status: 'PUBLISHED',
          description: '面向交付项目的两级档案模板：文件夹下直接包含文件项。',
          createdBy: admin.id,
          updatedBy: admin.id,
        },
        update: {},
        select: { id: true },
      });

      const version = await tx.archiveTemplateVersion.upsert({
        where: {
          templateId_versionNo: {
            templateId: template.id,
            versionNo: 'V1.0',
          },
        },
        create: {
          templateId: template.id,
          versionNo: 'V1.0',
          status: 'PUBLISHED',
          revision: 1,
          submittedAt: new Date('2026-07-11T00:00:00.000Z'),
          publishedAt: new Date('2026-07-11T00:00:00.000Z'),
          publishedBy: admin.id,
          createdBy: admin.id,
        },
        update: {},
        select: { id: true, status: true },
      });

      for (const [folderIndex, parent] of allLevel1.entries()) {
        const folder = await tx.archiveTemplateFolder.upsert({
          where: {
            templateVersionId_stableKey: {
              templateVersionId: version.id,
              stableKey: `${parent.stageCode}:folder:${parent.itemNo}`,
            },
          },
          create: {
            templateVersionId: version.id,
            stableKey: `${parent.stageCode}:folder:${parent.itemNo}`,
            name: parent.name,
            description: uploadGuide(parent),
            sortOrder: (folderIndex + 1) * 10,
          },
          update: {},
          select: { id: true },
        });

        const children = allLevel2.filter(
          (candidate) =>
            candidate.stageCode === parent.stageCode && candidate.parentItemNo === parent.itemNo,
        );
        const items: Array<Level2Def | undefined> = children.length ? children : [undefined];
        for (const [itemIndex, child] of items.entries()) {
          await tx.archiveTemplateVersionItem.upsert({
            where: {
              templateVersionId_stableKey: {
                templateVersionId: version.id,
                stableKey: itemStableKey(parent, child),
              },
            },
            create: {
              templateVersionId: version.id,
              folderId: folder.id,
              stableKey: itemStableKey(parent, child),
              name: child?.secondName || child?.name || parent.name,
              description: uploadGuide(child ?? parent),
              required: true,
              reviewRequired: parent.needReview ?? false,
              approvalTemplateId: parent.needReview ? reviewTemplate.id : null,
              ownerRoleId: parent.responsibleRole
                ? (roleIdByCode.get(parent.responsibleRole) ?? null)
                : null,
              allowMultipleFiles: false,
              allowedExtensions: allowedExtensions(parent),
              maxFileSize: BigInt(100 * 1024 * 1024),
              namingRule: `${parent.name}-{version}`,
              sortOrder: (itemIndex + 1) * 10,
            },
            update: {},
          });
        }
      }

      if (version.status === 'PUBLISHED') {
        await tx.archiveTemplate.updateMany({
          where: { id: template.id, currentPublishedVersionId: null },
          data: {
            currentPublishedVersionId: version.id,
            version: 'V1.0',
            status: 'PUBLISHED',
          },
        });
      }
    },
    {
      maxWait: 30_000,
      timeout: 600_000,
    },
  );
}
