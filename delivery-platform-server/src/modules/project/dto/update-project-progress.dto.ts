import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { PROJECT_DELIVERY_STAGES, type ProjectDeliveryStage } from '../project.constants';

export class UpdateProjectProgressDto {
  @ApiProperty({ description: '当前项目版本号', minimum: 1 })
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiProperty({ enum: PROJECT_DELIVERY_STAGES })
  @IsIn(PROJECT_DELIVERY_STAGES)
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
