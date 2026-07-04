import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateCountryDto {
  @ApiPropertyOptional({ description: '中文名称', example: '越南' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nameZh?: string;

  @ApiPropertyOptional({ description: '英文名称', example: 'Vietnam' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nameEn?: string;

  @ApiPropertyOptional({ description: '默认语言代码', example: 'vi' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  defaultLanguage?: string;

  @ApiPropertyOptional({ description: '默认币种代码', example: 'VND' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  defaultCurrency?: string;

  @ApiPropertyOptional({ description: '时区', example: 'Asia/Ho_Chi_Minh' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @ApiPropertyOptional({ description: '周末规则', example: 'Sat-Sun' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  weekendRule?: string;

  @ApiPropertyOptional({ description: '入境要求' })
  @IsOptional()
  @IsString()
  entryRequirements?: string;

  @ApiPropertyOptional({ description: '安全注意事项' })
  @IsOptional()
  @IsString()
  safetyNotes?: string;

  @ApiPropertyOptional({ description: '税务注意事项' })
  @IsOptional()
  @IsString()
  taxNotes?: string;

  @ApiPropertyOptional({ description: '付款注意事项' })
  @IsOptional()
  @IsString()
  paymentNotes?: string;

  @ApiPropertyOptional({ description: '供应商注意事项' })
  @IsOptional()
  @IsString()
  supplierNotes?: string;
}
