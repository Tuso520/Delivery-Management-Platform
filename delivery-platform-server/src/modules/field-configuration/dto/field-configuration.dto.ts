import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
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

export class UpdateFieldValueDto extends CreateFieldValueDto {}

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
