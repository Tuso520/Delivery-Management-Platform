import { PrismaClient } from '@prisma/client';

import { seedSystemOperations } from './system-operations';
import { seedTemplatesAndTools } from './templates-tools';

interface DictionarySeed {
  code: string;
  name: string;
  items: ReadonlyArray<{ value: string; label: string }>;
}

const fieldConfigurationCodes = new Set([
  'COUNTRY', 'CUSTOMER_TYPE', 'CONTRACT_TYPE', 'PRODUCT_TYPE', 'PROJECT_KEYWORD',
  'CURRENCY', 'PROJECT_STAGE', 'PROJECT_STATUS', 'STANDARD_CATEGORY',
  'KNOWLEDGE_CATEGORY', 'JOB_POSITION', 'PROJECT_TYPE',
]);

const legacyTargetDictionaries: readonly DictionarySeed[] = [
  {
    code: 'project_type',
    name: '项目类型',
    items: [
      { value: 'FACTORY', label: '工厂' },
      { value: 'DATA_CENTER', label: '数据中心' },
      { value: 'COMMERCIAL', label: '商业' },
      { value: 'MEDICAL', label: '医疗' },
      { value: 'RAIL_TRANSIT', label: '轨道交通' },
      { value: 'LIGHTWEIGHT', label: '轻量化' },
    ],
  },
  {
    code: 'contract_type',
    name: '合同类型',
    items: ['EPC', 'EMC', 'POC'].map((value) => ({ value, label: value })),
  },
  {
    code: 'product_type',
    name: '产品类型',
    items: [
      { value: 'DEEPSIGHT', label: 'DeepSight' },
      { value: 'DEEPBOT', label: 'DeepBot' },
    ],
  },
  {
    code: 'project_keyword',
    name: '项目关键词',
    items: [
      ['NEW_BUILD', '新建项目'], ['RENOVATION', '改造项目'],
      ['MAIN_MATERIAL', '主材'], ['CONSTRUCTION', '施工'],
      ['SOFTWARE_COMMISSIONING', '软件调试'], ['HARDWARE_COMMISSIONING', '硬件调试'],
      ['CHILLER_ENERGY_SAVING', '冷站节能'], ['HVAC_ENERGY_SAVING', '空调节能'],
      ['AIR_COMPRESSOR_ENERGY_SAVING', '空压节能'], ['EMCS_SYSTEM', 'EMCS系统'],
      ['ENERGY_MANAGEMENT_SYSTEM', '能管系统'], ['SOFTWARE_SYSTEM', '软件系统'],
      ['CHILLER_PLANT_CONTROL', '冷站群控'], ['HIGH_EFFICIENCY_PLANT_ROOM', '高效机房'],
      ['PLATFORM_CUSTOMIZATION', '平台定开'], ['RESEARCH', '课题研究'],
    ].map(([value, label]) => ({ value, label })),
  },
  {
    code: 'project_lifecycle_status',
    name: '项目生命周期状态',
    items: [
      { value: 'DRAFT', label: '草稿' },
      { value: 'ACTIVE', label: '执行中' },
      { value: 'PAUSED', label: '已暂停' },
      { value: 'COMPLETED', label: '已完成' },
      { value: 'CANCELLED', label: '已取消' },
    ],
  },
  {
    code: 'project_delivery_stage',
    name: '项目交付阶段',
    items: [
      { value: 'STARTUP', label: '项目启动' },
      { value: 'DEEPENING', label: '深化设计' },
      { value: 'PROCUREMENT', label: '采购与生产' },
      { value: 'CONSTRUCTION', label: '施工安装' },
      { value: 'COMMISSIONING', label: '系统调试' },
      { value: 'TESTING', label: '测试验证' },
      { value: 'INTERNAL_ACCEPTANCE', label: '内部验收' },
      { value: 'EXTERNAL_ACCEPTANCE', label: '客户验收' },
      { value: 'WARRANTY', label: '质保收尾' },
    ],
  },
  {
    code: 'archive_file_type',
    name: '档案允许文件类型',
    items: [
      { value: 'pdf', label: 'PDF' },
      { value: 'doc', label: 'Word 97-2003' },
      { value: 'docx', label: 'Word' },
      { value: 'xls', label: 'Excel 97-2003' },
      { value: 'xlsx', label: 'Excel' },
      { value: 'ppt', label: 'PowerPoint 97-2003' },
      { value: 'pptx', label: 'PowerPoint' },
      { value: 'jpg', label: 'JPG 图片' },
      { value: 'jpeg', label: 'JPEG 图片' },
      { value: 'png', label: 'PNG 图片' },
      { value: 'dwg', label: 'CAD 图纸' },
      { value: 'zip', label: 'ZIP 压缩包' },
    ],
  },
  {
    code: 'standard_type',
    name: '标准类型',
    items: [
      { value: 'PROCESS', label: '流程标准' },
      { value: 'CHECKLIST', label: '检查标准' },
      { value: 'DOCUMENT_TEMPLATE', label: '文档模板' },
      { value: 'POLICY', label: '制度规范' },
    ],
  },
  {
    code: 'knowledge_content_type',
    name: '知识内容类型',
    items: [
      { value: 'FILE', label: '文件' },
      { value: 'MARKDOWN', label: '富文本' },
      { value: 'LINK', label: '外部链接' },
    ],
  },
  {
    code: 'notification_event',
    name: '通知事件',
    items: [
      { value: 'ReviewTaskCreated', label: '审核任务创建' },
      { value: 'ReviewTaskApproved', label: '审核通过' },
      { value: 'ReviewTaskRejected', label: '审核驳回' },
      { value: 'ProjectStageChanged', label: '项目阶段变更' },
      { value: 'ProjectAccepted', label: '项目验收完成' },
    ],
  },
  {
    code: 'notification_channel',
    name: '通知渠道',
    items: [
      { value: 'IN_APP', label: '站内通知' },
      { value: 'WECOM', label: '企业微信' },
      { value: 'FEISHU', label: '飞书' },
    ],
  },
] as const;

