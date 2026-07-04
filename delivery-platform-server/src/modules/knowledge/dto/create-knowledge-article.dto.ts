import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsInt,
  IsBoolean,
} from 'class-validator';

export class CreateKnowledgeArticleDto {
  @ApiProperty({ description: '分类ID' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty({ description: '文章标题' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: '适用国家代码', example: 'VN' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryCode?: string;

  @ApiPropertyOptional({ description: '适用项目类型', example: 'Electric' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  projectType?: string;

  @ApiPropertyOptional({ description: '适用阶段', example: 'Kickoff' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  stageCode?: string;

  @ApiPropertyOptional({ description: '适用角色', example: 'PROJECT_MANAGER' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  applicableRole?: string;

  @ApiPropertyOptional({ description: '背景说明' })
  @IsOptional()
  @IsString()
  background?: string;

  @ApiPropertyOptional({ description: '标准实践' })
  @IsOptional()
  @IsString()
  standardPractice?: string;

  @ApiPropertyOptional({ description: '步骤说明' })
  @IsOptional()
  @IsString()
  steps?: string;

  @ApiPropertyOptional({ description: '备注说明' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: '常见错误' })
  @IsOptional()
  @IsString()
  commonMistakes?: string;

  @ApiPropertyOptional({ description: '关联流程' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  relatedFlow?: string;

  @ApiPropertyOptional({ description: '关联检查项' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  relatedChecklist?: string;

  @ApiPropertyOptional({ description: '关联模板' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  relatedTemplate?: string;

  @ApiPropertyOptional({ description: '内容类型: article | file', example: 'article' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contentType?: string;

  @ApiPropertyOptional({ description: '文件URL（当contentType=file时）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string;

  @ApiPropertyOptional({ description: '文件大小（字节）' })
  @IsOptional()
  @IsInt()
  fileSize?: number;

  @ApiPropertyOptional({ description: '文件扩展名', example: 'pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  fileExt?: string;

  @ApiPropertyOptional({ description: 'Markdown 正文' })
  @IsOptional()
  @IsString()
  markdownContent?: string;

  @ApiPropertyOptional({ description: '原始资料状态', example: 'Ready' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sourceStatus?: string;

  @ApiPropertyOptional({ description: '是否需要修订' })
  @IsOptional()
  @IsBoolean()
  needsRevision?: boolean;
}
