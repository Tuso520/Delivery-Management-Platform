import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateLanguageDto {
  @ApiProperty({ description: '语言代码', example: 'zh-CN' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  languageCode: string;

  @ApiProperty({ description: '语言名称', example: '简体中文' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  languageName: string;
}
