import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDictionaryCategoryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  categoryCode!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  categoryName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpsertDictionaryItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  itemValue!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  itemLabel!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  extraData?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateDepartmentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  departmentCode!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  departmentName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
