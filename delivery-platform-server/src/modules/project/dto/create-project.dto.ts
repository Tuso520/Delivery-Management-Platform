import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDateString,
  IsIn,
  IsArray,
  ArrayUnique,
  IsBoolean,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  PROJECT_DELIVERY_STAGES,
  type ProjectDeliveryStage,
} from '../project.constants';

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
  shortName?: string;

  @ApiProperty({ description: '国家代码', example: 'VN' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  countryCode: string;

  @ApiPropertyOptional({ description: '城市' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ description: '客户名称' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

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
  @IsNumber()
  @Min(0)
  contractAmount?: number;

  @ApiPropertyOptional({ description: '合同编号' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contractNo?: string;

  @ApiPropertyOptional({ description: '合同签署时间' })
  @IsOptional()
  @IsDateString()
  contractSignedAt?: string;

  @ApiPropertyOptional({ description: '项目语言' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  projectLanguage?: string;

  @ApiPropertyOptional({ description: '销售负责人ID' })
  @IsOptional()
  @IsString()
  salesOwnerId?: string;

  @ApiPropertyOptional({ description: '项目经理ID' })
  @IsOptional()
  @IsString()
  projectManagerId?: string;

  @ApiPropertyOptional({ description: '电气负责人ID' })
  @IsOptional()
  @IsString()
  electricalOwnerId?: string;

  @ApiPropertyOptional({ description: '软件负责人ID' })
  @IsOptional()
  @IsString()
  softwareOwnerId?: string;

  @ApiPropertyOptional({ description: '目标交付阶段', enum: PROJECT_DELIVERY_STAGES })
  @IsOptional()
  @IsIn(PROJECT_DELIVERY_STAGES)
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
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '计划结束日期' })
  @IsOptional()
  @IsString()
  plannedEndDate?: string;

  @ApiPropertyOptional({ description: '预计验收时间' })
  @IsOptional()
  @IsDateString()
  expectedAcceptanceAt?: string;

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
}
