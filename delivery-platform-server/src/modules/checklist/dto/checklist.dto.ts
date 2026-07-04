import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChecklistItemStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, MaxLength, IsEnum, IsInt, Min, IsBoolean, IsArray, ArrayMinSize } from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateChecklistTemplateDto {
  @ApiProperty({ description: '模板编码', example: 'CL-TPL-DC-VN' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  templateCode: string;

  @ApiProperty({ description: '模板名称', example: '交付检查清单-越南' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  templateName: string;

  @ApiPropertyOptional({ description: '国家代码', example: 'VN' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryCode?: string;

  @ApiPropertyOptional({ description: '项目类型' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  projectType?: string;

  @ApiPropertyOptional({ description: '阶段代码' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  stageCode?: string;

  @ApiPropertyOptional({ description: '版本号', default: 'V1.0' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  version?: string;
}

export class UpdateChecklistTemplateDto {
  @ApiPropertyOptional({ description: '模板名称' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  templateName?: string;

  @ApiPropertyOptional({ description: '国家代码' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryCode?: string;

  @ApiPropertyOptional({ description: '项目类型' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  projectType?: string;

  @ApiPropertyOptional({ description: '阶段代码' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  stageCode?: string;

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

export class CreateChecklistTemplateItemDto {
  @ApiProperty({ description: '检查项名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  itemName: string;

  @ApiPropertyOptional({ description: '检查项描述' })
  @IsOptional()
  @IsString()
  itemDescription?: string;

  @ApiPropertyOptional({ description: '检查标准' })
  @IsOptional()
  @IsString()
  checkStandard?: string;

  @ApiPropertyOptional({ description: '所需证据' })
  @IsOptional()
  @IsString()
  evidenceRequired?: string;

  @ApiPropertyOptional({
    description: '允许的证据类型',
    type: [String],
    example: ['photo', 'file'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceTypes?: string[];

  @ApiPropertyOptional({ description: '最少证据数量', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minEvidenceCount?: number;

  @ApiPropertyOptional({ description: '是否允许从相册选择', default: true })
  @IsOptional()
  @IsBoolean()
  allowAlbum?: boolean;

  @ApiPropertyOptional({ description: '照片是否必须包含定位', default: false })
  @IsOptional()
  @IsBoolean()
  requireLocation?: boolean;

  @ApiPropertyOptional({ description: '关联档案模板项ID' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  relatedArchiveTemplateItemId?: string;

  @ApiPropertyOptional({ description: '是否必填', default: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: '风险等级', default: 'Low' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  riskLevel?: string;

  @ApiPropertyOptional({ description: '负责角色编码' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  responsibleRole?: string;

  @ApiPropertyOptional({ description: '审核角色编码' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  reviewRole?: string;

  @ApiPropertyOptional({ description: '排序号', default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateChecklistTemplateItemDto {
  @ApiPropertyOptional({ description: '检查项名称' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  itemName?: string;

  @ApiPropertyOptional({ description: '检查项描述' })
  @IsOptional()
  @IsString()
  itemDescription?: string;

  @ApiPropertyOptional({ description: '检查标准' })
  @IsOptional()
  @IsString()
  checkStandard?: string;

  @ApiPropertyOptional({ description: '所需证据' })
  @IsOptional()
  @IsString()
  evidenceRequired?: string;

  @ApiPropertyOptional({ description: '允许的证据类型', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceTypes?: string[];

  @ApiPropertyOptional({ description: '最少证据数量' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minEvidenceCount?: number;

  @ApiPropertyOptional({ description: '是否允许从相册选择' })
  @IsOptional()
  @IsBoolean()
  allowAlbum?: boolean;

  @ApiPropertyOptional({ description: '照片是否必须包含定位' })
  @IsOptional()
  @IsBoolean()
  requireLocation?: boolean;

  @ApiPropertyOptional({ description: '关联档案模板项ID' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  relatedArchiveTemplateItemId?: string;

  @ApiPropertyOptional({ description: '是否必填' })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: '风险等级' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  riskLevel?: string;

  @ApiPropertyOptional({ description: '负责角色编码' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  responsibleRole?: string;

  @ApiPropertyOptional({ description: '审核角色编码' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  reviewRole?: string;

  @ApiPropertyOptional({ description: '排序号' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class ReorderItemsDto {
  @ApiProperty({ description: '检查项ID排序列表', example: ['id1', 'id2', 'id3'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  itemIds: string[];
}

export class UpdateProjectChecklistItemDto {
  @ApiPropertyOptional({ description: '检查项名称' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  itemName?: string;

  @ApiPropertyOptional({ description: '检查标准' })
  @IsOptional()
  @IsString()
  checkStandard?: string;

  @ApiPropertyOptional({ description: '所需证据' })
  @IsOptional()
  @IsString()
  evidenceRequired?: string;

  @ApiPropertyOptional({ description: '负责人ID' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  responsibleUserId?: string;

  @ApiPropertyOptional({ description: '审核人ID' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  reviewUserId?: string;

  @ApiPropertyOptional({ description: '截止日期' })
  @IsOptional()
  @Type(() => Date)
  dueDate?: Date;

  @ApiPropertyOptional({ description: '检查结果', example: 'Pass' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  result?: string;

  @ApiPropertyOptional({ description: '检查说明' })
  @IsOptional()
  @IsString()
  resultNote?: string;
}

export class ReviewChecklistItemDto {
  @ApiProperty({ description: '审核状态', enum: ChecklistItemStatus })
  @IsEnum(ChecklistItemStatus)
  status: ChecklistItemStatus;

  @ApiPropertyOptional({ description: '审核意见' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class GenerateChecklistDto {
  @ApiProperty({ description: '检查清单模板ID' })
  @IsString()
  @IsNotEmpty()
  templateId: string;
}

export class QueryChecklistTemplateDto extends PaginationDto {
  @ApiPropertyOptional({ description: '关键词搜索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '国家代码' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryCode?: string;

  @ApiPropertyOptional({ description: '项目类型' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  projectType?: string;

  @ApiPropertyOptional({ description: '状态' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}
