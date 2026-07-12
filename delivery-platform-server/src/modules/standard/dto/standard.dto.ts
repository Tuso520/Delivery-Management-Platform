import type { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const STANDARD_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'REJECTED',
  'PUBLISHED',
  'ARCHIVED',
] as const;

export const STANDARD_RELATION_TYPES = [
  'SUPPORTING_FORM',
  'SUPPORTING_TEMPLATE',
  'REFERENCES',
  'REPLACES',
  'PRECONDITION',
  'FOLLOW_UP',
] as const;

export class QueryStandardDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsIn([...STANDARD_STATUSES])
  status?: (typeof STANDARD_STATUSES)[number];
}

export class CreateStandardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9._-]+$/)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  type: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsDateString()
  effectiveAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsUUID()
  fileVersionId?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsObject()
  structuredContent?: Prisma.InputJsonObject | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsObject()
  applicability?: Prisma.InputJsonObject | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeDescription?: string;
}

export class UpdateStandardDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9._-]+$/)
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  type?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsDateString()
  effectiveAt?: string | null;
}

export class CreateStandardVersionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  revision?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsUUID()
  fileVersionId?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsObject()
  structuredContent?: Prisma.InputJsonObject | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsObject()
  applicability?: Prisma.InputJsonObject | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsDateString()
  effectiveAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeDescription?: string;
}

export class SubmitStandardReviewDto {
  @IsOptional()
  @IsUUID()
  approvalTemplateId?: string;
}

export class CreateStandardRelationDto {
  @IsUUID()
  targetStandardId: string;

  @IsIn([...STANDARD_RELATION_TYPES])
  relationType: (typeof STANDARD_RELATION_TYPES)[number];
}
