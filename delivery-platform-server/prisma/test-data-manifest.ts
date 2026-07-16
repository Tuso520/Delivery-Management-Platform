import type { PrismaClient } from '@prisma/client';

export interface TestDatasetCount {
  count: () => Promise<number>;
  name: string;
}

export function testDatasetManifest(prisma: PrismaClient): TestDatasetCount[] {
  return [
    { name: 'users', count: () => prisma.user.count({ where: { deletedAt: null } }) },
    { name: 'projects', count: () => prisma.project.count({ where: { deletedAt: null } }) },
    { name: 'project process records', count: () => prisma.projectProcessRecord.count() },
    { name: 'project payments', count: () => prisma.projectPayment.count() },
    { name: 'standards', count: () => prisma.standard.count() },
    { name: 'knowledge items', count: () => prisma.knowledgeItem.count() },
    { name: 'checklist templates', count: () => prisma.checklistTemplate.count() },
    { name: 'tools', count: () => prisma.toolItem.count() },
    { name: 'departments', count: () => prisma.department.count() },
    { name: 'notifications', count: () => prisma.notification.count() },
    { name: 'notification rules', count: () => prisma.notificationRule.count() },
    { name: 'operation logs', count: () => prisma.operationLog.count() },
    { name: 'system configs', count: () => prisma.systemConfig.count() },
    { name: 'dashboard widgets', count: () => prisma.dashboardWidget.count() },
    { name: 'integration configs', count: () => prisma.integrationConfig.count() },
    { name: 'integration sync logs', count: () => prisma.integrationSyncLog.count() },
    { name: 'exchange rates', count: () => prisma.exchangeRate.count() },
    { name: 'daily reports', count: () => prisma.dailyReport.count({ where: { deletedAt: null } }) },
    { name: 'OKR objectives', count: () => prisma.okrObjective.count() },
    { name: 'key results', count: () => prisma.keyResult.count() },
    { name: 'performance scores', count: () => prisma.performanceScore.count() },
    { name: 'approval templates', count: () => prisma.approvalTemplate.count() },
    { name: 'approval tasks', count: () => prisma.approvalTask.count() },
    { name: 'skill definitions', count: () => prisma.skillDefinition.count() },
    { name: 'skill assessments', count: () => prisma.skillAssessment.count() },
    { name: 'training plans', count: () => prisma.trainingPlan.count() },
    { name: 'training participants', count: () => prisma.trainingParticipant.count() },
    { name: 'project retrospectives', count: () => prisma.projectRetrospective.count() },
    { name: 'retrospective actions', count: () => prisma.retrospectiveAction.count() },
    { name: 'backup records', count: () => prisma.backupRecord.count() },
  ];
}
