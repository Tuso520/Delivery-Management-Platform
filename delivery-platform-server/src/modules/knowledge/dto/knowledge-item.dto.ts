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
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
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

interface KnowledgePrimaryContentCandidate {
  contentType?: unknown;
  fileVersionId?: unknown;
  markdownContent?: unknown;
  externalUrl?: unknown;
}

function hasKnowledgePrimaryValue(value: unknown): boolean {
  return typeof value === 'string'
    ? value.trim().length > 0
    : value !== undefined && value !== null;
}

function IsExactlyOneKnowledgePrimaryContent(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isExactlyOneKnowledgePrimaryContent',
      target: object.constructor,
      propertyName,
      options: {
        message: 'FILE、MARKDOWN、LINK 内容必须且只能填写对应的一种主内容',
        ...validationOptions,
      },
      validator: {
        validate(_value: unknown, arguments_: ValidationArguments): boolean {
          const candidate = arguments_.object as KnowledgePrimaryContentCandidate;
          const values = {
            FILE: hasKnowledgePrimaryValue(candidate.fileVersionId),
            MARKDOWN: hasKnowledgePrimaryValue(candidate.markdownContent),
            LINK: hasKnowledgePrimaryValue(candidate.externalUrl),
          } as const;
          const populatedCount = Object.values(values).filter(Boolean).length;
          return (
            populatedCount === 1 &&
            typeof candidate.contentType === 'string' &&
            candidate.contentType in values &&
            values[candidate.contentType as keyof typeof values]
          );
        },
      },
    });
  };
}

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
  @IsExactlyOneKnowledgePrimaryContent()
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
  @IsString()
  @MaxLength(20)
  version?: string;

  @IsIn([...KNOWLEDGE_CONTENT_TYPES])
  @IsExactlyOneKnowledgePrimaryContent()
  contentType: (typeof KNOWLEDGE_CONTENT_TYPES)[number];

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

  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  supportingFileVersionIds: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeDescription?: string;
}

export class UpdateKnowledgeVersionDto extends CreateKnowledgeVersionDto {
  @IsInt()
  @Min(1)
  revision: number;
}

export class SubmitKnowledgeReviewDto {
  @IsInt()
  @Min(1)
  revision: number;

  @IsOptional()
  @IsUUID()
  approvalTemplateId?: string;
}
