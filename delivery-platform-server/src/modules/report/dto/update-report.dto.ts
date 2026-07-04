import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, MaxLength } from 'class-validator';

export class UpdateReportDto {
  @ApiPropertyOptional({ description: '报告内容' })
  @IsOptional()
  @IsString()
  content?: string;

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
