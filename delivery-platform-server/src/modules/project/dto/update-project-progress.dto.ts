import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import type { ProjectDeliveryStage } from '../project.constants';

export class UpdateProjectProgressDto {
  @ApiProperty({ description: '当前项目版本号', minimum: 1 })
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiProperty({ description: '目标交付阶段，取值来自 PROJECT_STAGE 字段配置' })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_-]{0,99}$/u)
  targetStage!: ProjectDeliveryStage;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  progressPercent!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedAcceptanceAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actualAcceptanceAt?: string;

  @ApiPropertyOptional({ description: '阶段回退或进度变更说明' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
