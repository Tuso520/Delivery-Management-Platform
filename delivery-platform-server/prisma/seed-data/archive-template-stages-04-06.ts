import type { Level1Def, Level2Def } from './archive-templates';

const stage04 = '04_construction';

const s04L1s: Level1Def[] = [
  // item 18
  {
    stageCode: stage04,
    itemNo: 18,
    level: 1,
    name: '材料报验记录表',
    usageDescription: '材料报审、报验、设备移交单、现场照片等过程文件，包含涉及的合格证、厂家检测报告等，存放到设备子文件夹',
  },
  // item 19
  {
    stageCode: stage04,
    itemNo: 19,
    level: 1,
    name: '柜子出厂测试表（有柜体时提供）',
  },
  // item 20
  {
    stageCode: stage04,
    itemNo: 20,
    level: 1,
    name: '安全技术交底表',
    isStar: true,
    responsibleRole: 'HSE',
    usageDescription: '内部施工安全交底、业主进场安全培训的签字记录、施工安全承诺书',
  },
  // item 21
  {
    stageCode: stage04,
    itemNo: 21,
    level: 1,
    name: '设备运输（海外项目）',
    usageDescription: '设备运输、海运、报关资料、清关资料等',
  },
  // item 22
  {
    stageCode: stage04,
    itemNo: 22,
    level: 1,
    name: '工作联系函',
    isStar: true,
    needReview: true,
    usageDescription: '告知函、催款函、下包罚款单、签字的会议纪要等文件',
  },
  // item 23
  {
    stageCode: stage04,
    itemNo: 23,
    level: 1,
    name: '工程签证',
    isStar: true,
    usageDescription: '工程签证报价文件、工程签证单',
  },
  // item 24
  {
    stageCode: stage04,
    itemNo: 24,
    level: 1,
    name: '进度周报',
    responsibleRole: 'PROJECT_MANAGER',
  },
  // item 25
  {
    stageCode: stage04,
    itemNo: 25,
    level: 1,
    name: '硬件调试记录表',
    isStar: true,
    responsibleRole: 'ELEC_LEADER',
    reviewRole: 'PROJECT_MANAGER',
  },
  // item 26
  {
    stageCode: stage04,
    itemNo: 26,
    level: 1,
    name: '软件调试记录表',
    isStar: true,
    responsibleRole: 'SOFTWARE_LEADER',
    reviewRole: 'PROJECT_MANAGER',
  },
  // item 27
  {
    stageCode: stage04,
    itemNo: 27,
    level: 1,
    name: '节能调试记录表',
    isStar: true,
    usageDescription: '对比测试报告、节能测试报告',
  },
];

const s04L2s: Level2Def[] = [
  // Children of item 24 (进度周报)
  {
    stageCode: stage04,
    parentItemNo: 24,
    itemNo: 24001,
    level: 2,
    name: '总计划',
    secondName: '总计划',
    usageDescription: '后续修订',
  },
  {
    stageCode: stage04,
    parentItemNo: 24,
    itemNo: 24002,
    level: 2,
    name: '项目周报',
    secondName: '项目周报',
  },
  {
    stageCode: stage04,
    parentItemNo: 24,
    itemNo: 24003,
    level: 2,
    name: '施工日志',
    secondName: '施工日志',
  },
  // Children of item 25 (硬件调试记录表)
  {
    stageCode: stage04,
    parentItemNo: 25,
    itemNo: 25001,
    level: 2,
    name: '设备资料',
    secondName: '设备资料',
    usageDescription: '最终版该项目调试过程中涉及的自己设备、业主设备、需要对接设备的相关资料',
  },
  {
    stageCode: stage04,
    parentItemNo: 25,
    itemNo: 25002,
    level: 2,
    name: '硬件程序',
    secondName: '硬件程序',
    usageDescription: '最终版PLC程序、触摸屏程序、WinCC等程序、页面账号密码记录表',
  },
  {
    stageCode: stage04,
    parentItemNo: 25,
    itemNo: 25003,
    level: 2,
    name: '配置记录',
    secondName: '配置记录',
    usageDescription: '最终版IP地址分配表、变频器设置参数、网关配置记录、电表流量计Modbus ID记录表等仪器仪表配置表、账号密码记录表',
  },
  {
    stageCode: stage04,
    parentItemNo: 25,
    itemNo: 25004,
    level: 2,
    name: '点位点检表',
    secondName: '点位点检表',
    usageDescription: '项目经理或业主或下级流程人签字的点位核对记录、确保数据正常',
  },
  {
    stageCode: stage04,
    parentItemNo: 25,
    itemNo: 25005,
    level: 2,
    name: '功能点检表',
    secondName: '功能点检表',
    usageDescription: '项目经理或业主或下级流程人签字的功能核对记录、确保控制点单点、联动逻辑正常',
  },
  {
    stageCode: stage04,
    parentItemNo: 25,
    itemNo: 25006,
    level: 2,
    name: 'Logic点表',
    secondName: 'Logic点表',
    usageDescription: '所辖设备全部点表（设备名称、编号、地址、数据类型、翻译值等）',
  },
  // Children of item 26 (软件调试记录表)
  {
    stageCode: stage04,
    parentItemNo: 26,
    itemNo: 26001,
    level: 2,
    name: '配置点检表',
    secondName: '配置点检表',
    usageDescription: '服务器、客户端防火墙、密码、ip地址、通电自启、外网（卡sn）、远程等配置检查单',
  },
  {
    stageCode: stage04,
    parentItemNo: 26,
    itemNo: 26002,
    level: 2,
    name: '点位点检表',
    secondName: '点位点检表',
    usageDescription: '项目经理或业主签字的点位核对记录、确保数据正常',
  },
  {
    stageCode: stage04,
    parentItemNo: 26,
    itemNo: 26003,
    level: 2,
    name: '功能点检表',
    secondName: '功能点检表',
    usageDescription: '项目经理或业主签字的功能核对记录、确保平台功能正常',
  },
  {
    stageCode: stage04,
    parentItemNo: 26,
    itemNo: 26004,
    level: 2,
    name: '策略点检表',
    secondName: '策略点检表',
  },
];

