import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ReviewReportDto {
  @ApiProperty({ description: '审核状态', example: 'Reviewed' })
  @IsString()
  @IsNotEmpty()
  status: string;
}
