import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateReviewDto {
  @ApiPropertyOptional({ description: '审核意见' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ReviewDecisionDto {
  @ApiProperty({ description: '审核结果', example: 'Approved' })
  @IsString()
  reviewStatus: string;

  @ApiPropertyOptional({ description: '审核意见' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
