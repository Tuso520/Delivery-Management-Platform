import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateArchiveTemplateVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  versionNo?: string;

  @IsOptional()
  @IsString()
  sourceVersionId?: string;
}

export class ArchiveTemplateVersionItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  stableKey: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  reviewRequired?: boolean;

  @IsOptional()
  @IsString()
  approvalTemplateId?: string;

  @IsOptional()
  @IsString()
  ownerRoleId?: string;

  @IsOptional()
  @IsBoolean()
  allowMultipleFiles?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  allowedExtensions?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  maxFileSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  namingRule?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class ArchiveTemplateVersionFolderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  stableKey: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArchiveTemplateVersionItemDto)
  items: ArchiveTemplateVersionItemDto[];
}

export class UpdateArchiveTemplateVersionDto {
  @IsInt()
  @Min(1)
  revision: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArchiveTemplateVersionFolderDto)
  folders: ArchiveTemplateVersionFolderDto[];
}

export class SubmitArchiveTemplateVersionReviewDto {
  @IsOptional()
  @IsString()
  approvalTemplateId?: string;
}
