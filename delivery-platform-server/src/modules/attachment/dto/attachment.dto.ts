import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export const attachmentOwnerTypes = [
  'KnowledgeArticle',
  'KnowledgeFileRevision',
  'ChecklistItem',
  'TrainingPlan',
  'ProjectProcessRecord',
  'Retrospective',
  'Report',
  'DocumentTemplate',
] as const;

export type AttachmentOwnerType = (typeof attachmentOwnerTypes)[number];
export const attachmentCaptureSources = ['camera', 'album', 'file'] as const;
export type AttachmentCaptureSource =
  (typeof attachmentCaptureSources)[number];

export class UploadAttachmentDto {
  @ApiProperty({ enum: attachmentOwnerTypes, description: '附件所属业务类型' })
  @IsIn(attachmentOwnerTypes)
  ownerType!: AttachmentOwnerType;

  @ApiProperty({ description: '所属业务记录ID' })
  @IsString()
  @MaxLength(36)
  ownerId!: string;

  @ApiPropertyOptional({ description: '关联项目ID' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  projectId?: string;

  @ApiPropertyOptional({ description: '附件分类，如 before/during/after/document' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  category?: string;

  @ApiPropertyOptional({ description: '拍摄时间，ISO 8601' })
  @IsOptional()
  @IsISO8601()
  capturedAt?: string;

  @ApiPropertyOptional({
    enum: attachmentCaptureSources,
    description: '现场证据来源',
  })
  @IsOptional()
  @IsIn(attachmentCaptureSources)
  captureSource?: AttachmentCaptureSource;

  @ApiPropertyOptional({ description: '纬度' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: '经度' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: '附件说明' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class QueryAttachmentDto extends PaginationDto {
  @ApiPropertyOptional({ enum: attachmentOwnerTypes })
  @IsOptional()
  @IsIn(attachmentOwnerTypes)
  ownerType?: AttachmentOwnerType;

  @ApiPropertyOptional({ description: '所属业务记录ID' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ description: '关联项目ID' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: '附件分类' })
  @IsOptional()
  @IsString()
  category?: string;
}
