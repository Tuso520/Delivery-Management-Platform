import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateProjectAcceptanceDto {
  @ApiProperty({ description: '当前项目版本号', minimum: 1 })
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiPropertyOptional({ description: '预计验收时间' })
  @IsOptional()
  @IsDateString()
  expectedAcceptanceAt?: string;

  @ApiPropertyOptional({ description: '实际验收时间' })
  @IsOptional()
  @IsDateString()
  actualAcceptanceAt?: string;

  @ApiPropertyOptional({ description: '验收时间调整说明' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
