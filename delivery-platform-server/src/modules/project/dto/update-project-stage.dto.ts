import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import { PROJECT_DELIVERY_STAGES, type ProjectDeliveryStage } from '../project.constants';

export class UpdateProjectStageDto {
  @ApiProperty({ description: '当前项目版本号', minimum: 1 })
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiProperty({ enum: PROJECT_DELIVERY_STAGES })
  @IsIn(PROJECT_DELIVERY_STAGES)
  targetStage!: ProjectDeliveryStage;

  @ApiPropertyOptional({ description: '阶段回退或例外调整原因' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
