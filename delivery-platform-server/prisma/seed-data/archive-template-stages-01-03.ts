import type { Level1Def, Level2Def } from './archive-templates';

const stage01 = '01_sale';

const s01L1s: Level1Def[] = [
  // item 1
  { stageCode: stage01, itemNo: 1, level: 1, name: '项目资料' },
  // item 2
  {
    stageCode: stage01,
    itemNo: 2,
    level: 1,
    name: '售前方案及节能计算表格',
    isStar: true,
    needReview: true,
    responsibleRole: 'PROJECT_MANAGER',
  },
  // item 3
  {
    stageCode: stage01,
    itemNo: 3,
    level: 1,
    name: '项目成本预算（售前版）',
    isSensitive: true,
    isStar: true,
    responsibleRole: 'PROJECT_MANAGER',
  },
  // item 4
  {
    stageCode: stage01,
    itemNo: 4,
    level: 1,
    name: '项目报价清单',
    isSensitive: true,
    usageDescription: '对甲方的报价清单',
  },
  // item 5
  {
    stageCode: stage01,
    itemNo: 5,
    level: 1,
    name: '项目招标相关文件（如有）',
  },
  // item 6
  {
    stageCode: stage01,
    itemNo: 6,
    level: 1,
    name: '投标文件或提交的方案',
    isStar: true,
  },
  // item 7
  {
    stageCode: stage01,
    itemNo: 7,
    level: 1,
    name: '中标通知书',
    isStar: true,
  },
  // item 8
  {
    stageCode: stage01,
    itemNo: 8,
    level: 1,
    name: '项目合同（盖章扫描件）',
    isStar: true,
    isSensitive: true,
    needReview: true,
    responsibleRole: 'PROJECT_MANAGER',
    reviewRole: 'DELIVERY_MANAGER',
    allowedFileTypes: 'pdf',
  },
];

const s01L2s: Level2Def[] = [
  // Children of item 1
  {
    stageCode: stage01,
    parentItemNo: 1,
    itemNo: 1001,
    level: 2,
    name: '实施记录',
    secondName: '实施记录',
    usageDescription: '实施过程的现场照片、视频等',
  },
  {
    stageCode: stage01,
    parentItemNo: 1,
    itemNo: 1002,
    level: 2,
    name: '验收记录',
    secondName: '验收记录',
    usageDescription: '验收过程的现场照片、视频等',
  },
  {
    stageCode: stage01,
    parentItemNo: 1,
    itemNo: 1003,
    level: 2,
    name: '临时租用',
    secondName: '临时租用',
    usageDescription: '临时租车、租房、设备的合同收据等',
  },
  {
    stageCode: stage01,
    parentItemNo: 1,
    itemNo: 1004,
    level: 2,
    name: '海外签证',
    secondName: '海外签证',
    usageDescription: '涉及该项目的内外部人员的商务签，工作签等文件',
  },
  {
    stageCode: stage01,
    parentItemNo: 1,
    itemNo: 1005,
    level: 2,
    name: '其他杂项',
    secondName: '其他杂项',
  },
  // Children of item 2
  {
    stageCode: stage01,
    parentItemNo: 2,
    itemNo: 2001,
    level: 2,
    name: '售前方案',
    secondName: '售前方案',
  },
  {
    stageCode: stage01,
    parentItemNo: 2,
    itemNo: 2002,
    level: 2,
    name: '节能计算书',
    secondName: '节能计算书',
    usageDescription: '节能计算书以及计算中涉及的运行报表、历史数据、台账数据等',
  },
  {
    stageCode: stage01,
    parentItemNo: 2,
    itemNo: 2003,
    level: 2,
    name: '调研资料',
    secondName: '调研资料',
    usageDescription: '前期调研的照片记录、CAD图纸、调研记录表等',
  },
  // Children of item 8
  {
    stageCode: stage01,
    parentItemNo: 8,
    itemNo: 8001,
    level: 2,
    name: '盖章扫描件',
    secondName: '盖章扫描件',
    usageDescription: '项目合同PDF、无合同交付流程PDF、启动会会议纪要和会议录屏',
  },
];

// ── Stage 02_design: 深化方案 ───────────────────────────────────
const stage02 = '02_design';

