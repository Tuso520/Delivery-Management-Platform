import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTemporaryArchiveItemDto {
  @ApiProperty({ description: '临时档案项名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: '档案项说明' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: '创建临时档案项的原因' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiProperty({ description: '负责人用户 ID' })
  @IsString()
  @IsNotEmpty()
  ownerUserId: string;

  @ApiPropertyOptional({ description: '是否必填', default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ description: '是否需要审核', default: false })
  @IsOptional()
  @IsBoolean()
  reviewRequired?: boolean;

  @ApiPropertyOptional({ description: '审核模板 ID；需要审核时必填' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  approvalTemplateId?: string;

  @ApiPropertyOptional({ description: '是否建议加入档案模板', default: false })
  @IsOptional()
  @IsBoolean()
  suggestedForTemplate?: boolean;

  @ApiPropertyOptional({ description: '是否允许多个文件', default: false })
  @IsOptional()
  @IsBoolean()
  allowMultipleFiles?: boolean;

  @ApiPropertyOptional({ description: '允许的文件扩展名' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  allowedExtensions?: string[];
}

export class SyncProjectArchiveTemplateDto {
  @ApiProperty({
    description: '显式确认只新增同步，不修改或删除现有档案项',
    example: true,
  })
  @IsBoolean()
  confirmAdditions: boolean;

  @ApiPropertyOptional({ description: '仅同步指定文件夹稳定标识；为空时同步全部新增文件夹' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  folderStableKeys?: string[];

  @ApiPropertyOptional({ description: '仅同步指定文件项稳定标识；为空时同步全部新增文件项' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  itemStableKeys?: string[];
}

export class ArchiveProjectItemDto {
  @ApiPropertyOptional({ description: '归档或恢复原因' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
