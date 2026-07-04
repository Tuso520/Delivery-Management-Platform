import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export enum ProjectStatusQuery {
  Draft = 'Draft',
  Active = 'Active',
  Suspended = 'Suspended',
  Delayed = 'Delayed',
  Accepted = 'Accepted',
  Archived = 'Archived',
  Closed = 'Closed',
}

export class QueryProjectDto extends PaginationDto {
  @ApiPropertyOptional({ description: '关键词搜索(项目名称/编号)' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '项目状态', enum: ProjectStatusQuery })
  @IsOptional()
  @IsEnum(ProjectStatusQuery)
  projectStatus?: ProjectStatusQuery;

  @ApiPropertyOptional({ description: '国家代码' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ description: '项目类型' })
  @IsOptional()
  @IsString()
  projectType?: string;
}
