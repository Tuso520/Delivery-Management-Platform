import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export const REVIEW_SOURCE_TYPES = [
  'PROJECT_ARCHIVE',
  'STANDARD',
  'KNOWLEDGE',
  'ARCHIVE_TEMPLATE',
  'PROJECT_CREATE',
] as const;

export const REVIEW_TASK_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;

export class QueryReviewTaskDto extends PaginationDto {
  @ApiPropertyOptional({ enum: REVIEW_SOURCE_TYPES })
  @IsOptional()
  @IsIn(REVIEW_SOURCE_TYPES)
  sourceType?: (typeof REVIEW_SOURCE_TYPES)[number];

  @ApiPropertyOptional({ enum: REVIEW_TASK_STATUSES })
  @IsOptional()
  @IsIn(REVIEW_TASK_STATUSES)
  status?: (typeof REVIEW_TASK_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;
}

export class ApproveReviewTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class RejectReviewTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  comment: string;
}
