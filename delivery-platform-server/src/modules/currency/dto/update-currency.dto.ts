import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateCurrencyDto {
  @ApiPropertyOptional({ description: '币种名称', example: '美元' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  currencyName?: string;

  @ApiPropertyOptional({ description: '币种符号', example: '$' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currencySymbol?: string;

  @ApiPropertyOptional({ description: '小数位数', default: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8)
  decimalPlaces?: number;

  @ApiPropertyOptional({ description: '该币种折算为人民币的汇率' })
  @IsOptional()
  @IsNumber()
  @Min(0.00000001)
  cnyRate?: number;
}
