import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
} from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateArchiveTemplateDto {
  @ApiProperty({ description: '模板编码' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  templateCode: string;

  @ApiProperty({ description: '模板名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  templateName: string;

  @ApiPropertyOptional({ description: '项目类型' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  projectType?: string;

  @ApiPropertyOptional({ description: '国家代码' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryCode?: string;

  @ApiPropertyOptional({ description: '语言代码' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  languageCode?: string;

  @ApiPropertyOptional({ description: '版本', default: 'V1.0' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  version?: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateArchiveTemplateDto {
  @ApiPropertyOptional({ description: '模板名称' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  templateName?: string;

  @ApiPropertyOptional({ description: '项目类型' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  projectType?: string;

  @ApiPropertyOptional({ description: '国家代码' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryCode?: string;

  @ApiPropertyOptional({ description: '语言代码' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  languageCode?: string;

  @ApiPropertyOptional({ description: '版本' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  version?: string;

  @ApiPropertyOptional({ description: '状态' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class QueryArchiveTemplateDto {
  @ApiPropertyOptional({ description: '项目类型' })
  @IsOptional()
  @IsString()
  projectType?: string;

  @ApiPropertyOptional({ description: '国家代码' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ description: '语言代码' })
  @IsOptional()
  @IsString()
  languageCode?: string;
}

export class CreateArchiveTemplateItemDto {
  @ApiProperty({ description: '阶段编码' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  stageCode: string;

  @ApiProperty({ description: '名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: '父级ID' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ description: '层级', default: 1 })
  @IsOptional()
  @IsInt()
  level?: number;

  @ApiPropertyOptional({ description: '第二名称' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  secondName?: string;

  @ApiPropertyOptional({ description: '用途说明' })
  @IsOptional()
  @IsString()
  usageDescription?: string;

  @ApiPropertyOptional({ description: '是否必需', default: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: '是否星标', default: false })
  @IsOptional()
  @IsBoolean()
  isStar?: boolean;

  @ApiPropertyOptional({ description: '是否敏感', default: false })
  @IsOptional()
  @IsBoolean()
  isSensitive?: boolean;

  @ApiPropertyOptional({ description: '需要审核', default: false })
  @IsOptional()
  @IsBoolean()
  needReview?: boolean;

  @ApiPropertyOptional({ description: '负责人角色' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  responsibleRole?: string;

  @ApiPropertyOptional({ description: '审核人角色' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  reviewRole?: string;

  @ApiPropertyOptional({
    description: '允许的文件类型',
    example: ['pdf', 'docx', 'xlsx', 'jpg', 'png'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(
    ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'zip'],
    { each: true },
  )
  evidenceFileTypes?: string[];

  @ApiPropertyOptional({ description: '排序', default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateArchiveTemplateItemDto extends PartialType(
  CreateArchiveTemplateItemDto,
) {}
