import { PrismaClient } from '@prisma/client';

export async function seedProjectOperations(
  prisma: PrismaClient,
  adminId: string,
): Promise<void> {
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      contractAmount: { not: null },
      contractCurrency: { not: null },
      baseCurrency: { not: null },
      exchangeRate: { not: null },
      exchangeRateDate: { not: null },
    },
    orderBy: { projectCode: 'asc' },
  });

  for (const [projectIndex, project] of projects.entries()) {
    const milestones = [
      { name: '合同签订款', ratio: 0.3, offsetDays: -90, receivedRatio: 1 },
      {
        name: '设备到场款',
        ratio: 0.4,
        offsetDays: projectIndex % 2 === 0 ? -15 : 30,
        receivedRatio: projectIndex % 3 === 0 ? 0.5 : 0,
      },
      { name: '验收尾款', ratio: 0.3, offsetDays: 120, receivedRatio: 0 },
    ];

    for (const milestone of milestones) {
      const existing = await prisma.projectPayment.findFirst({
        where: {
          projectId: project.id,
          paymentName: milestone.name,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (existing) continue;

      const originalAmount = project.contractAmount!.mul(milestone.ratio);
      const receivedOriginalAmount = originalAmount.mul(
        milestone.receivedRatio,
      );
      const dueDate = new Date();
      dueDate.setUTCDate(dueDate.getUTCDate() + milestone.offsetDays);
      const isReceived = milestone.receivedRatio === 1;
      const isPartial = milestone.receivedRatio > 0 && !isReceived;
      const status = isReceived
        ? 'Received'
        : isPartial
          ? 'PartiallyReceived'
          : dueDate.getTime() < Date.now()
            ? 'Overdue'
            : 'Planned';

      await prisma.projectPayment.create({
        data: {
          projectId: project.id,
          paymentName: milestone.name,
          paymentType: 'Milestone',
          dueDate,
          receivedDate: milestone.receivedRatio > 0 ? new Date() : null,
          status,
          originalAmount,
          originalCurrency: project.contractCurrency!,
          exchangeRate: project.exchangeRate!,
          convertedCurrency: project.baseCurrency!,
          convertedAmount: originalAmount.mul(project.exchangeRate!),
          receivedOriginalAmount,
          receivedConvertedAmount: receivedOriginalAmount.mul(
            project.exchangeRate!,
          ),
          rateDate: project.exchangeRateDate!,
          rateSource: project.exchangeRateSource ?? 'project_rate',
          remark: '平台初始化的项目回款里程碑，可按实际合同调整。',
          createdBy: adminId,
        },
      });
    }

    const processDefinitions = [
      {
        title: '项目启动与团队确认',
        recordType: 'Meeting',
        description: '完成项目目标、范围、角色分工和沟通机制确认。',
      },
      {
        title: '本周交付进展记录',
        recordType: 'Progress',
        description: '记录本周完成事项、待协调问题和下一阶段计划。',
      },
      {
        title: '现场文件与影像记录',
        recordType: 'Inspection',
        description: '用于上传施工、调试、验收等过程文件、照片和视频。',
      },
    ] as const;
    for (const [recordIndex, definition] of processDefinitions.entries()) {
      const existing = await prisma.projectProcessRecord.findFirst({
        where: {
          projectId: project.id,
          title: definition.title,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (existing) continue;
      const recordDate = new Date();
      recordDate.setUTCDate(recordDate.getUTCDate() - recordIndex * 7);
      await prisma.projectProcessRecord.create({
        data: {
          projectId: project.id,
          title: definition.title,
          recordType: definition.recordType,
          stageCode: project.currentStage,
          recordDate,
          description: definition.description,
          createdBy: adminId,
        },
      });
    }
  }
}
