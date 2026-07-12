import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export const TARGET_APPROVAL_BUSINESS_TYPES = [
  'PROJECT_CREATE',
  'PROJECT_ARCHIVE_FILE',
  'STANDARD',
  'KNOWLEDGE',
  'ARCHIVE_TEMPLATE',
] as const;

export type TargetApprovalBusinessType =
  (typeof TARGET_APPROVAL_BUSINESS_TYPES)[number];

export const TARGET_APPROVAL_STEP_MODES = ['SINGLE', 'ALL_SIGN', 'ANY_N', 'PARALLEL'] as const;
export type TargetApprovalStepMode = (typeof TARGET_APPROVAL_STEP_MODES)[number];

export class TargetApprovalStepDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  stepOrder: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  stepName: string;

  @ApiProperty({ enum: TARGET_APPROVAL_STEP_MODES })
  @IsIn(TARGET_APPROVAL_STEP_MODES)
  mode: TargetApprovalStepMode;

  @ApiPropertyOptional({ minimum: 1, description: 'ANY_N 模式必填，其他模式由服务端归一化' })
  @IsOptional()
  @IsInt()
  @Min(1)
  requiredCount?: number;

  @ApiProperty({ enum: ['role', 'user'] })
  @IsIn(['role', 'user'])
  approverType: 'role' | 'user';

  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  approverValues: string[];
}

export class CreateTargetApprovalTemplateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  templateCode: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  templateName: string;

  @ApiProperty({ enum: TARGET_APPROVAL_BUSINESS_TYPES })
  @IsIn(TARGET_APPROVAL_BUSINESS_TYPES)
  businessType: TargetApprovalBusinessType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ type: [TargetApprovalStepDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TargetApprovalStepDto)
  steps: TargetApprovalStepDto[];
}

export class UpdateTargetApprovalTemplateDto extends PartialType(
  CreateTargetApprovalTemplateDto,
) {}

export class QueryTargetApprovalTemplateDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional({ enum: TARGET_APPROVAL_BUSINESS_TYPES })
  @IsOptional()
  @IsIn(TARGET_APPROVAL_BUSINESS_TYPES)
  businessType?: TargetApprovalBusinessType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
