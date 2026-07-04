import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class GenerateArchiveDto {
  @ApiProperty({ description: '档案模板ID' })
  @IsString()
  templateId: string;
}

export class UpdateArchiveItemDto {
  @ApiPropertyOptional({ description: '负责人用户ID' })
  @IsOptional()
  @IsString()
  responsibleUserId?: string;

  @ApiPropertyOptional({ description: '审核人用户ID' })
  @IsOptional()
  @IsString()
  reviewUserId?: string;

  @ApiPropertyOptional({ description: '状态' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @ApiPropertyOptional({ description: '截止日期' })
  @IsOptional()
  @IsString()
  dueDate?: string;
}
