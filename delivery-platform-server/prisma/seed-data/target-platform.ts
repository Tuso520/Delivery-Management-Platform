import { PrismaClient } from '@prisma/client';

import { seedSystemOperations } from './system-operations';
import { seedTemplatesAndTools } from './templates-tools';

interface DictionarySeed {
  code: string;
  name: string;
  items: ReadonlyArray<{ value: string; label: string }>;
}

const targetDictionaries: readonly DictionarySeed[] = [
  {
    code: 'project_type',
    name: '项目类型',
    items: [
      { value: '冷站节能', label: '冷站节能' },
      { value: '空压节能', label: '空压节能' },
      { value: 'FMCS', label: 'FMCS' },
      { value: 'ESL', label: 'ESL' },
      { value: '电气工程', label: '电气工程' },
      { value: '软件工程', label: '软件工程' },
      { value: '集成项目', label: '集成项目' },
      { value: '运维服务', label: '运维服务' },
    ],
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

  await seedTargetDictionaries(prisma);
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

export async function seedTargetDictionaries(prisma: PrismaClient): Promise<void> {
  for (const [categoryIndex, definition] of targetDictionaries.entries()) {
    const category = await prisma.dictionaryCategory.upsert({
      where: { categoryCode: definition.code },
      create: {
        categoryCode: definition.code,
        categoryName: definition.name,
        sortOrder: (categoryIndex + 1) * 10,
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
          sortOrder: (itemIndex + 1) * 10,
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
