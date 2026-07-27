import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDecimal,
  IsDateString,
  IsArray,
  ArrayUnique,
  IsBoolean,
  Max,
  MaxLength,
  Min,
  Matches,
  ValidateNested,
} from 'class-validator';

import type { ProjectDeliveryStage } from '../project.constants';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

export class ProjectPaymentPlanWriteDto {
  @ApiPropertyOptional({ description: '既有款项ID；新建款项不传' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  id?: string;

  @ApiProperty({ description: '付款项' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  paymentName!: string;

  @ApiPropertyOptional({ description: '付款类型', default: 'Milestone' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  paymentType?: string;

  @ApiPropertyOptional({ description: '付款日期' })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiProperty({ description: '原币付款金额' })
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  @Matches(MONEY_PATTERN, { message: '付款金额必须为非负数，整数最多16位，小数最多2位' })
  originalAmount!: string;

  @ApiProperty({ description: '原币币种' })
  @IsString()
  @MaxLength(10)
  originalCurrency!: string;

  @ApiProperty({ description: '折算币种' })
  @IsString()
  @MaxLength(10)
  convertedCurrency!: string;

  @ApiPropertyOptional({ description: '已收原币金额' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  @Matches(MONEY_PATTERN, { message: '已收金额必须为非负数，整数最多16位，小数最多2位' })
  receivedOriginalAmount?: string;

  @ApiPropertyOptional({ description: '收款日期' })
  @IsOptional()
  @IsDateString()
  receivedDate?: string | null;

  @ApiPropertyOptional({ description: '付款条件' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class CreateProjectDto {
  @ApiProperty({ description: '项目名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  projectName: string;

  @ApiPropertyOptional({ description: '项目简称' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shortName?: string | null;

  @ApiProperty({ description: '国家代码', example: 'VN' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  countryCode: string;

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

  @ApiPropertyOptional({ description: '风险等级', default: 'Low' })
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

  @ApiPropertyOptional({ description: '预计验收时间' })
  @IsOptional()
  @IsDateString()
  expectedAcceptanceAt?: string | null;

  @ApiProperty({ description: '档案模板ID（创建时解析其当前已发布版本）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(36)
  archiveTemplateId: string;

  @ApiPropertyOptional({ description: '明确指定的当前已发布档案模板版本ID' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  archiveTemplateVersionId?: string;

  @ApiPropertyOptional({ description: '明确指定的新建项目审批模板ID' })
  @IsOptional()
  @IsString()
  approvalTemplateId?: string;

  @ApiPropertyOptional({ description: '仅保存草稿，不发起新建项目审核', default: false })
  @IsOptional()
  @IsBoolean()
  saveAsDraft?: boolean;

  @ApiPropertyOptional({ description: '随项目统一保存的款项计划', type: [ProjectPaymentPlanWriteDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectPaymentPlanWriteDto)
  paymentPlans?: ProjectPaymentPlanWriteDto[];
}
