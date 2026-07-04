import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateTemplateVersionDto {
  @ApiProperty({ description: '版本号', example: 'V1.0' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  versionNo: string;

  @ApiPropertyOptional({ description: '已上传的模板附件ID' })
  @ValidateIf((dto: CreateTemplateVersionDto) => !dto.storagePath)
  @IsString()
  @IsNotEmpty()
  attachmentId?: string;

  @ApiPropertyOptional({ description: '兼容历史数据的存储路径' })
  @ValidateIf((dto: CreateTemplateVersionDto) => !dto.attachmentId)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  storagePath?: string;

  @ApiPropertyOptional({ description: '变更说明' })
  @IsOptional()
  @IsString()
  changeNotes?: string;
}
