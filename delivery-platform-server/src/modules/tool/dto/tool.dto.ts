import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const TOOL_TYPES = ['INTERNAL', 'EXTERNAL'] as const;
export type ToolType = (typeof TOOL_TYPES)[number];

export class QueryToolsDto {
  @ApiPropertyOptional({ description: '按分类名称筛选' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({
    description: '包含停用工具，仅 tools:manage 可使用',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  includeDisabled?: boolean;
}

export class CreateToolDefinitionDto {
  @ApiProperty({ description: '工具名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: '工具分类名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category: string;

  @ApiPropertyOptional({ description: '工具说明' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: TOOL_TYPES, description: '内部路由或外部链接' })
  @IsIn(TOOL_TYPES)
  toolType: ToolType;

  @ApiPropertyOptional({ description: '内部路由或 HTTP(S) 外部地址' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  routeOrUrl?: string;

  @ApiPropertyOptional({ description: '工具运行配置', type: Object })
  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '排序号', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateToolDefinitionDto {
  @ApiPropertyOptional({ description: '工具名称' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: '工具分类名称' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ description: '工具说明' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: TOOL_TYPES, description: '内部路由或外部链接' })
  @IsOptional()
  @IsIn(TOOL_TYPES)
  toolType?: ToolType;

  @ApiPropertyOptional({ description: '内部路由或 HTTP(S) 外部地址' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  routeOrUrl?: string;

  @ApiPropertyOptional({ description: '工具运行配置', type: Object })
  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '排序号' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
