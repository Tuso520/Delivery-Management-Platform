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

const DEFAULT_FILE_TYPES = 'pdf,doc,docx,xls,xlsx,ppt,pptx,jpg,jpeg,png,dwg,cad,zip,rar';

const archiveStageLabels: Record<string, string> = {
  '01_sale': '售前与合同',
  '02_design': '深化方案',
  '03_procurement': '采购与生产',
  '04_construction': '施工与调试',
  '05_acceptance': '验收与移交',
  '06_review': '收尾与复盘',
  '07_misc': '其他杂项',
};

function buildUploadGuide(def: Level1Def | Level2Def): string {
  const configured = def.usageDescription?.trim();
  if (configured) return configured;

  const subject = 'secondName' in def ? def.secondName || def.name : def.name;
  const stageLabel = archiveStageLabels[def.stageCode] ?? '项目交付阶段';
  return `请上传「${stageLabel} / ${subject}」相关的最终版文件、过程记录、审批确认或签字材料；如该项暂不适用，请上传说明文件或在备注中说明原因。`;
}

export async function seedArchiveTemplates(prisma: PrismaClient) {
  console.log('Seeding archive templates...');

  const template = await prisma.archiveTemplate.upsert({
    where: { templateCode: 'DC-ARCH-DEFAULT' },
    create: {
      templateCode: 'DC-ARCH-DEFAULT',
      templateName: '标准项目档案模板',
      projectType: null,
      countryCode: null,
      languageCode: 'zh-CN',
      version: 'V1.0',
      status: 'Active',
      description: '适用于交付项目的标准档案目录，按售前、设计、采购、施工、验收、复盘和其他杂项组织。',
    },
    update: {
      templateName: '标准项目档案模板',
      projectType: null,
      countryCode: null,
      languageCode: 'zh-CN',
      version: 'V1.0',
      status: 'Active',
      description: '适用于交付项目的标准档案目录，按售前、设计、采购、施工、验收、复盘和其他杂项组织。',
    },
    select: { id: true },
  });

  console.log(`  Template "DC-ARCH-DEFAULT" ready (id=${template.id})`);

  async function syncLevel1(def: Level1Def): Promise<string> {
    const data = {
      parentId: null,
      stageCode: def.stageCode,
      itemNo: def.itemNo,
      level: 1,
      name: def.name,
      secondName: null,
      isRequired: true,
      isStar: def.isStar ?? false,
      isSensitive: def.isSensitive ?? false,
      needReview: def.needReview ?? false,
      responsibleRole: def.responsibleRole ?? null,
      reviewRole: def.reviewRole ?? null,
      usageDescription: buildUploadGuide(def),
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
      ? await prisma.archiveTemplateItem.update({
          where: { id: existing.id },
          data,
          select: { id: true },
        })
      : await prisma.archiveTemplateItem.create({
          data: {
            templateId: template.id,
            ...data,
          },
          select: { id: true },
        });

    return item.id;
  }

  async function syncLevel2(def: Level2Def, parentId: string): Promise<void> {
    const data = {
      parentId,
      stageCode: def.stageCode,
      itemNo: def.itemNo,
      level: 2,
      name: def.name,
      secondName: def.secondName,
      usageDescription: buildUploadGuide(def),
      isRequired: true,
      isStar: false,
      isSensitive: false,
      needReview: false,
      responsibleRole: null,
      reviewRole: null,
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
      await prisma.archiveTemplateItem.update({
        where: { id: existing.id },
        data,
      });
      return;
    }

    await prisma.archiveTemplateItem.create({
      data: {
        templateId: template.id,
        ...data,
      },
    });
  }

  const l1IdMap = new Map<string, string>();
  const allL1s: Level1Def[] = [...earlyLevel1Defs, ...lateLevel1Defs];

  for (const def of allL1s) {
    const id = await syncLevel1(def);
    l1IdMap.set(`${def.stageCode}:${def.itemNo}`, id);
  }

  const allL2s: Level2Def[] = [...earlyLevel2Defs, ...lateLevel2Defs];
  let l2Count = 0;

  for (const def of allL2s) {
    const parentId = l1IdMap.get(`${def.stageCode}:${def.parentItemNo}`);
    if (!parentId) {
      console.warn(`  WARNING: Parent not found for ${def.stageCode}:${def.parentItemNo}; skipping "${def.name}"`);
      continue;
    }
    await syncLevel2(def, parentId);
    l2Count++;
  }

  console.log(`  Ensured ${allL1s.length} level-1 items and ${l2Count} level-2 items`);
  console.log('Archive templates seeding complete.\n');
}
