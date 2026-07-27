import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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
