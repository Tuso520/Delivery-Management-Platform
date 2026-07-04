import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty({ description: '模板名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: '模板分类', example: 'Contract' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  category: string;

  @ApiPropertyOptional({ description: '适用国家代码', example: 'VN' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryCode?: string;

  @ApiPropertyOptional({ description: '适用项目类型', example: 'Electric' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  projectType?: string;

  @ApiPropertyOptional({ description: '适用阶段', example: 'Kickoff' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  stageCode?: string;

  @ApiPropertyOptional({ description: '适用角色', example: 'PROJECT_MANAGER' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  applicableRole?: string;

  @ApiProperty({ description: '语言代码', default: 'zh-CN' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiPropertyOptional({ description: '文件格式', example: 'docx' })
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
