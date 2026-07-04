import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AssignRolesDto {
  @ApiProperty({ description: '角色ID列表', type: [String] })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  roleIds: string[];
}
