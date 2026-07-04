import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateRoleDto {
  @ApiPropertyOptional({ description: '角色名称', example: '项目经理' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  roleName?: string;

  @ApiPropertyOptional({ description: '角色描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '状态', example: 'Active' })
  @IsOptional()
  @IsString()
  status?: string;
}
