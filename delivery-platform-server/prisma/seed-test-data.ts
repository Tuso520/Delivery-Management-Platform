/* eslint-disable no-console */

import { createHash } from 'node:crypto';

import { Prisma, PrismaClient } from '@prisma/client';

import { testDatasetManifest } from './test-data-manifest';

const prisma = new PrismaClient();

const countries = ['CN', 'VN', 'TH', 'SG', 'ID', 'MY', 'AE', 'OM'];
const currencies = ['CNY', 'USD', 'VND', 'THB', 'SGD', 'MYR'];
const stages = [
  'STARTUP',
  'DEEPENING',
  'PROCUREMENT',
  'CONSTRUCTION',
  'COMMISSIONING',
  'TESTING',
  'INTERNAL_ACCEPTANCE',
  'EXTERNAL_ACCEPTANCE',
  'WARRANTY',
];
const projectTypes = ['FACTORY', 'DATA_CENTER', 'COMMERCIAL', 'MEDICAL', 'RAIL_TRANSIT'];
const seed = process.env.TEST_DATA_SEED?.trim() || 'test-release';
let randomState = Number.parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16);

function random(): number {
  randomState = (randomState + 0x6d2b79f5) >>> 0;
  let value = randomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function pick<T>(values: readonly T[]): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) throw new Error('cannot select from an empty test-data list');
  return value;
}

function minimumCount(): number {
  const value = Number(process.env.TEST_DATA_MIN_COUNT ?? '20');
  if (!Number.isInteger(value) || value < 20 || value > 200) {
    throw new Error('TEST_DATA_MIN_COUNT must be an integer between 20 and 200');
  }
  return value;
}

function suffix(index: number): string {
  return `${seed.slice(0, 12)}-${String(index + 1).padStart(3, '0')}`;
}

function topUpCount(current: number, minimum: number): number {
  return Math.max(0, minimum - current);
}

function dateAt(index: number, offsetDays = 0): Date {
  return new Date(Date.UTC(2026, index % 12, ((index * 7 + offsetDays) % 27) + 1, 8));
}

async function seedUsers(minimum: number, adminPassword: string, roleId: string): Promise<void> {
  const missing = topUpCount(await prisma.user.count({ where: { deletedAt: null } }), minimum);
  if (missing === 0) return;

  await prisma.user.createMany({
    data: Array.from({ length: missing }, (_, index) => ({
      username: `test_${suffix(index)}`.slice(0, 50),
      password: adminPassword,
      realName: `测试用户 ${index + 1}`,
      email: `test-${suffix(index)}@example.invalid`.slice(0, 100),
      status: 'Active',
    })),
    skipDuplicates: true,
  });
  const users = await prisma.user.findMany({
    where: { username: { startsWith: `test_${seed.slice(0, 12)}` } },
    select: { id: true },
  });
  await prisma.userRole.createMany({
    data: users.map((user) => ({
      userId: user.id,
      roleId,
      dataScope: 'PARTICIPATED',
    })),
    skipDuplicates: true,
  });
}

