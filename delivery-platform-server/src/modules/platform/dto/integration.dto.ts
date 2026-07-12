import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export const TARGET_INTEGRATION_PROVIDERS = ['FEISHU', 'WECOM'] as const;
export type TargetIntegrationProvider =
  (typeof TARGET_INTEGRATION_PROVIDERS)[number];

export class UpdateTargetIntegrationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  configName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ description: '飞书 App ID' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  appId?: string;

  @ApiPropertyOptional({ writeOnly: true, description: '飞书 App Secret' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  appSecret?: string;

  @ApiPropertyOptional({ description: '企业微信企业 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  corpId?: string;

  @ApiPropertyOptional({ description: '企业微信应用 Agent ID' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  @MaxLength(30)
  agentId?: string;

  @ApiPropertyOptional({ writeOnly: true, description: '企业微信应用 Secret' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  secret?: string;

  @ApiPropertyOptional({ description: '通讯录同步部门 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactDepartmentId?: string;

  @ApiPropertyOptional({ description: '集成测试消息接收人 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  testRecipient?: string;
}

export class QueryIntegrationSyncLogDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['CONNECTION_TEST', 'CONTACT_SYNC', 'NOTIFICATION_TEST'] })
  @IsOptional()
  @IsIn(['CONNECTION_TEST', 'CONTACT_SYNC', 'NOTIFICATION_TEST'])
  action?: string;

  @ApiPropertyOptional({ enum: ['SUCCESS', 'FAILED'] })
  @IsOptional()
  @IsIn(['SUCCESS', 'FAILED'])
  status?: string;
}
