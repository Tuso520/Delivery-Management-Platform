import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean } from 'class-validator';

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

export class CreateNotificationDto {
  @ApiProperty({ description: '用户ID' })
  @IsString()
  userId: string;

  @ApiProperty({ description: '通知标题' })
  @IsString()
  title: string;

  @ApiProperty({ description: '通知内容' })
  @IsString()
  content: string;

  @ApiProperty({ description: '通知类型' })
  @IsString()
  notificationType: string;

  @ApiPropertyOptional({ description: '关联类型' })
  @IsOptional()
  @IsString()
  relatedType?: string;

  @ApiPropertyOptional({ description: '关联ID' })
  @IsOptional()
  @IsString()
  relatedId?: string;
}

export class CreateNotificationRuleDto {
  @ApiProperty({ description: '规则名称' })
  @IsString()
  name: string;

  @ApiProperty({ description: '事件类型' })
  @IsString()
  eventType: string;

  @ApiPropertyOptional({ description: '通知渠道' })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({ description: '接收角色' })
  @IsOptional()
  @IsString()
  recipientRole?: string;

  @ApiPropertyOptional({ description: '通知模板' })
  @IsOptional()
  @IsString()
  template?: string;

  @ApiPropertyOptional({ description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class UpdateNotificationRuleDto {
  @ApiPropertyOptional({ description: '规则名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '事件类型' })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({ description: '通知渠道' })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({ description: '接收角色' })
  @IsOptional()
  @IsString()
  recipientRole?: string;

  @ApiPropertyOptional({ description: '通知模板' })
  @IsOptional()
  @IsString()
  template?: string;

  @ApiPropertyOptional({ description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