const fieldConfigurationDictionaries: readonly DictionarySeed[] = [
  { code: 'COUNTRY', name: '国家', items: [['CN', '中国'], ['VN', '越南'], ['TH', '泰国'], ['ID', '印尼'], ['MY', '马来西亚'], ['OM', '阿曼'], ['SG', '新加坡']].map(([value, label]) => ({ value, label })) },
  { code: 'CUSTOMER_TYPE', name: '客户类型', items: [['FACTORY', '工厂'], ['IDC', 'IDC'], ['AIDC', 'AIDC'], ['COMMERCIAL', '商业'], ['MEDICAL', '医疗'], ['RAIL_TRANSIT', '轨道交通'], ['STANDARD_PRODUCT', '标品']].map(([value, label]) => ({ value, label })) },
  { code: 'CONTRACT_TYPE', name: '合同类型', items: ['EPC', 'EMC', 'POC'].map((value) => ({ value, label: value })) },
  { code: 'PRODUCT_TYPE', name: '产品类型', items: [{ value: 'DEEPSIGHT', label: 'DeepSight' }, { value: 'DEEPBOT', label: 'DeepBot' }] },
  { code: 'PROJECT_KEYWORD', name: '项目关键词', items: [['NEW_BUILD', '新建项目'], ['RENOVATION', '改造项目'], ['MAIN_MATERIAL', '主材'], ['CONSTRUCTION', '施工'], ['SOFTWARE_COMMISSIONING', '软件调试'], ['HARDWARE_COMMISSIONING', '硬件调试'], ['CHILLER_ENERGY_SAVING', '冷站节能'], ['HVAC_ENERGY_SAVING', '空调节能'], ['AIR_COMPRESSOR_ENERGY_SAVING', '空压节能'], ['FMCS', 'FMCS'], ['ENERGY_MANAGEMENT', '能管'], ['SOFTWARE', '软件'], ['CHILLER_GROUP_CONTROL', '冷站群控'], ['HIGH_EFFICIENCY_PLANT_ROOM', '高效机房'], ['PLATFORM_CUSTOMIZATION', '平台定开'], ['RESEARCH', '课题研究']].map(([value, label]) => ({ value, label })) },
  { code: 'CURRENCY', name: '原币币种', items: [['CNY', '人民币'], ['VND', '越南盾'], ['THB', '泰铢'], ['IDR', '印尼盾'], ['MYR', '马来西亚林吉特'], ['OMR', '阿曼里亚尔'], ['SGD', '新加坡元']].map(([value, label]) => ({ value, label })) },
  { code: 'PROJECT_STAGE', name: '项目阶段', items: [['STARTUP', '启动'], ['DEEPENING', '深化'], ['PROCUREMENT', '采购'], ['CONSTRUCTION', '施工'], ['COMMISSIONING', '调试'], ['TESTING', '测试'], ['INTERNAL_ACCEPTANCE', '内验'], ['EXTERNAL_ACCEPTANCE', '外验'], ['WARRANTY', '维保']].map(([value, label]) => ({ value, label })) },
  { code: 'PROJECT_STATUS', name: '项目状态', items: [{ value: 'ACTIVE', label: '进行中' }, { value: 'COMPLETED', label: '已验收' }] },
  { code: 'STANDARD_CATEGORY', name: '标准分类', items: [['MANAGEMENT_POLICY', '管理制度'], ['ROLES_RESPONSIBILITIES', '岗位与职责'], ['PROCESS_SOP', '流程与SOP'], ['TECH_PRODUCT_STANDARD', '技术与产品标准'], ['WORK_SPECIFICATION', '作业规范'], ['INSPECTION_ACCEPTANCE', '检查与验收'], ['TEMPLATE_FORM', '模板与表单']].map(([value, label]) => ({ value, label })) },
  { code: 'KNOWLEDGE_CATEGORY', name: '知识分类', items: [['PROJECT_CASE_REVIEW', '项目案例与复盘'], ['BEST_PRACTICE', '最佳实践与经验'], ['FAQ_TROUBLESHOOTING', '常见问题与故障'], ['TRAINING_TUTORIAL', '培训与教程'], ['EXTERNAL_STANDARD', '外部标准与资料'], ['RESOURCE_TOOL', '资源与工具']].map(([value, label]) => ({ value, label })) },
  { code: 'JOB_POSITION', name: '岗位', items: [['PROJECT_MANAGER', '项目经理'], ['ELECTRICAL_ENGINEER', '电气工程师'], ['SOFTWARE_ENGINEER', '软件工程师'], ['OPERATIONS_ENGINEER', '运维工程师']].map(([value, label]) => ({ value, label })) },
  { code: 'PROJECT_TYPE', name: '项目类型', items: [['EPC_INTEGRATED', 'EPC综合'], ['SYSTEM_INTEGRATION', '系统集成'], ['EQUIPMENT_SUPPLY', '设备供货'], ['CONSTRUCTION_IMPLEMENTATION', '施工实施'], ['SOFTWARE_ONLY', '纯软件'], ['TECHNICAL_SERVICE', '技术服务'], ['GENERAL', '通用']].map(([value, label]) => ({ value, label })) },
] as const;

