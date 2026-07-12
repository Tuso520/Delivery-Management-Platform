import { ApiProperty } from '@nestjs/swagger';

export class ProjectSummaryDto {
  @ApiProperty({ example: 25 })
  total: number;

  @ApiProperty({ example: 18 })
  active: number;

  @ApiProperty({ example: 3 })
  accepted: number;

  @ApiProperty({ example: 2 })
  highRisk: number;
}

export const DASHBOARD_TASK_TYPES = [
  'FILE_REVIEW',
  'FILE_REVISION',
  'PROJECT_RISK',
  'PROJECT_STAGE',
  'SYSTEM_NOTIFICATION',
] as const;

export type DashboardTaskType = (typeof DASHBOARD_TASK_TYPES)[number];

export class DashboardTaskDto {
  @ApiProperty({ example: 'review-task-id' })
  id: string;

  @ApiProperty({ enum: DASHBOARD_TASK_TYPES, example: 'FILE_REVIEW' })
  type: DashboardTaskType;

  @ApiProperty({ example: '审核项目实施计划 V2.0' })
  title: string;

  @ApiProperty({ type: String, nullable: true, example: '项目档案 / 项目实施计划' })
  description: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'PROJECT_ARCHIVE' })
  sourceType: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'source-id' })
  sourceId: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'project-id' })
  projectId: string | null;

  @ApiProperty({ type: String, nullable: true, example: '越南冷站节能项目' })
  projectName: string | null;

  @ApiProperty({ enum: ['URGENT', 'HIGH', 'NORMAL'], example: 'HIGH' })
  priority: 'URGENT' | 'HIGH' | 'NORMAL';

  @ApiProperty({ type: String, nullable: true, example: '2026-07-12T08:00:00.000Z' })
  dueAt: string | null;

  @ApiProperty({ example: '2026-07-11T08:00:00.000Z' })
  createdAt: string;
}

export class HighRiskProjectDto {
  @ApiProperty({ example: 'project-id' })
  id: string;

  @ApiProperty({ example: 'VN-LG-2026-001' })
  projectCode: string;

  @ApiProperty({ example: '越南冷站节能项目' })
  projectName: string;

  @ApiProperty({ enum: ['High', 'Critical'], example: 'High' })
  riskLevel: string;

  @ApiProperty({ type: String, nullable: true, example: '关键设备交期存在延误风险' })
  riskDescription: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'CONSTRUCTION' })
  currentStage: string | null;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;

  @ApiProperty({ type: String, nullable: true, example: '2026-08-01T00:00:00.000Z' })
  expectedAcceptanceAt: string | null;

  @ApiProperty({ example: '2026-07-11T08:00:00.000Z' })
  updatedAt: string;
}

export class RecentProjectDto {
  @ApiProperty({ example: 'project-id' })
  id: string;

  @ApiProperty({ example: 'VN-LG-2026-001' })
  projectCode: string;

  @ApiProperty({ example: '越南冷站节能项目' })
  projectName: string;

  @ApiProperty({ example: 'VN' })
  countryCode: string;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;

  @ApiProperty({ example: 'Medium' })
  riskLevel: string;

  @ApiProperty({ type: String, nullable: true, example: 'CONSTRUCTION' })
  currentStage: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 62.5 })
  progressPercent: number | null;

  @ApiProperty({ example: '2026-07-11T08:00:00.000Z' })
  updatedAt: string;
}

export class RecentActivityDto {
  @ApiProperty({ example: 'operation-log-id' })
  id: string;

  @ApiProperty({ example: 'project' })
  module: string;

  @ApiProperty({ example: 'stage_update' })
  action: string;

  @ApiProperty({ example: 'project-id' })
  projectId: string;

  @ApiProperty({ example: '越南冷站节能项目' })
  projectName: string;

  @ApiProperty({ example: '项目经理' })
  actorName: string;

  @ApiProperty({ example: '2026-07-11T08:00:00.000Z' })
  occurredAt: string;
}
