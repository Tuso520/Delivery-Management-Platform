import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProjectSystemSettingsDto {
  @ApiPropertyOptional({ minimum: 10, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(100)
  defaultPageSize?: number;

  @ApiPropertyOptional({ enum: ['Low', 'Medium', 'High'] })
  @IsOptional()
  @IsIn(['Low', 'Medium', 'High'])
  defaultRiskLevel?: 'Low' | 'Medium' | 'High';
}

export class AttachmentSystemSettingsDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 1024 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1024)
  maxSizeMb?: number;
}

export class FileSystemSettingsDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  @Matches(/^[a-z0-9]+$/, { each: true })
  allowedExtensions?: string[];
}

export class ApprovalSystemSettingsDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 90 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  timeoutDays?: number;
}

export class KnowledgeSystemSettingsDto {
  @ApiPropertyOptional({ minimum: 10, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(100)
  defaultPageSize?: number;
}

export class SecuritySystemSettingsDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 720 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  sessionHours?: number;

  @ApiPropertyOptional({ minimum: 3, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(20)
  loginMaxAttempts?: number;
}

export class PatchSystemSettingsDto {
  @ApiPropertyOptional({ type: ProjectSystemSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProjectSystemSettingsDto)
  project?: ProjectSystemSettingsDto;

  @ApiPropertyOptional({ type: AttachmentSystemSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AttachmentSystemSettingsDto)
  attachment?: AttachmentSystemSettingsDto;

  @ApiPropertyOptional({ type: FileSystemSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FileSystemSettingsDto)
  file?: FileSystemSettingsDto;

  @ApiPropertyOptional({ type: ApprovalSystemSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ApprovalSystemSettingsDto)
  approval?: ApprovalSystemSettingsDto;

  @ApiPropertyOptional({ type: KnowledgeSystemSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => KnowledgeSystemSettingsDto)
  knowledge?: KnowledgeSystemSettingsDto;

  @ApiPropertyOptional({ type: SecuritySystemSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SecuritySystemSettingsDto)
  security?: SecuritySystemSettingsDto;
}
