import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';

export enum PeriodType {
  Quarterly = 'quarterly',
  Yearly = 'yearly',
  Monthly = 'monthly',
}

export enum ObjectiveStatus {
  Active = 'Active',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
}

export class ScoringCriterionDto {
  @ApiProperty({ description: '评分项' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: '评分项权重' })
  @IsInt()
  @Min(0)
  @Max(100)
  weight!: number;

  @ApiPropertyOptional({ description: '评分标准' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '评分标准详细说明' })
  @IsOptional()
  @IsString()
  standard?: string;

  @ApiPropertyOptional({ description: '评分材料与要求' })
  @IsOptional()
  @IsString()
  requirements?: string;

  @ApiPropertyOptional({ description: '参与计算的数据字段' })
  @IsOptional()
  @IsString()
  sourceField?: string;

  @ApiPropertyOptional({ description: '字段计算操作符' })
  @IsOptional()
  @IsString()
  operator?: string;

  @ApiPropertyOptional({ description: '达标阈值' })
  @IsOptional()
  @IsString()
  threshold?: string;
}

export class CreateObjectiveDto {
  @ApiProperty({ description: '目标标题' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: '目标描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: '周期', example: 'Q2' })
  @IsString()
  @IsNotEmpty()
  period: string;

  @ApiProperty({ description: '周期类型', enum: PeriodType })
  @IsString()
  @IsNotEmpty()
  periodType: string;

  @ApiPropertyOptional({ description: '部门ID' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: '权重', default: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  weight?: number;

  @ApiPropertyOptional({ enum: ['OKR', 'KPI'], default: 'OKR' })
  @IsOptional()
  @IsIn(['OKR', 'KPI'])
  goalType?: string;

  @ApiPropertyOptional({
    enum: ['Self', 'Manager', 'MultiScorer', 'Approval'],
    default: 'Manager',
  })
  @IsOptional()
  @IsIn(['Self', 'Manager', 'MultiScorer', 'Approval'])
  scoringFlow?: string;

  @ApiPropertyOptional({
    enum: ['Weighted', 'Average', 'Sum', 'Manual'],
    default: 'Weighted',
  })
  @IsOptional()
  @IsIn(['Weighted', 'Average', 'Sum', 'Manual'])
  scoringMethod?: string;

  @ApiPropertyOptional({ type: [String], description: '评分人用户ID列表' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scorerIds?: string[];

  @ApiPropertyOptional({ type: [ScoringCriterionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoringCriterionDto)
  scoringContent?: ScoringCriterionDto[];

  @ApiPropertyOptional({ description: '评分计算说明' })
  @IsOptional()
  @IsString()
  calculationRule?: string;
}

export class UpdateObjectiveDto {
  @ApiPropertyOptional({ description: '目标标题' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: '目标描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '周期' })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional({ description: '周期类型', enum: PeriodType })
  @IsOptional()
  @IsIn(Object.values(PeriodType))
  periodType?: string;

  @ApiPropertyOptional({ description: '部门ID' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: '权重' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  weight?: number;

  @ApiPropertyOptional({ description: '进度 0-100' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional({ description: '状态', enum: ObjectiveStatus })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: ['OKR', 'KPI'] })
  @IsOptional()
  @IsIn(['OKR', 'KPI'])
  goalType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['Self', 'Manager', 'MultiScorer', 'Approval'])
  scoringFlow?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['Weighted', 'Average', 'Sum', 'Manual'])
  scoringMethod?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scorerIds?: string[];

  @ApiPropertyOptional({ type: [ScoringCriterionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoringCriterionDto)
  scoringContent?: ScoringCriterionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  calculationRule?: string;
}

export class CreateKeyResultDto {
  @ApiProperty({ description: '关键结果标题' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: '目标值' })
  @IsOptional()
  @IsString()
  targetValue?: string;

  @ApiPropertyOptional({ description: '当前值' })
  @IsOptional()
  @IsString()
  currentValue?: string;

  @ApiPropertyOptional({ description: '权重' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  weight?: number;
}

export class UpdateKeyResultDto {
  @ApiPropertyOptional({ description: '关键结果标题' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: '目标值' })
  @IsOptional()
  @IsString()
  targetValue?: string;

  @ApiPropertyOptional({ description: '当前值' })
  @IsOptional()
  @IsString()
  currentValue?: string;

  @ApiPropertyOptional({ description: '权重' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  weight?: number;

  @ApiPropertyOptional({ description: '进度 0-100' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional({ description: '状态' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateScoreDto {
  @ApiPropertyOptional({ description: '自评分 0-100' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  selfScore?: number;

  @ApiPropertyOptional({ description: '项目占比 JSON' })
  @IsOptional()
  @IsString()
  projectRatio?: string;

  @ApiProperty({ description: '月份', example: '2026-06' })
  @IsString()
  @IsNotEmpty()
  month: string;

  @ApiPropertyOptional({ description: '自评备注' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class UpdateScoreDto {
  @ApiPropertyOptional({ description: '自评分 0-100' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  selfScore?: number;

  @ApiPropertyOptional({ description: '项目占比 JSON' })
  @IsOptional()
  @IsString()
  projectRatio?: string;

  @ApiPropertyOptional({ description: '主管评分 0-100' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  managerScore?: number;

  @ApiPropertyOptional({ description: '下月目标' })
  @IsOptional()
  @IsString()
  nextGoal?: string;

  @ApiPropertyOptional({ description: '主管评语' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: '状态' })
  @IsOptional()
  @IsString()
  status?: string;
}