async function seedProjects(minimum: number, adminId: string): Promise<void> {
  const missing = topUpCount(await prisma.project.count({ where: { deletedAt: null } }), minimum);
  if (missing === 0) return;
  const exchangeRates: Record<string, number> = {
    CNY: 1,
    USD: 7.2,
    VND: 0.00028,
    THB: 0.2,
    SGD: 5.35,
    MYR: 1.55,
  };

  const data: Prisma.ProjectCreateManyInput[] = Array.from({ length: missing }, (_, index) => {
    const currency = pick(currencies);
    const rate = exchangeRates[currency] ?? 1;
    const amount = currency === 'VND'
      ? 8_000_000_000 + Math.floor(random() * 90_000_000_000)
      : 100_000 + Math.floor(random() * 5_000_000);
    return {
      projectCode: `TEST-${suffix(index)}`.slice(0, 30),
      projectName: `随机测试项目 ${suffix(index)}`,
      shortName: `测试项目 ${index + 1}`,
      countryCode: pick(countries),
      city: `测试城市 ${Math.floor(random() * 30) + 1}`,
      customerName: `测试客户 ${Math.floor(random() * 100) + 1}`,
      projectType: pick(projectTypes),
      contractType: pick(['EPC', 'EMC', 'POC']),
      product: pick(['DEEPSIGHT', 'DEEPBOT']),
      keywords: [pick(['NEW_BUILD', 'RENOVATION']), pick(['CONSTRUCTION', 'COMMISSIONING'])],
      contractCurrency: currency,
      baseCurrency: 'CNY',
      contractAmount: new Prisma.Decimal(amount),
      exchangeRate: new Prisma.Decimal(rate),
      convertedAmount: new Prisma.Decimal(amount * rate),
      exchangeRateDate: dateAt(index),
      exchangeRateSource: 'test-data',
      projectLanguage: 'zh-CN',
      status: pick(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED']),
      currentStage: pick(stages),
      progressPercent: new Prisma.Decimal(Math.floor(random() * 101)),
      riskLevel: pick(['Low', 'Medium', 'High', 'Critical']),
      contractNo: `TC-${suffix(index)}`.slice(0, 100),
      contractSignedAt: dateAt(index, 1),
      startDate: dateAt(index, 2),
      plannedEndDate: dateAt(index + 8, 3),
      expectedAcceptanceAt: dateAt(index + 10, 4),
      createdBy: adminId,
    };
  });
  await prisma.project.createMany({ data, skipDuplicates: true });
}

async function seedProjectDetails(minimum: number, adminId: string): Promise<void> {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { projectCode: 'asc' },
    take: minimum,
    select: { id: true },
  });
  if (projects.length === 0) throw new Error('projects are required for related test data');

  const processMissing = topUpCount(await prisma.projectProcessRecord.count(), minimum);
  await prisma.projectProcessRecord.createMany({
    data: Array.from({ length: processMissing }, (_, index) => ({
      projectId: pick(projects).id,
      title: `测试过程记录 ${suffix(index)}`,
      recordType: pick(['Progress', 'Meeting', 'Risk']),
      stageCode: pick(stages),
      recordDate: dateAt(index),
      description: `自动生成的项目过程数据 ${suffix(index)}`,
      status: 'Recorded',
      createdBy: adminId,
    })),
  });

  const paymentMissing = topUpCount(await prisma.projectPayment.count(), minimum);
  await prisma.projectPayment.createMany({
    data: Array.from({ length: paymentMissing }, (_, index) => {
      const amount = 10_000 + Math.floor(random() * 900_000);
      return {
        projectId: pick(projects).id,
        paymentName: `测试付款节点 ${suffix(index)}`,
        paymentType: pick(['Milestone', 'Advance', 'Retention']),
        dueDate: dateAt(index, 5),
        status: pick(['Planned', 'Due', 'Received']),
        originalAmount: new Prisma.Decimal(amount),
        originalCurrency: 'CNY',
        exchangeRate: new Prisma.Decimal(1),
        convertedCurrency: 'CNY',
        convertedAmount: new Prisma.Decimal(amount),
        receivedOriginalAmount: new Prisma.Decimal(0),
        receivedConvertedAmount: new Prisma.Decimal(0),
        rateDate: dateAt(index),
        rateSource: 'test-data',
        createdBy: adminId,
      };
    }),
  });
}

async function seedContentLibraries(minimum: number, adminId: string): Promise<void> {
  const standardMissing = topUpCount(await prisma.standard.count(), minimum);
  await prisma.standard.createMany({
    data: Array.from({ length: standardMissing }, (_, index) => ({
      code: `TS-${suffix(index)}`.slice(0, 50),
      name: `随机测试标准 ${index + 1}`,
      type: pick(['PROCESS', 'CHECKLIST', 'DOCUMENT_TEMPLATE']),
      category: pick(['项目启动', '施工安装', '测试验收']),
      status: 'DRAFT',
      createdBy: adminId,
      updatedBy: adminId,
    })),
    skipDuplicates: true,
  });

  let category = await prisma.knowledgeCategory.findFirst({ select: { id: true } });
  category ??= await prisma.knowledgeCategory.create({
    data: { name: '测试知识分类', description: '测试服务器自动生成' },
    select: { id: true },
  });
  const knowledgeMissing = topUpCount(await prisma.knowledgeItem.count(), minimum);
  await prisma.knowledgeItem.createMany({
    data: Array.from({ length: knowledgeMissing }, (_, index) => ({
      title: `随机测试知识 ${suffix(index)}`,
      categoryId: category.id,
      summary: `自动生成的知识库测试摘要 ${index + 1}`,
      contentType: pick(['MARKDOWN', 'LINK']),
      status: 'DRAFT',
      createdBy: adminId,
      updatedBy: adminId,
    })),
  });
}

