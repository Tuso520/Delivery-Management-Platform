import { PrismaClient } from '@prisma/client';
import { earlyLevel1Defs, earlyLevel2Defs } from './archive-template-stages-01-03';
import { lateLevel1Defs, lateLevel2Defs } from './archive-template-stages-04-06';

/**
 * Type for the bare level-1 item fields before creation.
 * After creation we store the returned id in a map.
 */
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
  parentItemNo: number; // references parent itemNo within the same stage
  itemNo: number;
  level: 2;
  name: string;
  secondName: string;
  usageDescription?: string;
}

const DEFAULT_FILE_TYPES = 'pdf,doc,docx,xls,xlsx,jpg,jpeg,png,dwg,cad,zip,rar';

export async function seedArchiveTemplates(prisma: PrismaClient) {
  console.log('Seeding archive templates...');

  // ── Create the template ──────────────────────────────────────────
  const template = await prisma.archiveTemplate.upsert({
    where: { templateCode: 'DC-ARCH-DEFAULT' },
    create: {
      templateCode: 'DC-ARCH-DEFAULT',
      templateName: '标准档案模板',
      projectType: null,
      countryCode: null,
      languageCode: 'zh-CN',
      version: 'V1.0',
      status: 'Active',
      description: '适用于所有项目类型和国家的标准档案目录模板',
    },
    update: {},
    select: { id: true },
  });

  console.log(`  Template "DC-ARCH-DEFAULT" ready (id=${template.id})`);

  // Existing project archive items reference template items by id. Preserve
  // existing definitions and only create missing defaults.
  async function syncLevel1(def: Level1Def): Promise<string> {
    const data = {
      parentId: null,
      stageCode: def.stageCode,
      itemNo: def.itemNo,
      level: 1,
      name: def.name,
      isRequired: true,
      isStar: def.isStar ?? false,
      isSensitive: def.isSensitive ?? false,
      needReview: def.needReview ?? false,
      responsibleRole: def.responsibleRole ?? null,
      reviewRole: def.reviewRole ?? null,
      usageDescription: def.usageDescription ?? null,
      allowedFileTypes: def.allowedFileTypes ?? DEFAULT_FILE_TYPES,
      sortOrder: def.itemNo * 10,
    };

    const existing = await prisma.archiveTemplateItem.findFirst({
      where: {
        templateId: template.id,
        stageCode: def.stageCode,
        itemNo: def.itemNo,
        level: 1,
      },
      select: { id: true },
    });

    const item = existing
      ? existing
      : await prisma.archiveTemplateItem.create({
          data: {
            templateId: template.id,
            ...data,
          },
          select: { id: true },
        });

    return item.id;
  }

  async function syncLevel2(
    def: Level2Def,
    parentId: string,
  ): Promise<void> {
    const data = {
      parentId,
      stageCode: def.stageCode,
      itemNo: def.itemNo,
      level: 2,
      name: def.name,
      secondName: def.secondName,
      usageDescription: def.usageDescription ?? null,
      isRequired: true,
      allowedFileTypes: DEFAULT_FILE_TYPES,
      sortOrder: def.itemNo,
    };

    const existing = await prisma.archiveTemplateItem.findFirst({
      where: {
        templateId: template.id,
        stageCode: def.stageCode,
        itemNo: def.itemNo,
        level: 2,
      },
    });

    if (existing) {
      return;
    }

    await prisma.archiveTemplateItem.create({
      data: {
        templateId: template.id,
        ...data,
      },
    });
  }

  // ── Execute: create all level-1 items, store ids in a map ────────
  const l1IdMap = new Map<string, string>();

  const allL1s: Level1Def[] = [...earlyLevel1Defs, ...lateLevel1Defs];

  for (const def of allL1s) {
    const id = await syncLevel1(def);
    l1IdMap.set(`${def.stageCode}:${def.itemNo}`, id);
  }

  // ── Execute: create all level-2 items ────────────────────────────
  const allL2s: Level2Def[] = [...earlyLevel2Defs, ...lateLevel2Defs];

  let l2Count = 0;

  for (const def of allL2s) {
    const parentId = l1IdMap.get(`${def.stageCode}:${def.parentItemNo}`);
    if (!parentId) {
      console.warn(
        `  WARNING: Parent not found for ${def.stageCode}:${def.parentItemNo} — skipping level-2 "${def.name}"`,
      );
      continue;
    }
    await syncLevel2(def, parentId);
    l2Count++;
  }

  console.log(
    `  Ensured ${allL1s.length} level-1 items and ${l2Count} level-2 items`,
  );
  console.log('Archive templates seeding complete.\n');
}
