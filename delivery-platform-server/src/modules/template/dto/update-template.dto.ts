import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateTemplateDto {
  @ApiPropertyOptional({ description: '模板名称' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: '模板分类' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @ApiPropertyOptional({ description: '适用国家代码' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryCode?: string;

  @ApiPropertyOptional({ description: '适用项目类型' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  projectType?: string;

  @ApiPropertyOptional({ description: '适用阶段' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  stageCode?: string;

  @ApiPropertyOptional({ description: '适用角色' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  applicableRole?: string;

  @ApiPropertyOptional({ description: '语言代码' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional({ description: '文件格式' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  fileFormat?: string;

  @ApiPropertyOptional({ description: '存储路径' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  storagePath?: string;
}
