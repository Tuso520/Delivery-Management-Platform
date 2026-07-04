import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class AddProjectMemberDto {
  @ApiProperty({ description: '用户ID' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ description: '项目角色', example: 'ProjectManager' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  projectRole: string;

  @ApiPropertyOptional({ description: '权限级别', default: 'Member' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  permissionLevel?: string;

  @ApiPropertyOptional({ description: '数据范围', default: 'PROJECT' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  dataScope?: string;
}

export class UpdateMemberRoleDto {
  @ApiProperty({ description: '项目角色', example: 'ProjectManager' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  projectRole: string;
}
