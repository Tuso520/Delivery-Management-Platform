import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import { CurrencyService } from './currency.service';
import { UpdateCurrencyDto } from './dto/update-currency.dto';

@ApiTags('Currencies')
@ApiBearerAuth('JWT-auth')
@Controller('currencies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Get()
  @RequirePermissions({
    any: ['currency:view', 'currency:manage', 'project:view', 'project:create', 'project:update'],
  })
  @ApiOperation({ summary: '获取币种及当前人民币折算汇率' })
  @ApiResponse({ status: 200, description: '币种列表' })
  findAll() {
    return this.currencyService.findAll();
  }

  @Post('sync-rates')
  @RequirePermissions({ all: ['currency:manage'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '同步人民币基准汇率并跳过已锁定币种' })
  syncRates() {
    return this.currencyService.syncOnlineRates('CNY');
  }

  @Patch(':code')
  @RequirePermissions({ all: ['currency:manage'] })
  @ApiOperation({ summary: '按字段配置币种代码更新汇率元数据' })
  updateByCode(@Param('code') code: string, @Body() dto: UpdateCurrencyDto) {
    return this.currencyService.updateByCode(code, dto);
  }

  @Post(':code/lock')
  @RequirePermissions({ all: ['currency:manage'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '锁定币种人民币汇率' })
  lockByCode(@Param('code') code: string, @CurrentUser('sub') userId: string) {
    return this.currencyService.lockCurrencyRate(code, userId);
  }

  @Post(':code/unlock')
  @RequirePermissions({ all: ['currency:manage'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '解锁币种人民币汇率' })
  unlockByCode(@Param('code') code: string) {
    return this.currencyService.unlockCurrencyRate(code);
  }

}
