import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateTranslationDto {
  @ApiProperty({ description: '内容类型', example: 'country' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  contentType: string;

  @ApiProperty({ description: '内容ID', example: 'uuid' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  contentId: string;

  @ApiProperty({ description: '字段名', example: 'nameZh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fieldName: string;

  @ApiProperty({ description: '语言代码', example: 'en-US' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  languageCode: string;

  @ApiProperty({ description: '字段值（翻译内容）' })
  @IsString()
  @IsNotEmpty()
  fieldValue: string;
}

export class UpdateTranslationDto {
  @ApiPropertyOptional({ description: '字段值（翻译内容）' })
  @IsOptional()
  @IsString()
  fieldValue?: string;
}

export class QueryTranslationDto {
  @ApiProperty({ description: '内容类型', example: 'country' })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiPropertyOptional({ description: '内容ID；UI 字库查询时可省略' })
  @IsOptional()
  @IsString()
  contentId?: string;

  @ApiPropertyOptional({ description: '语言代码' })
  @IsOptional()
  @IsString()
  languageCode?: string;
}
