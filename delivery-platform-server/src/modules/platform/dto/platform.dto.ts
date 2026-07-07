import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

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

export class ApprovalStepDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  stepOrder!: number;

  @ApiProperty()
  @IsString()
  stepName!: string;

  @ApiProperty({ enum: ['role', 'user'] })
  @IsIn(['role', 'user'])
  approverType!: string;

  @ApiProperty()
  @IsString()
  approverValue!: string;
}

export class UpsertApprovalTemplateDto {
  @ApiProperty()
  @IsString()
  templateCode!: string;

  @ApiProperty()
  @IsString()
  templateName!: string;

  @ApiProperty()
  @IsString()
  businessType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiProperty({ type: [ApprovalStepDto] })
  @IsArray()
  @Type(() => ApprovalStepDto)
  steps!: ApprovalStepDto[];
}

export class CreateApprovalTaskDto {
  @ApiProperty()
  @IsString()
  templateId!: string;

  @ApiProperty()
  @IsString()
  businessId!: string;
}

export class DecideApprovalTaskDto {
  @ApiProperty({ enum: ['Approved', 'Rejected'] })
  @IsIn(['Approved', 'Rejected'])
  decision!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class QueryPlatformDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '业务类型，多个值用英文逗号分隔' })
  @IsOptional()
  @IsString()
  businessType?: string;
}

export class UpsertSkillDto {
  @ApiProperty()
  @IsString()
  skillCode!: string;

  @ApiProperty()
  @IsString()
  skillName!: string;

  @ApiProperty()
  @IsString()
  category!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxLevel?: number;
}

export class AssessSkillDto {
  @ApiProperty()
  @IsString()
  skillId!: string;

  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(10)
  level!: number;

  @ApiPropertyOptional({ description: '人员自评分 0-100' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  selfScore?: number;

  @ApiPropertyOptional({ description: '上级评分 0-100' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  managerScore?: number;

  @ApiProperty()
  @IsString()
  period!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evidenceNote?: string;
}

export class UpsertTrainingDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsString()
  category!: string;

  @ApiProperty()
  @IsDateString()
  startAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trainerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trainerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class TrainingParticipantDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attendance?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number;
}

export class UpsertRetrospectiveDto {
  @ApiProperty()
  @IsString()
  projectId!: string;

  @ApiProperty()
  @IsString()
  summary!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lessonsLearned?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  problemCategory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class RetrospectiveActionDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsString()
  ownerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  verificationNote?: string;
}

export class UpsertIntegrationDto {
  @ApiProperty()
  @IsString()
  provider!: string;

  @ApiProperty()
  @IsString()
  configName!: string;

  @ApiProperty()
  @IsObject()
  configValue!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateBackupDto {
  @ApiProperty({ enum: ['database'] })
  @IsIn(['database'])
  backupType!: string;
}
