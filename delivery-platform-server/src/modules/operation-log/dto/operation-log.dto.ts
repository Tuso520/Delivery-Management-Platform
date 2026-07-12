import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryOperationLogDto extends PaginationDto {
  @ApiPropertyOptional({ description: '模糊搜索模块、动作、对象或 Trace ID' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional({ description: '用户 ID' })
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
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: '操作结果' })
  @IsOptional()
  @IsString()
  result?: string;

  @ApiPropertyOptional({ description: 'Trace ID' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  traceId?: string;
}

export class CreateOperationLogDto {
  @ApiProperty({ description: '用户 ID' })
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

  @ApiPropertyOptional({ description: 'IP 地址' })
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

  @ApiPropertyOptional({ description: 'Trace ID' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  traceId?: string;

  @ApiPropertyOptional({ description: '失败原因' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  errorReason?: string;
}
