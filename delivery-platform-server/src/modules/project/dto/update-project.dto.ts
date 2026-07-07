import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateProjectDto {
  @ApiPropertyOptional({ description: '项目名称' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  projectName?: string;

  @ApiPropertyOptional({ description: '国家代码' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryCode?: string;

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

  @ApiPropertyOptional({ description: '项目类型' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  projectType?: string;

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
  electricLeaderId?: string;

  @ApiPropertyOptional({ description: '软件负责人ID' })
  @IsOptional()
  @IsString()
  softwareLeaderId?: string;

  @ApiPropertyOptional({ description: '采购负责人ID' })
  @IsOptional()
  @IsString()
  purchaseOwnerId?: string;

  @ApiPropertyOptional({ description: '财务负责人ID' })
  @IsOptional()
  @IsString()
  financeOwnerId?: string;

  @ApiPropertyOptional({ description: '当前阶段' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  currentStage?: string;

  @ApiPropertyOptional({ description: '项目状态' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  projectStatus?: string;

  @ApiPropertyOptional({ description: '风险等级' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  riskLevel?: string;

  @ApiPropertyOptional({ description: '开始日期' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '计划结束日期' })
  @IsOptional()
  @IsString()
  plannedEndDate?: string;

  @ApiPropertyOptional({ description: '实际结束日期' })
  @IsOptional()
  @IsString()
  actualEndDate?: string;
}
