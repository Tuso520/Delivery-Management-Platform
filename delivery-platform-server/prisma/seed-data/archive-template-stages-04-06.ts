import type { Level1Def, Level2Def } from './archive-templates';

const stage04 = '04_construction';
const stage05 = '05_acceptance';
const stage06 = '06_review';
const stage07 = '07_misc';

const s04L1s: Level1Def[] = [
  {
    stageCode: stage04,
    itemNo: 18,
    level: 1,
    name: '材料报验记录表',
    usageDescription: '上传材料报审、设备移交单、合格证、检测报告、现场照片和甲方确认记录。',
  },
  {
    stageCode: stage04,
    itemNo: 19,
    level: 1,
    name: '柜子出厂测试表',
    usageDescription: '如项目存在柜体交付，请上传出厂测试、FAT 记录、整改关闭和发货确认材料。',
  },
  {
    stageCode: stage04,
    itemNo: 20,
    level: 1,
    name: '安全技术交底表',
    isStar: true,
    responsibleRole: 'HSE',
    usageDescription: '上传内部安全交底、业主进场安全培训、签字记录和安全承诺书。',
  },
  {
    stageCode: stage04,
    itemNo: 21,
    level: 1,
    name: '设备运输与报关资料',
    usageDescription: '上传设备运输、海运、报关、清关、到货签收和异常处理记录。',
  },
  {
    stageCode: stage04,
    itemNo: 22,
    level: 1,
    name: '工作联系函',
    isStar: true,
    needReview: true,
    usageDescription: '上传告知函、催款函、罚款单、正式会议纪要和客户确认文件。',
  },
  {
    stageCode: stage04,
    itemNo: 23,
    level: 1,
    name: '工程签证',
    isStar: true,
    usageDescription: '上传工程签证报价、签证单、照片证据、审批记录和结算依据。',
  },
  {
    stageCode: stage04,
    itemNo: 24,
    level: 1,
    name: '进度周报',
    responsibleRole: 'PROJECT_MANAGER',
  },
  {
    stageCode: stage04,
    itemNo: 25,
    level: 1,
    name: '硬件调试记录表',
    isStar: true,
    responsibleRole: 'ELEC_LEADER',
    reviewRole: 'PROJECT_MANAGER',
  },
  {
    stageCode: stage04,
    itemNo: 26,
    level: 1,
    name: '软件调试记录表',
    isStar: true,
    responsibleRole: 'SOFTWARE_LEADER',
    reviewRole: 'PROJECT_MANAGER',
  },
  {
    stageCode: stage04,
    itemNo: 27,
    level: 1,
    name: '节能调试记录表',
    isStar: true,
    usageDescription: '上传对比测试报告、节能测试报告、数据采集说明和客户确认记录。',
  },
];

const s04L2s: Level2Def[] = [
  { stageCode: stage04, parentItemNo: 25, itemNo: 24001, level: 2, name: '总计划', secondName: '总计划' },
  { stageCode: stage04, parentItemNo: 25, itemNo: 24002, level: 2, name: '项目周报', secondName: '项目周报' },
  { stageCode: stage04, parentItemNo: 25, itemNo: 24003, level: 2, name: '施工日志', secondName: '施工日志' },
  {
    stageCode: stage04,
    parentItemNo: 26,
    itemNo: 25001,
    level: 2,
    name: '设备资料',
    secondName: '设备资料',
    usageDescription: '上传调试中涉及的自有设备、业主设备、第三方接口设备资料和通讯说明。',
  },
  {
    stageCode: stage04,
    parentItemNo: 26,
    itemNo: 25002,
    level: 2,
    name: '硬件程序',
    secondName: '硬件程序',
    usageDescription: '上传 PLC 程序、触摸屏程序、WinCC 工程、账号密码交接记录和版本说明。',
  },
  {
    stageCode: stage04,
    parentItemNo: 26,
    itemNo: 25003,
    level: 2,
    name: '配置记录',
    secondName: '配置记录',
    usageDescription: '上传 IP 地址、变频器参数、网关配置、仪表 Modbus ID、账号密码记录等配置表。',
  },
  { stageCode: stage04, parentItemNo: 26, itemNo: 25004, level: 2, name: '点位点检表', secondName: '点位点检表' },
  { stageCode: stage04, parentItemNo: 26, itemNo: 25005, level: 2, name: '功能点检表', secondName: '功能点检表' },
  { stageCode: stage04, parentItemNo: 26, itemNo: 25006, level: 2, name: 'Logic 点表', secondName: 'Logic 点表' },
  {
    stageCode: stage04,
    parentItemNo: 27,
    itemNo: 26001,
    level: 2,
    name: '软件配置点检表',
    secondName: '软件配置点检表',
    usageDescription: '上传服务器、客户端、防火墙、IP、账号、外网、远程等配置检查表。',
  },
  { stageCode: stage04, parentItemNo: 27, itemNo: 26002, level: 2, name: '软件点位点检表', secondName: '软件点位点检表' },
  { stageCode: stage04, parentItemNo: 27, itemNo: 26003, level: 2, name: '软件功能点检表', secondName: '软件功能点检表' },
  { stageCode: stage04, parentItemNo: 27, itemNo: 26004, level: 2, name: '策略点检表', secondName: '策略点检表' },
];

