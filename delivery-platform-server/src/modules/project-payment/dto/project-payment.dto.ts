import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

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
  @IsNumber()
  @Min(0)
  originalAmount!: number;

  @ApiProperty()
  @IsString()
  originalCurrency!: string;

  @ApiProperty()
  @IsString()
  convertedCurrency!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  receivedOriginalAmount?: number;

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