const replacedLegacyCodes = new Set([
  'project_type', 'contract_type', 'product_type', 'project_keyword',
  'project_lifecycle_status', 'project_delivery_stage',
]);
const targetDictionaries: readonly DictionarySeed[] = [
  ...fieldConfigurationDictionaries,
  ...legacyTargetDictionaries.filter((definition) => !replacedLegacyCodes.has(definition.code)),
];

const targetDepartments = [
  ['PROJECT_MANAGEMENT', '项目管理组'],
  ['ELECTRICAL_ENGINEERING', '电气工程组'],
  ['SOFTWARE_ENGINEERING', '软件工程组'],
  ['PROCUREMENT', '采购组'],
  ['FINANCE', '财务组'],
  ['HSE', '健康安全环境组'],
  ['STANDARD_TEAM', '标准化与质量组'],
] as const;

const targetApprovalTemplates = [
  ['TARGET_PROJECT_ARCHIVE_REVIEW', '项目档案文件审核', 'PROJECT_ARCHIVE_FILE'],
  ['TARGET_ARCHIVE_TEMPLATE_REVIEW', '档案模板版本审核', 'ARCHIVE_TEMPLATE'],
  ['TARGET_STANDARD_REVIEW', '标准版本审核', 'STANDARD'],
  ['TARGET_KNOWLEDGE_REVIEW', '知识版本审核', 'KNOWLEDGE'],
] as const;