// ── Stage 05_acceptance: 项目验收 ─────────────────────────────
const stage05 = '05_acceptance';

const s05L1s: Level1Def[] = [
  // item 28
  {
    stageCode: stage05,
    itemNo: 28,
    level: 1,
    name: '使用操作维护手册',
    usageDescription: '软件平台、触摸屏、WinCC等使用操作手册；传感器设备等维护手册。（功能介绍、场景应用、问题处理、逻辑说明）',
  },
  // item 29
  {
    stageCode: stage05,
    itemNo: 29,
    level: 1,
    name: '项目竣工图',
    isStar: true,
  },
  // item 30
  {
    stageCode: stage05,
    itemNo: 30,
    level: 1,
    name: '培训记录签字表',
    isStar: true,
  },
  // item 31
  {
    stageCode: stage05,
    itemNo: 31,
    level: 1,
    name: '项目竣工验收报告',
    isStar: true,
    needReview: true,
    reviewRole: 'DELIVERY_MANAGER',
    usageDescription: '包含全部的材料报验资料、硬件调试验收资料、软件调试验收资料、项目竣工单',
  },
  // item 32
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
    usageDescription: '与甲方的结算书、付款申请单等',
  },
  // item 33
  {
    stageCode: stage05,
    itemNo: 33,
    level: 1,
    name: '与分包结算清单（如有）',
    isSensitive: true,
    usageDescription: '与分包的结算书、付款申请单、发票等',
  },
  // item 34
  {
    stageCode: stage05,
    itemNo: 34,
    level: 1,
    name: '项目最终成本核算表',
    isSensitive: true,
    reviewRole: 'FINANCE',
  },
  // item 35
  {
    stageCode: stage05,
    itemNo: 35,
    level: 1,
    name: '项目信息留存表',
  },
  // item 36
  {
    stageCode: stage05,
    itemNo: 36,
    level: 1,
    name: '项目系统备份',
    isStar: true,
    isSensitive: true,
    usageDescription: '业务数据库、配置表、驱动、历史数据备份计划',
  },
];

const s05L2s: Level2Def[] = [
  // Children of item 29 (项目竣工图)
  {
    stageCode: stage05,
    parentItemNo: 29,
    itemNo: 29001,
    level: 2,
    name: '施工图',
    secondName: '施工图',
    usageDescription: '最终版的施工图',
  },
  {
    stageCode: stage05,
    parentItemNo: 29,
    itemNo: 29002,
    level: 2,
    name: '系统设计图',
    secondName: '系统设计图',
    usageDescription: '最终版的系统原理图（PID图）、网络拓扑图、I/O点表',
  },
  {
    stageCode: stage05,
    parentItemNo: 29,
    itemNo: 29003,
    level: 2,
    name: '硬件设计图',
    secondName: '硬件设计图',
    usageDescription: '最终版的柜体图纸、柜内原理图、电缆清单、接线表',
  },
];

// ── Stage 06_review: 项目复盘 ──────────────────────────────────
const stage06 = '06_review';

const s06L1s: Level1Def[] = [
  // item 37
  {
    stageCode: stage06,
    itemNo: 37,
    level: 1,
    name: '项目总结复盘报告',
    isStar: true,
    needReview: true,
    reviewRole: 'DELIVERY_MANAGER',
    usageDescription: '项目复盘总结文件',
  },
];


export const lateLevel1Defs: Level1Def[] = [...s04L1s, ...s05L1s, ...s06L1s];
export const lateLevel2Defs: Level2Def[] = [...s04L2s, ...s05L2s];
