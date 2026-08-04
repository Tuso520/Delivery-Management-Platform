import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn, IsString } from 'class-validator';

export class ReplacePermissionAssignmentsDto {
  @ApiProperty({ type: [String], description: '显式允许的权限码完整集合' })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  allow!: string[];

  @ApiProperty({ type: [String], description: '显式禁止的权限码完整集合' })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  deny!: string[];
}

export class PermissionAssignmentItemDto {
  @IsString()
  permissionCode!: string;

  @IsIn(['ALLOW', 'DENY'])
  effect!: 'ALLOW' | 'DENY';
}
