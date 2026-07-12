import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryCountryDto extends PaginationDto {
  @ApiPropertyOptional({ description: '按国家中英文名称或代码搜索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '国家状态；默认只返回 Active' })
  @IsOptional()
  @IsString()
  status?: string;
}
