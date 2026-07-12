import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  PROJECT_LIFECYCLE_STATUSES,
  PROJECT_SUMMARY_FILTERS,
  type ProjectLifecycleStatus,
  type ProjectSummaryFilter,
} from '../project.constants';

export class QueryProjectDto extends PaginationDto {
  @ApiPropertyOptional({ description: '关键词搜索(项目名称/编号)' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '项目生命周期状态', enum: PROJECT_LIFECYCLE_STATUSES })
  @IsOptional()
  @IsIn(PROJECT_LIFECYCLE_STATUSES)
  lifecycleStatus?: ProjectLifecycleStatus;

  @ApiPropertyOptional({ description: '国家代码' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ description: '项目类型' })
  @IsOptional()
  @IsString()
  projectType?: string;

  @ApiPropertyOptional({ enum: PROJECT_SUMMARY_FILTERS })
  @IsOptional()
  @IsIn(PROJECT_SUMMARY_FILTERS)
  summaryFilter?: ProjectSummaryFilter;

  @ApiPropertyOptional({
    description: '排序规则',
    enum: ['updatedAt:desc', 'updatedAt:asc', 'projectName:asc', 'projectName:desc'],
  })
  @IsOptional()
  @IsIn(['updatedAt:desc', 'updatedAt:asc', 'projectName:asc', 'projectName:desc'])
  sort?: string;
}
