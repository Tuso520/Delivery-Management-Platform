import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class UploadFileDto {
  @ApiProperty({ description: '关联项目ID' })
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiPropertyOptional({ description: '关联档案目录项ID' })
  @IsOptional()
  @IsString()
  archiveItemId?: string;

  @ApiPropertyOptional({ description: '文件备注' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
