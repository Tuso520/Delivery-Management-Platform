import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDecimal,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

const paymentStatuses = [
  'Planned',
  'Invoiced',
  'PartiallyReceived',
  'Received',
  'Overdue',
] as const;

export class QueryProjectPaymentDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ enum: paymentStatuses })
  @IsOptional()
  @IsIn(paymentStatuses)
  status?: string;
}

export class CreateProjectPaymentDto {
  @ApiProperty()
  @IsString()
  projectId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  paymentName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  @Matches(MONEY_PATTERN, { message: '付款金额必须为非负数，整数最多16位，小数最多2位' })
  originalAmount!: string;

  @ApiProperty()
  @IsString()
  originalCurrency!: string;

  @ApiProperty()
  @IsString()
  convertedCurrency!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  @Matches(MONEY_PATTERN, { message: '已收金额必须为非负数，整数最多16位，小数最多2位' })
  receivedOriginalAmount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  receivedDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class UpdateProjectPaymentDto extends PartialType(
  CreateProjectPaymentDto,
) {}
