import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class BeginFeishuLoginDto {
  @ApiPropertyOptional({ description: '登录成功后的站内路径' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^\/(?!\/)(?!.*[\\\r\n]).*$/)
  redirect?: string;
}

export class CompleteFeishuLoginDto {
  @ApiProperty({ description: '后端回调签发的一次性登录票据' })
  @IsString()
  @MinLength(32)
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9_-]+$/)
  ticket!: string;
}

export class FeishuOAuthCallbackDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  code?: string;

  @IsString()
  @MinLength(32)
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9_-]+$/)
  state!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  error?: string;
}