async function seedChecklistAndTools(minimum: number): Promise<void> {
  const checklistMissing = topUpCount(await prisma.checklistTemplate.count(), minimum);
  for (let index = 0; index < checklistMissing; index += 1) {
    await prisma.checklistTemplate.create({
      data: {
        templateCode: `TCL-${suffix(index)}`.slice(0, 50),
        templateName: `随机检查模板 ${index + 1}`,
        countryCode: pick(countries),
        projectType: pick(projectTypes),
        stageCode: pick(stages),
        items: {
          create: {
            itemName: `随机检查项 ${index + 1}`,
            checkStandard: '检查记录应完整、清晰且可追溯',
            riskLevel: pick(['Low', 'Medium', 'High']),
            responsibleRole: 'PROJECT_MANAGER',
          },
        },
      },
    });
  }

  let toolCategory = await prisma.toolCategory.findFirst({ select: { id: true } });
  toolCategory ??= await prisma.toolCategory.create({
    data: { name: '测试工具分类', description: '测试服务器自动生成' },
    select: { id: true },
  });
  const toolMissing = topUpCount(await prisma.toolItem.count(), minimum);
  await prisma.toolItem.createMany({
    data: Array.from({ length: toolMissing }, (_, index) => ({
      categoryId: toolCategory.id,
      name: `随机测试工具 ${suffix(index)}`,
      description: `测试工具说明 ${index + 1}`,
      toolType: pick(['internal', 'external']),
      url: `https://example.invalid/tools/${suffix(index)}`,
      configuration: { testData: true, seed },
      sortOrder: index,
    })),
  });
}

async function seedAdministration(minimum: number, adminId: string): Promise<void> {
  const departmentMissing = topUpCount(await prisma.department.count(), minimum);
  await prisma.department.createMany({
    data: Array.from({ length: departmentMissing }, (_, index) => ({
      departmentCode: `TD-${suffix(index)}`.slice(0, 50),
      departmentName: `随机测试部门 ${index + 1}`,
      managerId: adminId,
      sortOrder: index,
    })),
    skipDuplicates: true,
  });

  const notificationMissing = topUpCount(await prisma.notification.count(), minimum);
  await prisma.notification.createMany({
    data: Array.from({ length: notificationMissing }, (_, index) => ({
      deduplicationKey: `test:${suffix(index)}`,
      userId: adminId,
      title: `随机测试通知 ${index + 1}`,
      content: `自动生成的通知内容 ${suffix(index)}`,
      notificationType: pick(['project', 'review', 'system']),
      relatedType: 'test-data',
      isRead: random() > 0.5,
    })),
    skipDuplicates: true,
  });

  const ruleMissing = topUpCount(await prisma.notificationRule.count(), minimum);
  await prisma.notificationRule.createMany({
    data: Array.from({ length: ruleMissing }, (_, index) => ({
      name: `随机通知规则 ${suffix(index)}`,
      eventType: `TEST_EVENT_${index + 1}`,
      channel: 'in_app',
      recipientRole: 'SUPER_ADMIN',
      template: '测试事件：{{title}}',
      channels: ['in_app'],
      recipientPolicy: { type: 'role', roles: ['SUPER_ADMIN'] },
    })),
  });

  const logMissing = topUpCount(await prisma.operationLog.count(), minimum);
  await prisma.operationLog.createMany({
    data: Array.from({ length: logMissing }, (_, index) => ({
      userId: adminId,
      module: pick(['project', 'knowledge', 'standard', 'system']),
      action: pick(['create', 'update', 'view', 'download']),
      targetType: 'test-data',
      targetId: createHash('md5').update(suffix(index)).digest('hex').slice(0, 32),
      afterData: { generated: true, index },
      ipAddress: '127.0.0.1',
      userAgent: 'test-server-seed',
      result: 'success',
      traceId: `test-${suffix(index)}`,
    })),
  });

  const configMissing = topUpCount(await prisma.systemConfig.count(), minimum);
  await prisma.systemConfig.createMany({
    data: Array.from({ length: configMissing }, (_, index) => ({
      configKey: `test.generated.${suffix(index)}`.slice(0, 100),
      configValue: JSON.stringify({ generated: true, index }),
      description: `随机测试配置 ${index + 1}`,
      configType: 'json',
      updatedBy: adminId,
    })),
    skipDuplicates: true,
  });

  const widgetMissing = topUpCount(await prisma.dashboardWidget.count(), minimum);
  await prisma.dashboardWidget.createMany({
    data: Array.from({ length: widgetMissing }, (_, index) => ({
      widgetKey: `test_${suffix(index)}`.slice(0, 50),
      widgetName: `随机测试组件 ${index + 1}`,
      description: '测试服务器自动生成',
      defaultRole: 'SUPER_ADMIN',
      sortOrder: index,
    })),
    skipDuplicates: true,
  });
}

