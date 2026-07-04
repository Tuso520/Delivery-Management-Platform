import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryTemplateDto extends PaginationDto {
  @ApiPropertyOptional({ description: '模板分类（精确匹配）' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: '国家代码' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ description: '项目类型' })
  @IsOptional()
  @IsString()
  projectType?: string;

  @ApiPropertyOptional({ description: '语言代码' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: '状态(Draft/Published/Deprecated)' })
  @IsOptional()
  @IsString()
  status?: string;
}
