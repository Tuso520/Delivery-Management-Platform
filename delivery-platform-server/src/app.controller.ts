import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: '健康检查' })
  health(): string {
    return this.appService.getHealth();
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: '就绪检查（数据库、缓存、文件存储）' })
  ready() {
    return this.appService.getReadiness();
  }
}
