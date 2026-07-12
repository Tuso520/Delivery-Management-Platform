import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export const USER_REFERENCE_PURPOSES = [
  'project-member',
  'project-manager',
  'sales-owner',
  'file-reviewer',
] as const;

export type UserReferencePurpose = (typeof USER_REFERENCE_PURPOSES)[number];

export const ROLE_REFERENCE_PURPOSES = ['notification-recipient'] as const;

export type RoleReferencePurpose = (typeof ROLE_REFERENCE_PURPOSES)[number];

export class QueryUserReferenceDto {
  @ApiProperty({ enum: USER_REFERENCE_PURPOSES })
  @IsIn(USER_REFERENCE_PURPOSES)
  purpose!: UserReferencePurpose;

  @ApiPropertyOptional({
    description: '文件审核人选项按项目数据范围过滤时传入项目ID',
  })
  @IsOptional()
  @IsString()
  projectId?: string;
}

export class QueryRoleReferenceDto {
  @ApiProperty({ enum: ROLE_REFERENCE_PURPOSES })
  @IsIn(ROLE_REFERENCE_PURPOSES)
  purpose!: RoleReferencePurpose;
}