async function seedIntegrationsAndRates(minimum: number, adminId: string): Promise<void> {
  const integrationMissing = topUpCount(await prisma.integrationConfig.count(), minimum);
  await prisma.integrationConfig.createMany({
    data: Array.from({ length: integrationMissing }, (_, index) => ({
      provider: `test-provider-${(index % 5) + 1}`,
      configName: `随机测试集成 ${suffix(index)}`,
      configValue: { mode: 'test', index },
      isEnabled: false,
      description: '仅用于测试服务器界面和接口验证',
    })),
  });
  const integrations = await prisma.integrationConfig.findMany({
    orderBy: { createdAt: 'asc' },
    take: minimum,
    select: { id: true, provider: true },
  });
  const syncMissing = topUpCount(await prisma.integrationSyncLog.count(), minimum);
  await prisma.integrationSyncLog.createMany({
    data: Array.from({ length: syncMissing }, (_, index) => {
      const integration = pick(integrations);
      return {
        integrationConfigId: integration.id,
        provider: integration.provider.slice(0, 20),
        action: pick(['contact_sync', 'health_check', 'configuration_test']),
        status: pick(['SUCCESS', 'FAILED', 'RUNNING']),
        summary: { generated: true, processed: Math.floor(random() * 100) },
        requestedBy: adminId,
        startedAt: dateAt(index),
        completedAt: dateAt(index, 1),
      };
    }),
  });

  const availableCurrencies = await prisma.currency.findMany({
    where: { status: 'Active' },
    select: { currencyCode: true },
  });
  if (availableCurrencies.length < 2) throw new Error('at least two currencies are required');
  const rateMissing = topUpCount(await prisma.exchangeRate.count(), minimum);
  await prisma.exchangeRate.createMany({
    data: Array.from({ length: rateMissing }, (_, index) => {
      const from = availableCurrencies[index % availableCurrencies.length];
      const to = availableCurrencies[(index + 1) % availableCurrencies.length];
      if (!from || !to) throw new Error('currency selection failed');
      return {
        fromCurrency: from.currencyCode,
        toCurrency: to.currencyCode,
        rate: new Prisma.Decimal((0.1 + random() * 8).toFixed(8)),
        rateDate: dateAt(index),
        source: 'test-data',
      };
    }),
    skipDuplicates: true,
  });
}

async function seedPeopleOperations(minimum: number, adminId: string): Promise<void> {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { projectCode: 'asc' },
    take: minimum,
    select: { id: true },
  });
  const users = await prisma.user.findMany({
    where: { deletedAt: null, status: 'Active' },
    orderBy: { username: 'asc' },
    take: minimum,
    select: { id: true },
  });
  if (projects.length === 0 || users.length === 0) throw new Error('projects and users are required');

  const reportMissing = topUpCount(await prisma.dailyReport.count({ where: { deletedAt: null } }), minimum);
  await prisma.dailyReport.createMany({
    data: Array.from({ length: reportMissing }, (_, index) => ({
      projectId: pick(projects).id,
      authorId: pick(users).id,
      reportType: pick(['daily', 'weekly', 'monthly']),
      reportDate: dateAt(index),
      content: `随机测试报告内容 ${suffix(index)}`,
      workHours: new Prisma.Decimal((1 + random() * 10).toFixed(1)),
      projectProgress: `当前进度 ${Math.floor(random() * 101)}%`,
      riskNotes: random() > 0.6 ? '存在测试风险，需要跟踪' : null,
      nextPlan: '继续推进测试任务',
      status: pick(['Draft', 'Submitted', 'Reviewed']),
    })),
  });

  const objectiveMissing = topUpCount(await prisma.okrObjective.count(), minimum);
  for (let index = 0; index < objectiveMissing; index += 1) {
    await prisma.okrObjective.create({
      data: {
        title: `随机测试目标 ${suffix(index)}`,
        description: '测试服务器自动生成',
        period: pick(['Q1', 'Q2', 'Q3', 'Q4']),
        periodType: 'quarterly',
        ownerId: pick(users).id,
        weight: 100,
        progress: Math.floor(random() * 101),
      },
    });
  }
  const objectives = await prisma.okrObjective.findMany({
    orderBy: { createdAt: 'asc' },
    take: minimum,
    select: { id: true },
  });
  const keyResultMissing = topUpCount(await prisma.keyResult.count(), minimum);
  await prisma.keyResult.createMany({
    data: Array.from({ length: keyResultMissing }, (_, index) => ({
      objectiveId: pick(objectives).id,
      title: `随机关键结果 ${suffix(index)}`,
      targetValue: '100',
      currentValue: String(Math.floor(random() * 101)),
      progress: Math.floor(random() * 101),
    })),
  });
  const scoreMissing = topUpCount(await prisma.performanceScore.count(), minimum);
  for (let index = 0; index < scoreMissing; index += 1) {
    const objective = objectives[index % objectives.length];
    const scorer = users[index % users.length];
    if (!objective || !scorer) throw new Error('performance score relation selection failed');
    await prisma.performanceScore.create({
      data: {
        objectiveId: objective.id,
        scorerId: scorer.id,
        month: `2026-${String((index % 12) + 1).padStart(2, '0')}`,
        selfScore: 60 + Math.floor(random() * 41),
        managerScore: 60 + Math.floor(random() * 41),
        status: 'Completed',
      },
    });
  }

  await seedApprovals(minimum, adminId, users);
  await seedSkillsAndTraining(minimum, adminId, users);
  await seedRetrospectivesAndBackups(minimum, adminId, projects);
}

