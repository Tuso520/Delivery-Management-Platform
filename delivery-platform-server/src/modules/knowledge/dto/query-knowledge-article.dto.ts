import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryKnowledgeArticleDto extends PaginationDto {
  @ApiPropertyOptional({ description: '分类ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: '关键词搜索(标题)' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '状态(Draft/Reviewing/Published/Deprecated/Archived)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '国家代码' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ description: '项目类型' })
  @IsOptional()
  @IsString()
  projectType?: string;

  @ApiPropertyOptional({ description: '内容类型: article | file' })
  @IsOptional()
  @IsString()
  contentType?: string;

  @ApiPropertyOptional({ description: '原始资料状态' })
  @IsOptional()
  @IsString()
  sourceStatus?: string;
}
