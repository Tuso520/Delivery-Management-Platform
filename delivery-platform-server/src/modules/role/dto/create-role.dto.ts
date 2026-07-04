import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ description: '角色编码', example: 'PROJECT_MANAGER' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  roleCode: string;

  @ApiProperty({ description: '角色名称', example: '项目经理' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  roleName: string;

  @ApiPropertyOptional({ description: '角色描述' })
  @IsOptional()
  @IsString()
  description?: string;
}