const s02L1s: Level1Def[] = [
  // item 9
  {
    stageCode: stage02,
    itemNo: 9,
    level: 1,
    name: '项目实施计划表',
    usageDescription: '进度计划表',
  },
  // item 10
  {
    stageCode: stage02,
    itemNo: 10,
    level: 1,
    name: '施工方案（深化版）',
    usageDescription: '设计院图纸、甲方图纸、施工图、施工方案、策划书、施工指导文件',
  },
  // item 11
  {
    stageCode: stage02,
    itemNo: 11,
    level: 1,
    name: '系统设计（深化版）',
    isStar: true,
    usageDescription: '系统原理图（PID图）、网络拓扑图、I/O点表',
  },
  // item 12
  {
    stageCode: stage02,
    itemNo: 12,
    level: 1,
    name: '硬件设计（深化版）',
    isStar: true,
    usageDescription: '柜体图纸、柜内原理图、电缆清册表、接线表',
  },
  // item 13
  {
    stageCode: stage02,
    itemNo: 13,
    level: 1,
    name: '软件设计（深化版）',
    isStar: true,
    usageDescription: '软件功能清单、软件设备需求单',
  },
  // item 14
  {
    stageCode: stage02,
    itemNo: 14,
    level: 1,
    name: '项目成本预算（深化版）',
    isStar: true,
    isSensitive: true,
    needReview: true,
    responsibleRole: 'PROJECT_MANAGER',
    usageDescription: '项目总预算、柜体清单、主材清单、施工清单等',
  },
  // item 15
  {
    stageCode: stage02,
    itemNo: 15,
    level: 1,
    name: '深化方案评审记录表',
    needReview: true,
    usageDescription: '评审会议纪要、会议录屏、评审流程记录PDF',
  },
];

const s02L2s: Level2Def[] = [
  {
    stageCode: stage02,
    parentItemNo: 10,
    itemNo: 10001,
    level: 2,
    name: '深化版',
    secondName: '深化版',
    usageDescription: '设计院图纸、甲方图纸、施工图、施工方案、策划书、施工指导文件',
  },
  {
    stageCode: stage02,
    parentItemNo: 11,
    itemNo: 11001,
    level: 2,
    name: '深化版',
    secondName: '深化版',
    usageDescription: '系统原理图（PID图）、网络拓扑图、I/O点表',
  },
  {
    stageCode: stage02,
    parentItemNo: 12,
    itemNo: 12001,
    level: 2,
    name: '深化版',
    secondName: '深化版',
    usageDescription: '柜体图纸、柜内原理图、电缆清册表、接线表',
  },
  {
    stageCode: stage02,
    parentItemNo: 13,
    itemNo: 13001,
    level: 2,
    name: '深化版',
    secondName: '深化版',
    usageDescription: '软件功能清单、软件设备需求单',
  },
  {
    stageCode: stage02,
    parentItemNo: 14,
    itemNo: 14001,
    level: 2,
    name: '深化版',
    secondName: '深化版',
    usageDescription: '项目总预算、柜体清单、主材清单、施工清单等',
  },
];

// ── Stage 03_procurement: 采购与分包 ───────────────────────────
const stage03 = '03_procurement';

const s03L1s: Level1Def[] = [
  // item 16
  {
    stageCode: stage03,
    itemNo: 16,
    level: 1,
    name: '采购申请单',
  },
  // item 17
  {
    stageCode: stage03,
    itemNo: 17,
    level: 1,
    name: '分包管理',
    isSensitive: true,
    needReview: true,
    reviewRole: 'PROJECT_MANAGER',
  },
];

const s03L2s: Level2Def[] = [
  {
    stageCode: stage03,
    parentItemNo: 17,
    itemNo: 17001,
    level: 2,
    name: '施工',
    secondName: '施工',
    usageDescription: '需要项目经理来确认付款节点的所有合同（包含施工、柜体、各类大型现场安装设备）、签证单等文件',
  },
  {
    stageCode: stage03,
    parentItemNo: 17,
    itemNo: 17002,
    level: 2,
    name: '柜体',
    secondName: '柜体',
  },
  {
    stageCode: stage03,
    parentItemNo: 17,
    itemNo: 17003,
    level: 2,
    name: '设备',
    secondName: '设备',
  },
];

// ── Stage 04_construction: 施工调试 ────────────────────────────

export const earlyLevel1Defs: Level1Def[] = [...s01L1s, ...s02L1s, ...s03L1s];
export const earlyLevel2Defs: Level2Def[] = [...s01L2s, ...s02L2s, ...s03L2s];
