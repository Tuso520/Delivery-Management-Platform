import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateLanguageDto {
  @ApiPropertyOptional({ description: '语言名称', example: '简体中文' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  languageName?: string;
}
