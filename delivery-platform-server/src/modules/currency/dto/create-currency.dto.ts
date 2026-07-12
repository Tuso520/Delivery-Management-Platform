import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCurrencyDto {
  @ApiProperty({ description: 'ISO 币种代码', example: 'USD' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  @Matches(/^[A-Z]{3,10}$/)
  currencyCode: string;

  @ApiProperty({ description: '币种名称', example: '美元' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  currencyName: string;

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
}
