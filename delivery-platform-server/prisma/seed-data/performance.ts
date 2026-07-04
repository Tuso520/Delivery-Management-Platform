import { Prisma, PrismaClient } from '@prisma/client';

interface ObjectiveSeed {
  title: string;
  description: string;
  period: string;
  periodType: 'yearly' | 'quarterly' | 'monthly';
  goalType: 'OKR' | 'KPI';
  progress: number;
  keyResults: Array<{
    title: string;
    targetValue: string;
    currentValue: string;
    weight: number;
    progress: number;
  }>;
}

export async function seedReportsAndPerformance(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, projectName: true },
  });
  if (!project) return;

  const reportSeeds = [
    {
      reportType: 'daily',
      reportDate: new Date('2026-06-23T00:00:00Z'),
      project,
      content: '完成控制柜点检、现场进度确认和当日问题闭环。',
      workHours: 8,
      projectProgress: '现场安装完成 82%，控制柜上电检查通过。',
      paymentProgress: '第二阶段回款资料已提交客户确认。',
      riskNotes: '两台传感器到货时间需继续跟踪。',
      nextPlan: '完成通信联调并更新档案记录。',
      status: 'Reviewed',
    },
    {
      reportType: 'weekly',
      reportDate: new Date('2026-06-22T00:00:00Z'),
      project,
      content: '完成本周施工计划、资料归档和下周调试资源确认。',
      workHours: 40,
      projectProgress: '关键设备安装完成，整体进度符合周计划。',
      paymentProgress: '按合同节点准备验收与回款支撑材料。',
      riskNotes: '关注跨国物流到货时间和现场施工许可。',
      nextPlan: '完成调试前检查并提交现场记录。',
      status: 'Submitted',
    },
    {
      reportType: 'monthly',
      reportDate: new Date('2026-06-01T00:00:00Z'),
      project,
      content: '完成月度交付复盘、成本与回款跟踪以及下月资源计划。',
      workHours: 168,
      projectProgress: '本月完成深化设计和主要设备采购，累计进度 56%。',
      paymentProgress: '首付款已到账，第二阶段开票资料准备中。',
      riskNotes: '软件接口协议仍有两项待客户确认。',
      nextPlan: '进入设备安装阶段并完成接口冻结。',
      status: 'Draft',
    },
  ] as const;

  for (const report of reportSeeds) {
    const existing = await prisma.dailyReport.findFirst({
      where: {
        projectId: report.project.id,
        authorId: userId,
        reportType: report.reportType,
        reportDate: report.reportDate,
        deletedAt: null,
      },
      select: { id: true },
    });
    const data = {
      content: report.content,
      workHours: report.workHours,
      projectProgress: report.projectProgress,
      paymentProgress: report.paymentProgress,
      riskNotes: report.riskNotes,
      nextPlan: report.nextPlan,
      status: report.status,
    };
    if (!existing) {
      await prisma.dailyReport.create({
        data: {
          projectId: report.project.id,
          authorId: userId,
          reportType: report.reportType,
          reportDate: report.reportDate,
          ...data,
        },
      });
    }
  }

  const objectiveSeeds: ObjectiveSeed[] = [
    {
      title: '2026 年度交付经营指标',
      description: '年度 KPI 聚焦项目准时交付、回款、质量和客户满意度。',
      period: '2026',
      periodType: 'yearly',
      goalType: 'KPI',
      progress: 52,
      keyResults: [
        {
          title: '年度回款完成率',
          targetValue: '95%',
          currentValue: '51%',
          weight: 35,
          progress: 54,
        },
        {
          title: '项目准时交付率',
          targetValue: '90%',
          currentValue: '82%',
          weight: 30,
          progress: 67,
        },
        {
          title: '重大质量事故',
          targetValue: '0 起',
          currentValue: '0 起',
          weight: 20,
          progress: 100,
        },
        {
          title: '客户满意度',
          targetValue: '92 分',
          currentValue: '88 分',
          weight: 15,
          progress: 72,
        },
      ],
    },
    {
      title: '2026 年度标准化交付体系建设',
      description: '年度 OKR 用于建立跨区域统一的流程、档案和知识体系。',
      period: '2026',
      periodType: 'yearly',
      goalType: 'OKR',
      progress: 46,
      keyResults: [
        {
          title: '核心交付流程覆盖率达到 100%',
          targetValue: '100%',
          currentValue: '72%',
          weight: 35,
          progress: 72,
        },
        {
          title: '项目档案完整率达到 95%',
          targetValue: '95%',
          currentValue: '84%',
          weight: 35,
          progress: 68,
        },
        {
          title: '完成 60 篇可复用知识沉淀',
          targetValue: '60 篇',
          currentValue: '28 篇',
          weight: 30,
          progress: 47,
        },
      ],
    },
    {
      title: '第二季度海外项目风险闭环',
      description: '季度 OKR 聚焦高风险项目治理和跨团队协同。',
      period: '2026-Q2',
      periodType: 'quarterly',
      goalType: 'OKR',
      progress: 68,
      keyResults: [
        {
          title: '高风险事项按期关闭率',
          targetValue: '100%',
          currentValue: '86%',
          weight: 40,
          progress: 86,
        },
        {
          title: '关键里程碑延期项目降至 1 个以内',
          targetValue: '≤1 个',
          currentValue: '2 个',
          weight: 35,
          progress: 50,
        },
        {
          title: '完成 3 次跨部门项目复盘',
          targetValue: '3 次',
          currentValue: '2 次',
          weight: 25,
          progress: 67,
        },
      ],
    },
    {
      title: '六月项目执行与知识沉淀',
      description: '月度 KPI 关注个人项目执行、工时报告和知识输出。',
      period: '2026-06',
      periodType: 'monthly',
      goalType: 'KPI',
      progress: 78,
      keyResults: [
        {
          title: '负责项目计划完成率',
          targetValue: '95%',
          currentValue: '88%',
          weight: 45,
          progress: 88,
        },
        {
          title: '日报周报按时提交率',
          targetValue: '100%',
          currentValue: '100%',
          weight: 25,
          progress: 100,
        },
        {
          title: '输出专业知识文档',
          targetValue: '3 篇',
          currentValue: '2 篇',
          weight: 30,
          progress: 67,
        },
      ],
    },
  ];

  const scorerIds = [userId];
  for (const seed of objectiveSeeds) {
    const existing = await prisma.okrObjective.findFirst({
      where: { ownerId: userId, title: seed.title },
      select: { id: true },
    });
    const objectiveData = {
      description: seed.description,
      period: seed.period,
      periodType: seed.periodType,
      goalType: seed.goalType,
      progress: seed.progress,
      scoringFlow: 'Approval',
      scoringMethod: 'Weighted',
      scorerIds: scorerIds as Prisma.InputJsonValue,
      scoringContent: [
        {
          name: '指标完成度',
          weight: 70,
          standard: '以目标值与实际值的完成比例为基础分。',
          requirements: '必须提供系统记录、交付文件或回款凭证。',
          sourceField: 'keyResultProgress',
          operator: 'weighted_average',
        },
        {
          name: '交付质量与协同',
          weight: 30,
          standard: '结合质量问题、风险闭环和跨团队协同情况评分。',
          requirements: '说明关键贡献、问题闭环和改进事项。',
          sourceField: 'managerScore',
          operator: 'manual',
        },
      ] as Prisma.InputJsonValue,
      calculationRule: '指标完成度 × 70% + 交付质量与协同 × 30%',
    };
    const objective =
      existing ??
      (await prisma.okrObjective.create({
        data: {
          title: seed.title,
          ownerId: userId,
          weight: 100,
          ...objectiveData,
        },
        select: { id: true },
      }));

    for (const keyResult of seed.keyResults) {
      const existingKeyResult = await prisma.keyResult.findFirst({
        where: { objectiveId: objective.id, title: keyResult.title },
        select: { id: true },
      });
      if (!existingKeyResult) {
        await prisma.keyResult.create({
          data: { objectiveId: objective.id, ...keyResult },
        });
      }
    }
  }

  const monthlyObjective = await prisma.okrObjective.findFirst({
    where: { ownerId: userId, title: '六月项目执行与知识沉淀' },
    select: { id: true },
  });
  if (monthlyObjective) {
    await prisma.performanceScore.upsert({
      where: {
        objectiveId_month_scorerId: {
          objectiveId: monthlyObjective.id,
          month: '2026-06',
          scorerId: userId,
        },
      },
      create: {
        objectiveId: monthlyObjective.id,
        scorerId: userId,
        month: '2026-06',
        selfScore: 86,
        managerScore: 88,
        projectRatio: JSON.stringify({
          [project.id]: { projectName: project.projectName, ratio: 100 },
        }),
        comment: '完成当月项目节点、工时报告和两篇知识沉淀。',
        nextGoal: '提高档案一次审核通过率并完成第三篇知识文档。',
        status: 'Completed',
      },
      update: {},
    });
  }
}
