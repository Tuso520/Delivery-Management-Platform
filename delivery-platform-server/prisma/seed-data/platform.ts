import { PrismaClient } from '@prisma/client';
import { seedReportsAndPerformance } from './performance';
import { seedSystemOperations } from './system-operations';
import { seedTemplatesAndTools } from './templates-tools';
import { seedProjectOperations } from './project-operations';
interface DictionarySeed {
  code: string;
  name: string;
  items: Array<{ value: string; label: string }>;
}
const dictionaries: DictionarySeed[] = [
  {
    code: 'project_stage',
    name: '项目阶段',
    items: [
      { value: 'Initiation', label: '项目启动' },
      { value: 'Design', label: '深化设计' },
      { value: 'Procurement', label: '采购与生产' },
      { value: 'Construction', label: '施工与安装' },
      { value: 'Commissioning', label: '调试阶段' },
      { value: 'Acceptance', label: '验收阶段' },
      { value: 'Closing', label: '收尾阶段' },
      { value: 'Review', label: '项目复盘' },
    ],
  },
  {
    code: 'archive_stage',
    name: '档案阶段',
    items: [
      { value: '01_sale', label: '售前与项目启动' },
      { value: '02_design', label: '深化设计' },
      { value: '03_procurement', label: '采购与生产' },
      { value: '04_construction', label: '施工与安装' },
      { value: '05_acceptance', label: '调试与验收' },
      { value: '06_review', label: '收尾与复盘' },
    ],
  },
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
    code: 'skill_level',
    name: '技能等级',
    items: [
      { value: '1', label: '了解' },
      { value: '2', label: '可协助' },
      { value: '3', label: '可独立完成' },
      { value: '4', label: '可指导他人' },
      { value: '5', label: '专家' },
    ],
  },
  {
    code: 'evidence_category',
    name: '检查证据阶段',
    items: [
      { value: 'before', label: '检查前' },
      { value: 'during', label: '检查中' },
      { value: 'after', label: '检查后' },
      { value: 'document', label: '记录文件' },
    ],
  },
  {
    code: 'template_category',
    name: '文档模板分类',
    items: [
      { value: 'Contract', label: '合同模板' },
      { value: 'Report', label: '报告模板' },
      { value: 'Checklist', label: '检查模板' },
      { value: 'Form', label: '表单模板' },
      { value: 'Letter', label: '函件模板' },
      { value: 'Other', label: '其他' },
    ],
  },
  {
    code: 'file_format',
    name: '模板文件格式',
    items: [
      { value: 'docx', label: 'Word 文档' },
      { value: 'xlsx', label: 'Excel 表格' },
      { value: 'pptx', label: 'PowerPoint 演示文稿' },
      { value: 'pdf', label: 'PDF 文档' },
      { value: 'md', label: 'Markdown 文档' },
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
      { value: 'zip', label: 'ZIP 压缩包' },
    ],
  },
  {
    code: 'skill_category',
    name: '技能分类',
    items: [
      { value: 'Project', label: '项目管理' },
      { value: 'Electrical', label: '电气技术' },
      { value: 'Software', label: '软件技术' },
      { value: 'Commissioning', label: '调试交付' },
      { value: 'Safety', label: '现场安全' },
      { value: 'Language', label: '语言能力' },
      { value: 'Quality', label: '质量与风险' },
      { value: 'General', label: '通用与协同' },
    ],
  },
  {
    code: 'training_category',
    name: '培训分类',
    items: [
      { value: 'Onboarding', label: '入职培训' },
      { value: 'Technical', label: '专业技术' },
      { value: 'Safety', label: '安全培训' },
      { value: 'Process', label: '流程制度' },
      { value: 'Language', label: '语言文化' },
    ],
  },
  {
    code: 'training_status',
    name: '培训状态',
    items: [
      { value: 'Planned', label: '已计划' },
      { value: 'InProgress', label: '进行中' },
      { value: 'Completed', label: '已完成' },
      { value: 'Cancelled', label: '已取消' },
    ],
  },
  {
    code: 'notification_event',
    name: '通知事件',
    items: [
      { value: 'approval_pending', label: '审批待处理' },
      { value: 'approval_approved', label: '审批通过' },
      { value: 'approval_rejected', label: '审批驳回' },
      { value: 'checklist_rejected', label: '检查记录驳回' },
    ],
  },
  {
    code: 'notification_channel',
    name: '通知渠道',
    items: [{ value: 'in_app', label: '站内通知' }],
  },
  {
    code: 'retrospective_category',
    name: '复盘问题分类',
    items: [
      { value: 'Document', label: '文档与协同' },
      { value: 'Schedule', label: '进度管理' },
      { value: 'Quality', label: '质量问题' },
      { value: 'Technical', label: '技术方案' },
      { value: 'Culture', label: '跨文化沟通' },
      { value: 'Safety', label: '安全管理' },
    ],
  },
];
export async function seedPlatformData(prisma: PrismaClient): Promise<void> {
  console.log('Seeding extended platform data...');
  const admin = await prisma.user.findUnique({
    where: { username: 'admin' },
    select: { id: true, departmentId: true },
  });
  if (!admin) {
    console.warn('  Admin user not found, skipping extended platform data');
    return;
  }
  await cleanupRemovedCredentialFeature(prisma);
  await seedDictionaries(prisma);
  const departmentId = await seedDepartments(prisma, admin.id);
  if (!admin.departmentId) {
    await prisma.user.update({
      where: { id: admin.id },
      data: { departmentId },
    });
  }
  await seedApprovalTemplates(prisma);
  await seedSkillsAndTraining(prisma, admin.id);
  await seedProjectOperations(prisma, admin.id);
  await seedRetrospectives(prisma, admin.id);
  await seedReportsAndPerformance(prisma, admin.id);
  await seedSystemOperations(prisma);
  await seedTemplatesAndTools(prisma);
  console.log('Extended platform data seeding complete.');
}
async function cleanupRemovedCredentialFeature(prisma: PrismaClient): Promise<void> {
  await prisma.systemConfig.deleteMany({
    where: { configKey: 'credential.expiry_days' },
  });
  await prisma.notificationRule.deleteMany({
    where: { eventType: 'credential_expiring' },
  });
  const obsoletePermissions = await prisma.permission.findMany({
    where: { resource: 'credential' },
    select: { id: true },
  });
  if (obsoletePermissions.length) {
    await prisma.rolePermission.deleteMany({
      where: {
        permissionId: { in: obsoletePermissions.map((item) => item.id) },
      },
    });
    await prisma.permission.deleteMany({ where: { resource: 'credential' } });
  }
  const obsoleteDictionaries = await prisma.dictionaryCategory.findMany({
    where: {
      categoryCode: { in: ['credential_type', 'credential_status'] },
    },
    select: { id: true },
  });
  if (obsoleteDictionaries.length) {
    await prisma.dictionaryItem.deleteMany({
      where: {
        categoryId: { in: obsoleteDictionaries.map((item) => item.id) },
      },
    });
    await prisma.dictionaryCategory.deleteMany({
      where: {
        id: { in: obsoleteDictionaries.map((item) => item.id) },
      },
    });
  }
}
async function seedDictionaries(prisma: PrismaClient): Promise<void> {
  for (const [categoryIndex, definition] of dictionaries.entries()) {
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
async function seedDepartments(prisma: PrismaClient, managerId: string): Promise<string> {
  const root = await prisma.department.upsert({
    where: { departmentCode: 'DELIVERY_CENTER' },
    create: {
      departmentCode: 'DELIVERY_CENTER',
      departmentName: '交付中心',
      managerId,
      sortOrder: 10,
    },
    update: {},
    select: { id: true },
  });
  const children = [
    ['PROJECT_TEAM', '项目管理组'],
    ['ELECTRIC_TEAM', '电气交付组'],
    ['SOFTWARE_TEAM', '软件交付组'],
    ['STANDARD_TEAM', '标准化与质量组'],
  ] as const;
  for (const [departmentCode, departmentName] of children) {
    await prisma.department.upsert({
      where: { departmentCode },
      create: {
        departmentCode,
        departmentName,
        parentId: root.id,
        sortOrder: 20,
      },
      update: {},
    });
  }
  return root.id;
}
async function seedApprovalTemplates(prisma: PrismaClient): Promise<void> {
  const templates = [
    ['REPORT_REVIEW', '工作报告审核', 'report'],
    ['KNOWLEDGE_PUBLISH', '知识发布审核', 'knowledge'],
    ['KNOWLEDGE_FILE_UPDATE', '知识库文件更新审批', 'knowledge-file-update'],
    ['CHECKLIST_REVIEW', '检查记录审核', 'checklist'],
    ['PERFORMANCE_SCORE', '绩效评分确认', 'performance'],
  ] as const;
  for (const [templateCode, templateName, businessType] of templates) {
    const template = await prisma.approvalTemplate.upsert({
      where: { templateCode },
      create: { templateCode, templateName, businessType },
      update: {},
      select: { id: true },
    });
    const existingStep = await prisma.approvalStep.findUnique({
      where: {
        templateId_stepOrder: {
          templateId: template.id,
          stepOrder: 1,
        },
      },
    });
    const stepData = {
      stepName: '负责人审核',
      approverType: 'role',
      approverValue: 'DELIVERY_MANAGER',
    };
    if (existingStep) {
      continue;
    } else {
      await prisma.approvalStep.create({
        data: {
          templateId: template.id,
          stepOrder: 1,
          ...stepData,
        },
      });
    }
  }
}
async function seedSkillsAndTraining(prisma: PrismaClient, adminId: string): Promise<void> {
  const skillGroups: Record<string, string[]> = {
    Project: [
      '项目立项与启动',
      '项目范围管理',
      '项目计划编制',
      '里程碑管理',
      '项目进度跟踪',
      '项目成本意识',
      '项目回款跟踪',
      '项目风险识别',
      '项目问题闭环',
      '项目变更管理',
      '项目例会组织',
      '项目周报与月报',
      '项目档案管理',
      '项目复盘',
      '客户需求管理',
      '分包商协同',
    ],
    Electrical: [
      '电气图纸识读',
      '一次系统设计',
      '二次控制回路设计',
      '低压配电柜设计',
      'PLC 控制系统设计',
      '变频器选型与调试',
      '仪表选型与接线',
      '电气设备选型',
      '线缆选型与敷设',
      '电气材料清单编制',
      '控制柜出厂检验',
      '现场上电检查',
      '绝缘与接地测试',
      '电气故障诊断',
      '联锁逻辑验证',
      '电气竣工图编制',
    ],
    Software: [
      '软件需求分析',
      '系统架构设计',
      'PLC 程序开发',
      'HMI 画面开发',
      'SCADA 系统配置',
      'FMCS 平台配置',
      '数据库设计与查询',
      '工业通信协议',
      'Modbus 通信调试',
      'BACnet 通信调试',
      'OPC UA 接口调试',
      '第三方系统接口集成',
      '数据点表管理',
      '报警与趋势配置',
      '软件版本管理',
      '远程问题诊断',
      '软件测试与发布',
      '用户操作培训',
    ],
    Commissioning: [
      '设备到货验收',
      '施工条件检查',
      '单机调试',
      '系统联调',
      '性能测试',
      '节能量验证',
      '调试记录编制',
      '验收问题整改',
      '客户验收组织',
      '项目移交',
    ],
    Safety: [
      '现场安全策划',
      '安全技术交底',
      '作业许可证管理',
      '高风险作业识别',
      '个人防护用品检查',
      '安全晨会组织',
      '现场影像记录',
      '安全事件报告',
    ],
    Quality: [
      '质量计划编制',
      '设计质量检查',
      '材料进场检验',
      '施工质量检查',
      '测试记录审核',
      '不符合项管理',
      '质量问题根因分析',
      '整改验证与关闭',
    ],
    General: [
      '结构化沟通',
      '会议纪要编写',
      '技术文档编写',
      '数据分析与汇报',
      '跨部门协同',
      '客户沟通',
      '跨文化沟通',
      '英语技术交流',
      '责任心与执行闭环',
      '学习与知识分享',
      '压力管理与现场应变',
      '团队指导与经验传承',
    ],
  };
  const skills = Object.entries(skillGroups).flatMap(([category, names]) =>
    names.map((skillName, index) => ({
      skillCode: `${category.toUpperCase()}_${String(index + 1).padStart(3, '0')}`,
      skillName,
      category,
    })),
  );
  const seededSkills: Array<{ id: string; category: string }> = [];
  for (const { skillCode, skillName, category } of skills) {
    const skill = await prisma.skillDefinition.upsert({
      where: { skillCode },
      create: { skillCode, skillName, category },
      update: { skillName, category, status: 'Active' },
      select: { id: true, category: true },
    });
    seededSkills.push(skill);
  }

  const assessmentUsers = await prisma.user.findMany({
    where: { deletedAt: null, status: 'Active' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 8,
  });
  for (const [userIndex, user] of assessmentUsers.entries()) {
    for (const [skillIndex, skill] of seededSkills.slice(0, 24).entries()) {
      if ((userIndex + skillIndex) % 4 !== 0) continue;
      const selfScore = 72 + ((userIndex * 3 + skillIndex) % 19);
      const managerScore = Math.min(100, selfScore + ((skillIndex % 5) - 2));
      const level = Math.max(1, Math.min(5, Math.round(managerScore / 20)));
      await prisma.skillAssessment.upsert({
        where: {
          skillId_userId_period: {
            skillId: skill.id,
            userId: user.id,
            period: '2026-Q2',
          },
        },
        create: {
          skillId: skill.id,
          userId: user.id,
          assessorId: adminId,
          level,
          selfScore,
          managerScore,
          finalScore: managerScore,
          period: '2026-Q2',
          evidenceNote: '根据项目交付记录、技能应用和上级评价形成季度成绩。',
        },
        update: {
          assessorId: adminId,
          level,
          selfScore,
          managerScore,
          finalScore: managerScore,
        },
      });
    }
  }
  const existingTraining = await prisma.trainingPlan.findFirst({
    where: { title: '海外项目安全与影像记录培训' },
    select: { id: true },
  });
  const training =
    existingTraining ??
    (await prisma.trainingPlan.create({
      data: {
        title: '海外项目安全与影像记录培训',
        category: 'Safety',
        trainerName: '交付中心',
        startAt: new Date('2026-07-01T09:00:00Z'),
        status: 'Planned',
        description: '覆盖安全晨会、项目过程记录和项目影像拍摄要求。',
      },
      select: { id: true },
    }));
  await prisma.trainingParticipant.upsert({
    where: {
      trainingId_userId: {
        trainingId: training.id,
        userId: adminId,
      },
    },
    create: { trainingId: training.id, userId: adminId },
    update: {},
  });
}
async function seedRetrospectives(prisma: PrismaClient, ownerId: string): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!project) {
    return;
  }
  const existing = await prisma.projectRetrospective.findFirst({
    where: { projectId: project.id },
    select: { id: true },
  });
  const retrospective =
    existing ??
    (await prisma.projectRetrospective.create({
      data: {
        projectId: project.id,
        summary: '梳理项目交付阶段经验、问题和改进动作。',
        lessonsLearned: '阶段资料应随项目推进同步归档。',
        problemCategory: 'Document',
      },
      select: { id: true },
    }));
  const action = await prisma.retrospectiveAction.findFirst({
    where: {
      retrospectiveId: retrospective.id,
      title: '补齐阶段资料上传责任人',
    },
  });
  if (!action) {
    await prisma.retrospectiveAction.create({
      data: {
        retrospectiveId: retrospective.id,
        title: '补齐阶段资料上传责任人',
        ownerId,
        dueDate: new Date('2026-07-15T00:00:00Z'),
      },
    });
  }
}
