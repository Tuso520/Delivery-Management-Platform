import { PrismaClient } from '@prisma/client';

interface ChecklistItemDef {
  itemName: string;
  checkStandard: string;
  evidenceRequired?: string;
  relatedArchiveKey?: string; // stageCode:itemNo — used to look up archiveTemplateItemId
  isRequired: boolean;
  riskLevel: string;
  responsibleRole?: string;
  reviewRole?: string;
}

export async function seedChecklistTemplates(prisma: PrismaClient) {
  console.log('Seeding checklist templates...');

  // ── Create the template ──────────────────────────────────────────
  const template = await prisma.checklistTemplate.upsert({
    where: { templateCode: 'DC-CHK-DEFAULT' },
    create: {
      templateCode: 'DC-CHK-DEFAULT',
      templateName: '标准检查项模板',
      countryCode: null,
      projectType: null,
      stageCode: null,
      version: 'V1.0',
      status: 'Active',
    },
    update: {},
    select: { id: true },
  });

  console.log(`  Template "DC-CHK-DEFAULT" ready (id=${template.id})`);

  // ── Build a lookup map of archive template items ─────────────────
  // Map key: `${stageCode}:${itemNo}` (only level-1 items)
  const archiveItems = await prisma.archiveTemplateItem.findMany({
    where: {
      template: { templateCode: 'DC-ARCH-DEFAULT' },
      level: 1,
    },
    select: { id: true, stageCode: true, itemNo: true },
  });

  const archiveItemMap = new Map<string, string>();
  for (const item of archiveItems) {
    archiveItemMap.set(`${item.stageCode}:${item.itemNo}`, item.id);
  }

  // ── Define all 22 checklist items ─────────────────────────────────
  const items: ChecklistItemDef[] = [
    // ── Stage 01_sale (售前阶段) ──────────────────────────────────
    {
      itemName: '售前方案完整性检查',
      checkStandard: '售前方案必须包含项目概况、技术方案、实施计划及节能计算书',
      evidenceRequired: '售前方案文件及节能计算书',
      relatedArchiveKey: '01_sale:2',
      isRequired: true,
      riskLevel: 'Medium',
      responsibleRole: 'PROJECT_MANAGER',
      reviewRole: 'DELIVERY_MANAGER',
    },
    {
      itemName: '项目成本预算（售前版）审批',
      checkStandard: '售前版成本预算需经审批确认',
      evidenceRequired: '项目成本预算（售前版）',
      relatedArchiveKey: '01_sale:3',
      isRequired: true,
      riskLevel: 'High',
      responsibleRole: 'PROJECT_MANAGER',
    },
    {
      itemName: '投标文件审核',
      checkStandard: '投标文件或提交的方案内容完整、报价准确',
      evidenceRequired: '投标文件或提交的方案',
      relatedArchiveKey: '01_sale:6',
      isRequired: true,
      riskLevel: 'High',
      responsibleRole: 'PROJECT_MANAGER',
    },
    {
      itemName: '中标通知书归档',
      checkStandard: '中标通知书已正式归档',
      evidenceRequired: '中标通知书',
      relatedArchiveKey: '01_sale:7',
      isRequired: true,
      riskLevel: 'Medium',
      responsibleRole: 'PROJECT_MANAGER',
    },
    {
      itemName: '合同技术评审',
      checkStandard: '合同技术条款必须可执行，盖章扫描件已归档',
      evidenceRequired: '项目合同（盖章扫描件）',
      relatedArchiveKey: '01_sale:8',
      isRequired: true,
      riskLevel: 'Critical',
      responsibleRole: 'PROJECT_MANAGER',
      reviewRole: 'DELIVERY_MANAGER',
    },
    // ── Stage 02_design (深化方案) ────────────────────────────────
    {
      itemName: '系统设计审核',
      checkStandard: '系统原理图、网络拓扑图、I/O点表完整准确',
      evidenceRequired: '系统设计（深化版）',
      relatedArchiveKey: '02_design:11',
      isRequired: true,
      riskLevel: 'High',
      responsibleRole: 'ELEC_LEADER',
    },
    {
      itemName: '硬件设计审核',
      checkStandard: '柜体图纸、柜内原理图、电缆清册、接线表完整',
      evidenceRequired: '硬件设计（深化版）',
      relatedArchiveKey: '02_design:12',
      isRequired: true,
      riskLevel: 'High',
      responsibleRole: 'ELEC_LEADER',
    },
    {
      itemName: '软件设计审核',
      checkStandard: '软件功能清单、设备需求单完整准确',
      evidenceRequired: '软件设计（深化版）',
      relatedArchiveKey: '02_design:13',
      isRequired: true,
      riskLevel: 'High',
      responsibleRole: 'SOFTWARE_LEADER',
    },
    {
      itemName: '深化版成本预算评审',
      checkStandard: '深化版项目成本预算必须通过审批',
      evidenceRequired: '项目成本预算（深化版）',
      relatedArchiveKey: '02_design:14',
      isRequired: true,
      riskLevel: 'High',
      responsibleRole: 'PROJECT_MANAGER',
    },
    {
      itemName: '深化方案评审',
      checkStandard: '深化方案必须通过内部评审，评审记录完整',
      evidenceRequired: '深化方案评审记录表',
      relatedArchiveKey: '02_design:15',
      isRequired: true,
      riskLevel: 'High',
      responsibleRole: 'PROJECT_MANAGER',
      reviewRole: 'DELIVERY_MANAGER',
    },
    // ── Stage 03_procurement (采购与分包) ─────────────────────────
    {
      itemName: '分包合同审核',
      checkStandard: '分包合同必须经项目经理审批，施工/柜体/设备分包文件完整',
      evidenceRequired: '分包管理文件',
      relatedArchiveKey: '03_procurement:17',
      isRequired: true,
      riskLevel: 'High',
      responsibleRole: 'PROJECT_MANAGER',
    },
    // ── Stage 04_construction (施工调试) ──────────────────────────
    {
      itemName: '安全技术交底',
      checkStandard: '所有进场人员必须完成安全培训并签字',
      evidenceRequired: '安全技术交底表',
      relatedArchiveKey: '04_construction:20',
      isRequired: true,
      riskLevel: 'Critical',
      responsibleRole: 'HSE',
    },
    {
      itemName: '工作联系函审核',
      checkStandard: '告知函、催款函、罚款单、会议纪要等文件完整归档',
      evidenceRequired: '工作联系函',
      relatedArchiveKey: '04_construction:22',
      isRequired: true,
      riskLevel: 'Medium',
      responsibleRole: 'PROJECT_MANAGER',
    },
    {
      itemName: '硬件调试点检',
      checkStandard: '所有点位和功能必须核对并签字确认，设备资料、程序、配置完整归档',
      evidenceRequired: '硬件调试记录表及其子项',
      relatedArchiveKey: '04_construction:25',
      isRequired: true,
      riskLevel: 'High',
      responsibleRole: 'ELEC_LEADER',
      reviewRole: 'PROJECT_MANAGER',
    },
    {
      itemName: '软件功能点检',
      checkStandard: '平台功能必须逐项测试并签字确认',
      evidenceRequired: '软件调试记录表及其子项',
      relatedArchiveKey: '04_construction:26',
      isRequired: true,
      riskLevel: 'High',
      responsibleRole: 'SOFTWARE_LEADER',
      reviewRole: 'PROJECT_MANAGER',
    },
    {
      itemName: '节能调试测试',
      checkStandard: '节能效果必须达到合同约定指标',
      evidenceRequired: '节能调试记录表',
      relatedArchiveKey: '04_construction:27',
      isRequired: true,
      riskLevel: 'High',
      responsibleRole: 'ELEC_LEADER',
    },
    // ── Stage 05_acceptance (项目验收) ────────────────────────────
    {
      itemName: '项目竣工图审核',
      checkStandard: '最终版施工图、系统设计图、硬件设计图完整归档',
      evidenceRequired: '项目竣工图及子项',
      relatedArchiveKey: '05_acceptance:29',
      isRequired: true,
      riskLevel: 'Medium',
      responsibleRole: 'PROJECT_MANAGER',
    },
    {
      itemName: '培训记录签字',
      checkStandard: '操作维护培训必须在现场完成并有签字记录',
      evidenceRequired: '培训记录签字表',
      relatedArchiveKey: '05_acceptance:30',
      isRequired: true,
      riskLevel: 'Medium',
      responsibleRole: 'PROJECT_MANAGER',
    },
    {
      itemName: '竣工验收',
      checkStandard: '项目完成全部验收并签字，含材料报验、软硬件调试、项目竣工单',
      evidenceRequired: '项目竣工验收报告',
      relatedArchiveKey: '05_acceptance:31',
      isRequired: true,
      riskLevel: 'Critical',
      responsibleRole: 'PROJECT_MANAGER',
      reviewRole: 'DELIVERY_MANAGER',
    },
    {
      itemName: '与甲方结算审核',
      checkStandard: '结算资料完整，金额核对无误，经项目经理审批',
      evidenceRequired: '与甲方结算清单',
      relatedArchiveKey: '05_acceptance:32',
      isRequired: true,
      riskLevel: 'High',
      responsibleRole: 'FINANCE',
      reviewRole: 'PROJECT_MANAGER',
    },
    {
      itemName: '项目成本核算',
      checkStandard: '项目最终成本核算表经财务确认',
      evidenceRequired: '项目最终成本核算表',
      relatedArchiveKey: '05_acceptance:34',
      isRequired: true,
      riskLevel: 'High',
      responsibleRole: 'FINANCE',
    },
    {
      itemName: '项目系统备份',
      checkStandard: '业务数据库、配置表、驱动、历史数据备份已完成',
      evidenceRequired: '项目系统备份',
      relatedArchiveKey: '05_acceptance:36',
      isRequired: true,
      riskLevel: 'High',
      responsibleRole: 'PROJECT_MANAGER',
    },
    // ── Stage 06_review (项目复盘) ─────────────────────────────────
    {
      itemName: '项目复盘报告',
      checkStandard: '项目结束后必须完成复盘总结并经交付经理确认',
      evidenceRequired: '项目总结复盘报告',
      relatedArchiveKey: '06_review:37',
      isRequired: true,
      riskLevel: 'Medium',
      responsibleRole: 'PROJECT_MANAGER',
      reviewRole: 'DELIVERY_MANAGER',
    },
  ];

  // ── Create each item with archive template item reference ─────────
  let itemCount = 0;

  for (let i = 0; i < items.length; i++) {
    const def = items[i];

    // Look up related archive template item ID
    let relatedArchiveTemplateItemId: string | null = null;
    if (def.relatedArchiveKey) {
      relatedArchiveTemplateItemId = archiveItemMap.get(def.relatedArchiveKey) ?? null;
      if (!relatedArchiveTemplateItemId) {
        console.warn(
          `  WARNING: Archive template item not found for key "${def.relatedArchiveKey}" — creating checklist item "${def.itemName}" without reference`,
        );
      }
    }

    const data = {
      itemName: def.itemName,
      checkStandard: def.checkStandard,
      evidenceRequired: def.evidenceRequired ?? null,
      relatedArchiveTemplateItemId,
      isRequired: def.isRequired,
      riskLevel: def.riskLevel,
      responsibleRole: def.responsibleRole ?? null,
      reviewRole: def.reviewRole ?? null,
      evidenceTypes: def.relatedArchiveKey?.startsWith('04_construction')
        ? 'photo,file'
        : 'file',
      minEvidenceCount: def.isRequired ? 1 : 0,
      allowAlbum: def.itemName !== '安全技术交底',
      requireLocation: [
        '安全技术交底',
        '硬件调试点检',
        '软件功能点检',
        '节能调试测试',
      ].includes(def.itemName),
      sortOrder: (i + 1) * 10,
    };

    const existing = await prisma.checklistTemplateItem.findFirst({
      where: {
        templateId: template.id,
        itemName: def.itemName,
      },
    });

    if (existing) {
      itemCount++;
      continue;
    } else {
      await prisma.checklistTemplateItem.create({
        data: {
          templateId: template.id,
          ...data,
        },
      });
    }
    itemCount++;
  }

  console.log(`  Ensured ${itemCount} checklist items`);
  console.log('Checklist templates seeding complete.\n');
}