const s05L1s: Level1Def[] = [
  {
    stageCode: stage05,
    itemNo: 28,
    level: 1,
    name: '使用操作维护手册',
    usageDescription: '上传软件平台、触摸屏、WinCC、传感器设备等使用维护手册和客户培训资料。',
  },
  { stageCode: stage05, itemNo: 29, level: 1, name: '项目竣工图', isStar: true },
  { stageCode: stage05, itemNo: 30, level: 1, name: '培训记录签字表', isStar: true },
  {
    stageCode: stage05,
    itemNo: 31,
    level: 1,
    name: '项目竣工验收报告',
    isStar: true,
    needReview: true,
    reviewRole: 'DELIVERY_MANAGER',
    usageDescription: '上传材料报验、硬件调试、软件调试、项目完工单、客户签字验收报告。',
  },
  {
    stageCode: stage05,
    itemNo: 32,
    level: 1,
    name: '与甲方结算清单',
    isStar: true,
    isSensitive: true,
    needReview: true,
    responsibleRole: 'FINANCE',
    reviewRole: 'PROJECT_MANAGER',
  },
  {
    stageCode: stage05,
    itemNo: 33,
    level: 1,
    name: '与分包结算清单',
    isSensitive: true,
  },
  {
    stageCode: stage05,
    itemNo: 34,
    level: 1,
    name: '项目最终成本核算表',
    isSensitive: true,
    reviewRole: 'FINANCE',
  },
  { stageCode: stage05, itemNo: 35, level: 1, name: '项目信息留存表' },
  {
    stageCode: stage05,
    itemNo: 36,
    level: 1,
    name: '项目系统备份',
    isStar: true,
    isSensitive: true,
    usageDescription: '上传业务数据库、配置表、驱动、程序、历史数据和备份恢复说明。',
  },
];

const s05L2s: Level2Def[] = [
  { stageCode: stage05, parentItemNo: 30, itemNo: 29001, level: 2, name: '施工图', secondName: '施工图' },
  { stageCode: stage05, parentItemNo: 30, itemNo: 29002, level: 2, name: '系统设计图', secondName: '系统设计图' },
  { stageCode: stage05, parentItemNo: 30, itemNo: 29003, level: 2, name: '硬件设计图', secondName: '硬件设计图' },
];

const s06L1s: Level1Def[] = [
  {
    stageCode: stage06,
    itemNo: 37,
    level: 1,
    name: '项目总结复盘报告',
    isStar: true,
    needReview: true,
    reviewRole: 'DELIVERY_MANAGER',
    usageDescription: '上传项目复盘总结、问题清单、经验沉淀、客户反馈和改进行动计划。',
  },
  {
    stageCode: stage06,
    itemNo: 38,
    level: 1,
    name: '档案移交清单',
    usageDescription: '上传项目档案最终移交清单、缺失项说明、审批记录和归档确认。',
  },
];

const s07L1s: Level1Def[] = [
  {
    stageCode: stage07,
    itemNo: 38,
    level: 1,
    name: '其他杂项',
    usageDescription: '收纳不归属于售前、设计、采购、施工、验收、复盘阶段的过程性文件。',
  },
  {
    stageCode: stage07,
    itemNo: 39,
    level: 1,
    name: '实施记录',
    usageDescription: '上传项目实施过程的现场照片、视频、阶段记录和关键事件说明。',
  },
  {
    stageCode: stage07,
    itemNo: 40,
    level: 1,
    name: '验收记录',
    usageDescription: '上传验收过程的现场照片、视频、验收沟通记录和补充说明。',
  },
  {
    stageCode: stage07,
    itemNo: 41,
    level: 1,
    name: '临时租用',
    usageDescription: '上传临时租车、租房、设备租赁合同、收据、审批记录和结算凭证。',
  },
  {
    stageCode: stage07,
    itemNo: 42,
    level: 1,
    name: '海外签证',
    usageDescription: '上传商务签、工作签、邀请函、出入境材料和审批记录。',
  },
];

const s07L2s: Level2Def[] = [
  {
    stageCode: stage07,
    parentItemNo: 38,
    itemNo: 1001,
    level: 2,
    name: '实施记录',
    secondName: '实施记录',
    usageDescription: '上传项目实施过程的现场照片、视频、阶段记录和关键事件说明。',
  },
  {
    stageCode: stage07,
    parentItemNo: 38,
    itemNo: 1002,
    level: 2,
    name: '验收记录',
    secondName: '验收记录',
    usageDescription: '上传验收过程的现场照片、视频、验收沟通记录和补充说明。',
  },
  {
    stageCode: stage07,
    parentItemNo: 38,
    itemNo: 1003,
    level: 2,
    name: '临时租用',
    secondName: '临时租用',
    usageDescription: '上传临时租车、租房、设备租赁合同、收据、审批记录和结算凭证。',
  },
  {
    stageCode: stage07,
    parentItemNo: 38,
    itemNo: 1004,
    level: 2,
    name: '海外签证',
    secondName: '海外签证',
    usageDescription: '上传商务签、工作签、邀请函、出入境材料和审批记录。',
  },
  {
    stageCode: stage07,
    parentItemNo: 38,
    itemNo: 1005,
    level: 2,
    name: '其他杂项',
    secondName: '其他杂项',
    usageDescription: '上传无法归类到标准流程节点的补充文件，并在备注中说明用途。',
  },
];

export const lateLevel1Defs: Level1Def[] = [...s04L1s, ...s05L1s, ...s06L1s, ...s07L1s];
export const lateLevel2Defs: Level2Def[] = [...s04L2s, ...s05L2s, ...s07L2s];
