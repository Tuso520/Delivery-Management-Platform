import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryNotificationDto extends PaginationDto {
  @ApiPropertyOptional({ description: '是否已读' })
  @IsOptional()
  @IsString()
  isRead?: string;

  @ApiPropertyOptional({ description: '通知类型' })
  @IsOptional()
  @IsString()
  notificationType?: string;
}

export const NOTIFICATION_CHANNELS = ['IN_APP', 'FEISHU', 'WECOM'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_RECIPIENT_POLICY_TYPES = [
  'BUSINESS_OWNER',
  'PROJECT_MEMBERS',
  'ROLE',
  'USER',
] as const;
export type NotificationRecipientPolicyType = (typeof NOTIFICATION_RECIPIENT_POLICY_TYPES)[number];

export class NotificationRecipientPolicyDto {
  @ApiProperty({ enum: NOTIFICATION_RECIPIENT_POLICY_TYPES })
  @IsIn(NOTIFICATION_RECIPIENT_POLICY_TYPES)
  type: NotificationRecipientPolicyType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  values?: string[];
}

export class CreateTargetNotificationRuleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  eventType: string;

  @ApiProperty({ enum: NOTIFICATION_CHANNELS, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsIn(NOTIFICATION_CHANNELS, { each: true })
  channels: NotificationChannel[];

  @ApiProperty({ type: NotificationRecipientPolicyDto })
  @ValidateNested()
  @Type(() => NotificationRecipientPolicyDto)
  recipientPolicy: NotificationRecipientPolicyDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(36)
  templateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateTargetNotificationRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  eventType?: string;

  @ApiPropertyOptional({ enum: NOTIFICATION_CHANNELS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsIn(NOTIFICATION_CHANNELS, { each: true })
  channels?: NotificationChannel[];

  @ApiPropertyOptional({ type: NotificationRecipientPolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationRecipientPolicyDto)
  recipientPolicy?: NotificationRecipientPolicyDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(36)
  templateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
