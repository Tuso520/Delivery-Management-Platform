import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AssignPermissionsDto {
  @ApiProperty({ description: '权限ID列表', type: [String] })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  permissionIds: string[];
}
