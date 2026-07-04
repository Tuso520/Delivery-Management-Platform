import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, IsDateString, MaxLength } from 'class-validator';

export class CreateExchangeRateDto {
  @ApiProperty({ description: '源币种代码', example: 'USD' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  fromCurrency: string;

  @ApiProperty({ description: '目标币种代码', example: 'VND' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  toCurrency: string;

  @ApiProperty({ description: '汇率值', example: 25450.0 })
  @IsNotEmpty()
  @Type(() => Number)
  rate: number;

  @ApiPropertyOptional({ description: '汇率日期', example: '2026-06-22' })
  @IsOptional()
  @IsDateString()
  rateDate?: string;

  @ApiPropertyOptional({ description: '数据来源', example: 'manual' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;
}

export class QueryExchangeRateDto {
  @ApiPropertyOptional({ description: '源币种代码' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: '目标币种代码' })
  @IsOptional()
  @IsString()
  to?: string;
}