async function seedApprovals(
  minimum: number,
  adminId: string,
  users: Array<{ id: string }>,
): Promise<void> {
  const templateMissing = topUpCount(await prisma.approvalTemplate.count(), minimum);
  for (let index = 0; index < templateMissing; index += 1) {
    await prisma.approvalTemplate.create({
      data: {
        templateCode: `TAP-${suffix(index)}`.slice(0, 50),
        templateName: `随机审批模板 ${index + 1}`,
        businessType: pick(['PROJECT_CREATE', 'FILE_REVIEW', 'STANDARD_PUBLISH']),
        countryCode: pick(countries),
        steps: {
          create: {
            stepOrder: 1,
            stepName: '测试审批',
            approverType: 'USER',
            approverValues: [adminId],
          },
        },
      },
    });
  }
  const templates = await prisma.approvalTemplate.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    take: minimum,
    select: { id: true, businessType: true },
  });
  const taskMissing = topUpCount(await prisma.approvalTask.count(), minimum);
  for (let index = 0; index < taskMissing; index += 1) {
    const template = pick(templates);
    await prisma.approvalTask.create({
      data: {
        templateId: template.id,
        businessType: template.businessType,
        businessId: createHash('md5').update(`approval-${suffix(index)}`).digest('hex').slice(0, 32),
        businessTitle: `随机审批事项 ${index + 1}`,
        applicantId: pick(users).id,
        approverId: adminId,
        status: 'Pending',
      },
    });
  }
}

async function seedSkillsAndTraining(
  minimum: number,
  adminId: string,
  users: Array<{ id: string }>,
): Promise<void> {
  const skillMissing = topUpCount(await prisma.skillDefinition.count(), minimum);
  await prisma.skillDefinition.createMany({
    data: Array.from({ length: skillMissing }, (_, index) => ({
      skillCode: `TSK-${suffix(index)}`.slice(0, 50),
      skillName: `随机测试技能 ${index + 1}`,
      category: pick(['项目管理', '电气', '软件', 'HSE']),
      description: '测试服务器自动生成',
    })),
    skipDuplicates: true,
  });
  const skills = await prisma.skillDefinition.findMany({
    orderBy: { skillCode: 'asc' },
    take: minimum,
    select: { id: true },
  });
  const assessmentMissing = topUpCount(await prisma.skillAssessment.count(), minimum);
  for (let index = 0; index < assessmentMissing; index += 1) {
    const skill = skills[index % skills.length];
    const user = users[index % users.length];
    if (!skill || !user) throw new Error('skill assessment relation selection failed');
    await prisma.skillAssessment.create({
      data: {
        skillId: skill.id,
        userId: user.id,
        assessorId: adminId,
        level: 1 + Math.floor(random() * 5),
        selfScore: 60 + Math.floor(random() * 41),
        managerScore: 60 + Math.floor(random() * 41),
        period: `2026-${String((index % 12) + 1).padStart(2, '0')}`,
      },
    });
  }

  const trainingMissing = topUpCount(await prisma.trainingPlan.count(), minimum);
  for (let index = 0; index < trainingMissing; index += 1) {
    await prisma.trainingPlan.create({
      data: {
        title: `随机培训计划 ${suffix(index)}`,
        category: pick(['技术', '管理', '安全']),
        trainerName: '测试讲师',
        trainerId: adminId,
        startAt: dateAt(index),
        endAt: dateAt(index, 1),
        location: `测试会议室 ${(index % 5) + 1}`,
        status: pick(['Planned', 'InProgress', 'Completed']),
      },
    });
  }
  const trainings = await prisma.trainingPlan.findMany({
    orderBy: { createdAt: 'asc' },
    take: minimum,
    select: { id: true },
  });
  const participantMissing = topUpCount(await prisma.trainingParticipant.count(), minimum);
  for (let index = 0; index < participantMissing; index += 1) {
    const training = trainings[index % trainings.length];
    const user = users[index % users.length];
    if (!training || !user) throw new Error('training participant relation selection failed');
    await prisma.trainingParticipant.create({
      data: {
        trainingId: training.id,
        userId: user.id,
        attendance: pick(['Invited', 'Attended', 'Absent']),
        score: 60 + Math.floor(random() * 41),
      },
    });
  }
}

