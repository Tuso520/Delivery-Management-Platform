import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsDecimal,
  IsDateString,
  IsInt,
  IsArray,
  ArrayUnique,
  MaxLength,
  Min,
  Max,
  Matches,
  ValidateNested,
} from 'class-validator';

import type { ProjectDeliveryStage } from '../project.constants';

import { ProjectPaymentPlanWriteDto } from './create-project.dto';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

export class UpdateProjectDto {
  @ApiProperty({ description: '当前项目版本号', minimum: 1 })
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiPropertyOptional({ description: '项目名称' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  projectName?: string;

  @ApiPropertyOptional({ description: '项目简称' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shortName?: string | null;

  @ApiPropertyOptional({ description: '国家代码' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryCode?: string;

  @ApiPropertyOptional({ description: '城市' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @ApiPropertyOptional({ description: '客户名称' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string | null;

  @ApiPropertyOptional({ description: '客户类型（取自字段配置）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerType?: string;

  @ApiPropertyOptional({ description: '项目类型（取自项目配置）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  projectType?: string;

  @ApiPropertyOptional({ description: '合同类型（取自项目配置）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contractType?: string;

  @ApiPropertyOptional({ description: '产品（取自项目配置）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  product?: string;

  @ApiPropertyOptional({ description: '项目关键词（取自项目配置）', isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  keywords?: string[];

  @ApiPropertyOptional({ description: '合同币种' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  contractCurrency?: string;

  @ApiPropertyOptional({ description: '基准币种' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  baseCurrency?: string;

  @ApiPropertyOptional({ description: '合同金额' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  @Matches(MONEY_PATTERN, { message: '合同金额必须为非负数，整数最多16位，小数最多2位' })
  contractAmount?: string;

  @ApiPropertyOptional({ description: '合同编号' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contractNo?: string | null;

  @ApiPropertyOptional({ description: '合同签署时间' })
  @IsOptional()
  @IsDateString()
  contractSignedAt?: string | null;

  @ApiPropertyOptional({ description: '项目语言' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  projectLanguage?: string;

  @ApiPropertyOptional({ description: '销售负责人ID' })
  @IsOptional()
  @IsString()
  salesOwnerId?: string | null;

  @ApiPropertyOptional({ description: '项目经理ID' })
  @IsOptional()
  @IsString()
  projectManagerId?: string | null;

  @ApiPropertyOptional({ description: '电气负责人ID' })
  @IsOptional()
  @IsString()
  electricalOwnerId?: string | null;

  @ApiPropertyOptional({ description: '软件负责人ID' })
  @IsOptional()
  @IsString()
  softwareOwnerId?: string | null;

  @ApiPropertyOptional({ description: '风险等级' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  riskLevel?: string;

  @ApiPropertyOptional({ description: '风险说明' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  riskDescription?: string;

  @ApiPropertyOptional({ description: '开始日期' })
  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @ApiPropertyOptional({ description: '计划结束日期' })
  @IsOptional()
  @IsDateString()
  plannedEndDate?: string | null;

  @ApiPropertyOptional({ description: '目标交付阶段，取值来自 PROJECT_STAGE 字段配置' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_-]{0,99}$/u)
  deliveryStage?: ProjectDeliveryStage;

  @ApiPropertyOptional({ description: '项目进度百分比' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @ApiPropertyOptional({ description: '预计验收时间' })
  @IsOptional()
  @IsDateString()
  expectedAcceptanceAt?: string | null;

  @ApiPropertyOptional({ description: '随项目统一保存的完整款项计划集合', type: [ProjectPaymentPlanWriteDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectPaymentPlanWriteDto)
  paymentPlans?: ProjectPaymentPlanWriteDto[];
}