export async function seedTargetPlatform(prisma: PrismaClient): Promise<void> {
  const admin = await prisma.user.findUnique({
    where: { username: 'admin' },
    select: { id: true, departmentId: true },
  });
  if (!admin) {
    throw new Error('目标平台种子依赖 admin 用户，请先执行用户种子');
  }

  await seedTargetDictionaries(prisma, admin.id);
  const rootDepartmentId = await seedTargetDepartments(prisma, admin.id);
  if (!admin.departmentId) {
    await prisma.user.updateMany({
      where: { id: admin.id, departmentId: null },
      data: { departmentId: rootDepartmentId },
    });
  }
  await seedTargetApprovalTemplates(prisma);
  await seedSystemOperations(prisma);
  await seedTemplatesAndTools(prisma);
}

export async function seedTargetDictionaries(prisma: PrismaClient, actorId?: string): Promise<void> {
  for (const [categoryIndex, definition] of targetDictionaries.entries()) {
    const category = await prisma.dictionaryCategory.upsert({
      where: { categoryCode: definition.code },
      create: {
        categoryCode: definition.code,
        categoryName: definition.name,
        sortOrder: (categoryIndex + 1) * 10,
        isSystem: fieldConfigurationCodes.has(definition.code),
      },
      update: {},
      select: { id: true },
    });

    for (const [itemIndex, item] of definition.items.entries()) {
      await prisma.dictionaryItem.upsert({
        where: {
          categoryId_itemValue: {
            categoryId: category.id,
            itemValue: item.value,
          },
        },
        create: {
          categoryId: category.id,
          itemValue: item.value,
          itemLabel: item.label,
          itemCode: fieldConfigurationCodes.has(definition.code) ? item.value : null,
          sortOrder: (itemIndex + 1) * 10,
          isSystemDefault: fieldConfigurationCodes.has(definition.code),
          createdBy: actorId,
          updatedBy: actorId,
        },
        update: {},
      });
    }
  }
}

async function seedTargetDepartments(prisma: PrismaClient, managerId: string): Promise<string> {
  const root = await prisma.department.upsert({
    where: { departmentCode: 'DELIVERY_CENTER' },
    create: {
      departmentCode: 'DELIVERY_CENTER',
      departmentName: '软件交付中心',
      managerId,
      sortOrder: 10,
    },
    update: {},
    select: { id: true },
  });

  for (const [index, [departmentCode, departmentName]] of targetDepartments.entries()) {
    await prisma.department.upsert({
      where: { departmentCode },
      create: {
        departmentCode,
        departmentName,
        parentId: root.id,
        sortOrder: (index + 1) * 10,
      },
      update: {},
    });
  }
  return root.id;
}

async function seedTargetApprovalTemplates(prisma: PrismaClient): Promise<void> {
  for (const [templateCode, templateName, businessType] of targetApprovalTemplates) {
    const template = await prisma.approvalTemplate.upsert({
      where: { templateCode },
      create: {
        templateCode,
        templateName,
        businessType,
        isEnabled: true,
      },
      update: {},
      select: { id: true },
    });
    await prisma.approvalStep.upsert({
      where: {
        templateId_stepOrder: {
          templateId: template.id,
          stepOrder: 1,
        },
      },
      create: {
        templateId: template.id,
        stepOrder: 1,
        stepName: '交付负责人审核',
        mode: 'SINGLE',
        requiredCount: 1,
        approverType: 'role',
        approverValues: ['DELIVERY_MANAGER'],
      },
      update: {},
    });
  }
}
