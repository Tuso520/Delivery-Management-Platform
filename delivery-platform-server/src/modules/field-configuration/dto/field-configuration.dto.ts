import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const upperOptional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() || undefined : value;

export const FIELD_TYPES = [
  'TEXT',
  'NUMBER',
  'DATE',
  'SINGLE_SELECT',
  'MULTI_SELECT',
  'BOOLEAN',
] as const;

export class FieldPermissionsDto {
  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  view?: string[];

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  edit?: string[];
}

export class QueryFieldConfigurationsDto {
  @ApiPropertyOptional({ description: '使用模块或页面范围编码' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  moduleCode?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  includeDisabled?: boolean;
}

export class CreateFieldConfigurationDto {
  @ApiProperty()
  @Transform(upperOptional)
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,49}$/u, { message: '字段编码只能包含大写字母、数字和下划线，且必须以字母开头' })
  fieldCode!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fieldName!: string;

  @ApiProperty({ enum: FIELD_TYPES })
  @IsIn(FIELD_TYPES)
  fieldType!: typeof FIELD_TYPES[number];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  defaultValue?: unknown;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999999)
  sort?: number;

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  visibleScopes?: string[];

  @ApiPropertyOptional({ type: FieldPermissionsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FieldPermissionsDto)
  permissions?: FieldPermissionsDto;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class UpdateFieldConfigurationDto extends PartialType(CreateFieldConfigurationDto) {}

export class ChangeFieldConfigurationStatusDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class FieldConfigurationSortItemDto {
  @ApiProperty()
  @IsUUID()
  id!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999999)
  sort!: number;
}

export class SortFieldConfigurationsDto {
  @ApiProperty({ type: [FieldConfigurationSortItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FieldConfigurationSortItemDto)
  items!: FieldConfigurationSortItemDto[];
}

export class CheckFieldCodeDto {
  @ApiProperty()
  @Transform(upperOptional)
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,49}$/u)
  fieldCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  excludeId?: string;
}

export class QueryFieldValuesDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional({ enum: ['Active', 'Inactive'] })
  @IsOptional()
  @IsIn(['Active', 'Inactive'])
  status?: 'Active' | 'Inactive';
}

export class CreateFieldValueDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(upperOptional)
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_-]{0,99}$/u, { message: '编码只能包含大写字母、数字、下划线和连字符，且必须以字母开头' })
  code?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999999)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: ['Active', 'Inactive'], default: 'Active' })
  @IsOptional()
  @IsIn(['Active', 'Inactive'])
  status?: 'Active' | 'Inactive';
}

export class UpdateFieldValueDto extends OmitType(CreateFieldValueDto, ['status'] as const) {}

export class ChangeFieldValueStatusDto {
  @ApiProperty({ enum: ['Active', 'Inactive'] })
  @IsIn(['Active', 'Inactive'])
  status!: 'Active' | 'Inactive';
}

export class FieldValueSortItemDto {
  @ApiProperty()
  @IsUUID()
  id!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999999)
  sortOrder!: number;
}

export class SortFieldValuesDto {
  @ApiProperty({ type: [FieldValueSortItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FieldValueSortItemDto)
  items!: FieldValueSortItemDto[];
}

export class BatchFieldOptionsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @MaxLength(50, { each: true })
  @IsString({ each: true })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((item) => typeof item === 'string' ? item.trim().toUpperCase() : item)
      : value,
  )
  codes!: string[];
}
