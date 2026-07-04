import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

import { ReportType, ReportStatus } from './create-report.dto';

export class QueryReportDto extends PaginationDto {
  @ApiPropertyOptional({ description: '项目ID' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: '作者ID' })
  @IsOptional()
  @IsString()
  authorId?: string;

  @ApiPropertyOptional({ description: '报告类型', enum: ReportType })
  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsOptional()
  @IsString()
  @IsEnum(ReportType)
  reportType?: string;

  @ApiPropertyOptional({ description: '开始日期', example: '2026-01-01' })
  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: '结束日期', example: '2026-12-31' })
  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: '状态', enum: ReportStatus })
  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsOptional()
  @IsString()
  status?: string;
}
