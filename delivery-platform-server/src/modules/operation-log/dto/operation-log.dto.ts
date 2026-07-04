import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryOperationLogDto extends PaginationDto {
  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: '模块' })
  @IsOptional()
  @IsString()
  module?: string;

  @ApiPropertyOptional({ description: '操作类型' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: '目标类型' })
  @IsOptional()
  @IsString()
  targetType?: string;

  @ApiPropertyOptional({ description: '开始日期' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: '操作结果' })
  @IsOptional()
  @IsString()
  result?: string;
}

export class CreateOperationLogDto {
  @ApiProperty({ description: '用户ID' })
  @IsString()
  userId: string;

  @ApiProperty({ description: '模块' })
  @IsString()
  module: string;

  @ApiProperty({ description: '操作类型' })
  @IsString()
  action: string;

  @ApiProperty({ description: '目标类型' })
  @IsString()
  targetType: string;

  @ApiProperty({ description: '目标ID' })
  @IsString()
  targetId: string;

  @ApiPropertyOptional({ description: '操作前数据' })
  @IsOptional()
  beforeData?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '操作后数据' })
  @IsOptional()
  afterData?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'IP地址' })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional({ description: 'User-Agent' })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiPropertyOptional({ description: '操作结果' })
  @IsOptional()
  @IsString()
  result?: string;
}
