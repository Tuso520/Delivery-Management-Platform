import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  MaxLength,
} from 'class-validator';

export enum ReportType {
  Daily = 'daily',
  Weekly = 'weekly',
  Monthly = 'monthly',
}

export enum ReportStatus {
  Draft = 'Draft',
  Submitted = 'Submitted',
  Reviewed = 'Reviewed',
}

export class CreateReportDto {
  @ApiProperty({ description: '项目ID' })
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({ description: '报告类型', enum: ReportType })
  @IsString()
  @IsNotEmpty()
  @IsEnum(ReportType)
  reportType: string;

  @ApiProperty({ description: '报告日期', example: '2026-06-23' })
  @IsDateString()
  @IsNotEmpty()
  reportDate: string;

  @ApiProperty({ description: '报告内容' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ description: '工作小时数', example: 8.0 })
  @IsOptional()
  @IsNumber()
  workHours?: number;

  @ApiPropertyOptional({ description: '项目进度' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  projectProgress?: string;

  @ApiPropertyOptional({ description: '回款进度' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  paymentProgress?: string;

  @ApiPropertyOptional({ description: '风险备注' })
  @IsOptional()
  @IsString()
  riskNotes?: string;

  @ApiPropertyOptional({ description: '下一步计划' })
  @IsOptional()
  @IsString()
  nextPlan?: string;
}
