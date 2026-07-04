import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';

import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { CurrencyService } from './currency.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';

@ApiTags('Currencies')
@ApiBearerAuth('JWT-auth')
@Controller('currencies')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Get()
  @Permissions('currency:view')
  @ApiOperation({ summary: '获取币种列表' })
  @ApiResponse({ status: 200, description: '币种列表' })
  async findAll() {
    return this.currencyService.findAll();
  }

  @Post()
  @Permissions('currency:create')
  @ApiOperation({ summary: '创建币种' })
  @ApiBody({ type: CreateCurrencyDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 409, description: '币种代码已存在' })
  async create(@Body() dto: CreateCurrencyDto) {
    return this.currencyService.create(dto);
  }

  @Get(':id')
  @Permissions('currency:view')
  @ApiOperation({ summary: '获取币种详情' })
  @ApiResponse({ status: 200, description: '币种详情' })
  @ApiResponse({ status: 404, description: '币种不存在' })
  async findOne(@Param('id') id: string) {
    return this.currencyService.findById(id);
  }

  @Put(':id')
  @Permissions('currency:update')
  @ApiOperation({ summary: '更新币种信息' })
  @ApiBody({ type: UpdateCurrencyDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '币种不存在' })
  async update(@Param('id') id: string, @Body() dto: UpdateCurrencyDto) {
    return this.currencyService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('currency:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '禁用币种（状态设为Inactive）' })
  @ApiResponse({ status: 200, description: '禁用成功' })
  @ApiResponse({ status: 404, description: '币种不存在' })
  async remove(@Param('id') id: string) {
    await this.currencyService.delete(id);
    return null;
  }
}

@ApiTags('Exchange Rates')
@ApiBearerAuth('JWT-auth')
@Controller('exchange-rates')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
export class ExchangeRateController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Get()
  @Permissions('currency:view')
  @ApiOperation({ summary: '获取汇率列表' })
  @ApiResponse({ status: 200, description: '汇率列表' })
  async findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.currencyService.getRates({ from, to });
  }

  @Post()
  @Permissions('currency:create')
  @ApiOperation({ summary: '添加汇率' })
  @ApiBody({ type: CreateExchangeRateDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  async create(
    @Body() dto: CreateExchangeRateDto,
  ) {
    return this.currencyService.addRate(dto);
  }

  @Post('sync')
  @Permissions('currency:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '从在线汇率服务同步最新汇率' })
  async sync(@Body('baseCurrency') baseCurrency?: string) {
    return this.currencyService.syncOnlineRates(baseCurrency || 'CNY');
  }

  @Put(':id/lock')
  @Permissions('currency:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '锁定汇率' })
  @ApiResponse({ status: 200, description: '锁定成功' })
  @ApiResponse({ status: 404, description: '汇率记录不存在' })
  async lock(@Param('id') id: string) {
    return this.currencyService.lockRate(id);
  }

  @Put(':id/unlock')
  @Permissions('currency:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '解锁汇率' })
  @ApiResponse({ status: 200, description: '解锁成功' })
  @ApiResponse({ status: 404, description: '汇率记录不存在' })
  async unlock(@Param('id') id: string) {
    return this.currencyService.unlockRate(id);
  }
}
