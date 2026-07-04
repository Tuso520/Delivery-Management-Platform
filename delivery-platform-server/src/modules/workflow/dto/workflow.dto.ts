import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength, IsInt } from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateWorkflowCategoryDto {
  @ApiProperty({ description: '分类名称', example: '项目立项' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: '分类描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '排序号', default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateWorkflowCategoryDto {
  @ApiPropertyOptional({ description: '分类名称' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: '分类描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '排序号' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: '状态', example: 'Active' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}

export class CreateWorkflowDocumentDto {
  @ApiProperty({ description: '分类ID' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(36)
  categoryId: string;

  @ApiProperty({ description: '文档名称', example: '项目交付验收流程' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: '适用范围' })
  @IsOptional()
  @IsString()
  applicableScope?: string;

  @ApiPropertyOptional({ description: '触发条件' })
  @IsOptional()
  @IsString()
  triggerCondition?: string;

  @ApiPropertyOptional({ description: '输入材料' })
  @IsOptional()
  @IsString()
  inputMaterials?: string;

  @ApiPropertyOptional({ description: '输出材料' })
  @IsOptional()
  @IsString()
  outputMaterials?: string;

  @ApiPropertyOptional({ description: '负责角色' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  responsibleRole?: string;

  @ApiPropertyOptional({ description: '流程步骤(JSON格式)' })
  @IsOptional()
  @IsString()
  steps?: string;

  @ApiPropertyOptional({ description: '关联检查清单' })
  @IsOptional()
  @IsString()
  relatedChecklist?: string;

  @ApiPropertyOptional({ description: '关联模板' })
  @IsOptional()
  @IsString()
  relatedTemplates?: string;

  @ApiPropertyOptional({ description: '关联档案' })
  @IsOptional()
  @IsString()
  relatedArchive?: string;

  @ApiPropertyOptional({ description: '风险提示' })
  @IsOptional()
  @IsString()
  riskNotes?: string;

  @ApiPropertyOptional({ description: '版本号', default: 'V1.0' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  version?: string;
}

export class UpdateWorkflowDocumentDto {
  @ApiPropertyOptional({ description: '文档名称' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: '适用范围' })
  @IsOptional()
  @IsString()
  applicableScope?: string;

  @ApiPropertyOptional({ description: '触发条件' })
  @IsOptional()
  @IsString()
  triggerCondition?: string;

  @ApiPropertyOptional({ description: '输入材料' })
  @IsOptional()
  @IsString()
  inputMaterials?: string;

  @ApiPropertyOptional({ description: '输出材料' })
  @IsOptional()
  @IsString()
  outputMaterials?: string;

  @ApiPropertyOptional({ description: '负责角色' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  responsibleRole?: string;

  @ApiPropertyOptional({ description: '流程步骤(JSON格式)' })
  @IsOptional()
  @IsString()
  steps?: string;

  @ApiPropertyOptional({ description: '关联检查清单' })
  @IsOptional()
  @IsString()
  relatedChecklist?: string;

  @ApiPropertyOptional({ description: '关联模板' })
  @IsOptional()
  @IsString()
  relatedTemplates?: string;

  @ApiPropertyOptional({ description: '关联档案' })
  @IsOptional()
  @IsString()
  relatedArchive?: string;

  @ApiPropertyOptional({ description: '风险提示' })
  @IsOptional()
  @IsString()
  riskNotes?: string;

  @ApiPropertyOptional({ description: '版本号' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  version?: string;

  @ApiPropertyOptional({ description: '状态', example: 'Active' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}

export class QueryWorkflowDocumentDto extends PaginationDto {
  @ApiPropertyOptional({ description: '分类ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: '关键词搜索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '状态' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}
