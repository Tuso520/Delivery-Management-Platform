import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const KNOWLEDGE_CONTENT_TYPES = ['FILE', 'MARKDOWN', 'LINK'] as const;
export const KNOWLEDGE_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'REJECTED',
  'PUBLISHED',
  'ARCHIVED',
] as const;

export class QueryKnowledgeItemDto {
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
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn([...KNOWLEDGE_CONTENT_TYPES])
  contentType?: (typeof KNOWLEDGE_CONTENT_TYPES)[number];

  @IsOptional()
  @IsIn([...KNOWLEDGE_STATUSES])
  status?: (typeof KNOWLEDGE_STATUSES)[number];
}

export class CreateKnowledgeItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  summary?: string;

  @IsIn([...KNOWLEDGE_CONTENT_TYPES])
  contentType: (typeof KNOWLEDGE_CONTENT_TYPES)[number];

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
  @IsString()
  markdownContent?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2000)
  externalUrl?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  supportingFileVersionIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeDescription?: string;
}

export class UpdateKnowledgeItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(1000)
  summary?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsDateString()
  effectiveAt?: string | null;
}

export class CreateKnowledgeVersionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  revision?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;

  @IsOptional()
  @IsIn([...KNOWLEDGE_CONTENT_TYPES])
  contentType?: (typeof KNOWLEDGE_CONTENT_TYPES)[number];

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsUUID()
  fileVersionId?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString()
  markdownContent?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2000)
  externalUrl?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  supportingFileVersionIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeDescription?: string;
}

export class SubmitKnowledgeReviewDto {
  @IsOptional()
  @IsUUID()
  approvalTemplateId?: string;
}
