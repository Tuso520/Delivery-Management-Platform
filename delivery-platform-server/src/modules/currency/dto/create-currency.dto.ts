import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, MaxLength } from 'class-validator';

export class CreateCurrencyDto {
  @ApiProperty({ description: '币种代码', example: 'USD' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
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
  decimalPlaces?: number;
}
