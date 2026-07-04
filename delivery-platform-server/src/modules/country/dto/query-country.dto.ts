import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryCountryDto extends PaginationDto {
  @ApiPropertyOptional({ description: '关键词搜索(名称)' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '国家状态(Active/Inactive)' })
  @IsOptional()
  @IsString()
  status?: string;
}