async function seedRetrospectivesAndBackups(
  minimum: number,
  adminId: string,
  projects: Array<{ id: string }>,
): Promise<void> {
  const retrospectiveMissing = topUpCount(await prisma.projectRetrospective.count(), minimum);
  for (let index = 0; index < retrospectiveMissing; index += 1) {
    await prisma.projectRetrospective.create({
      data: {
        projectId: pick(projects).id,
        summary: `随机项目复盘 ${suffix(index)}`,
        lessonsLearned: '记录测试场景中的经验与改进项',
        problemCategory: pick(['进度', '质量', '成本', '安全']),
        status: pick(['Draft', 'Published']),
      },
    });
  }
  const retrospectives = await prisma.projectRetrospective.findMany({
    orderBy: { createdAt: 'asc' },
    take: minimum,
    select: { id: true },
  });
  const actionMissing = topUpCount(await prisma.retrospectiveAction.count(), minimum);
  await prisma.retrospectiveAction.createMany({
    data: Array.from({ length: actionMissing }, (_, index) => ({
      retrospectiveId: pick(retrospectives).id,
      title: `随机复盘行动 ${suffix(index)}`,
      ownerId: adminId,
      dueDate: dateAt(index, 10),
      status: pick(['Open', 'InProgress', 'Closed']),
    })),
  });

  const backupMissing = topUpCount(await prisma.backupRecord.count(), minimum);
  await prisma.backupRecord.createMany({
    data: Array.from({ length: backupMissing }, (_, index) => ({
      backupType: pick(['Full', 'Database', 'Files']),
      status: pick(['Pending', 'Completed', 'Failed']),
      storagePath: `test-data/backups/${suffix(index)}.tar.gz`,
      fileSize: BigInt(1024 * (index + 1)),
      requestedBy: adminId,
      startedAt: dateAt(index),
      completedAt: dateAt(index, 1),
    })),
  });
}

async function main(): Promise<void> {
  if (process.env.DEPLOY_ENV !== 'test' || process.env.CONFIRM_TEST_DATA_SEED !== 'YES') {
    throw new Error('test-data generation requires DEPLOY_ENV=test and CONFIRM_TEST_DATA_SEED=YES');
  }
  const minimum = minimumCount();
  const admin = await prisma.user.findUnique({
    where: { username: 'admin' },
    select: { id: true, password: true },
  });
  const role = await prisma.role.findFirst({
    where: { status: 'Active' },
    orderBy: { roleCode: 'asc' },
    select: { id: true },
  });
  if (!admin || !role) throw new Error('base seed must create admin and at least one active role');

  await seedUsers(minimum, admin.password, role.id);
  await seedProjects(minimum, admin.id);
  await seedProjectDetails(minimum, admin.id);
  await seedContentLibraries(minimum, admin.id);
  await seedChecklistAndTools(minimum);
  await seedAdministration(minimum, admin.id);
  await seedIntegrationsAndRates(minimum, admin.id);
  await seedPeopleOperations(minimum, admin.id);

  for (const dataset of testDatasetManifest(prisma)) {
    console.log(`${dataset.name}: ${await dataset.count()}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('test-data generation failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
