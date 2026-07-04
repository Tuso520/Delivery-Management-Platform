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

import { CountryService } from './country.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { QueryCountryDto } from './dto/query-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';

@ApiTags('Countries')
@ApiBearerAuth('JWT-auth')
@Controller('countries')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
export class CountryController {
  constructor(private readonly countryService: CountryService) {}

  @Get()
  @Permissions('country:view')
  @ApiOperation({ summary: '获取国家列表（分页+搜索）' })
  @ApiResponse({
    status: 200,
    description: '国家列表',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: {
          list: [
            {
              id: 'uuid',
              countryCode: 'VN',
              nameZh: '越南',
              nameEn: 'Vietnam',
              defaultLanguage: 'vi',
              defaultCurrency: 'VND',
              timezone: 'Asia/Ho_Chi_Minh',
              weekendRule: 'Sat-Sun',
              status: 'Active',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  async findAll(@Query() query: QueryCountryDto) {
    return this.countryService.findAll(query);
  }

  @Post()
  @Permissions('country:create')
  @ApiOperation({ summary: '创建国家' })
  @ApiBody({ type: CreateCountryDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 409, description: '国家代码已存在' })
  async create(@Body() dto: CreateCountryDto) {
    return this.countryService.create(dto);
  }

  @Get(':id')
  @Permissions('country:view')
  @ApiOperation({ summary: '获取国家详情' })
  @ApiResponse({ status: 200, description: '国家详情' })
  @ApiResponse({ status: 404, description: '国家不存在' })
  async findOne(@Param('id') id: string) {
    return this.countryService.findById(id);
  }

  @Put(':id')
  @Permissions('country:update')
  @ApiOperation({ summary: '更新国家信息' })
  @ApiBody({ type: UpdateCountryDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '国家不存在' })
  async update(@Param('id') id: string, @Body() dto: UpdateCountryDto) {
    return this.countryService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('country:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '禁用国家（状态设为Inactive）' })
  @ApiResponse({
    status: 200,
    description: '禁用成功',
    schema: {
      example: {
        code: 0,
        message: 'success',
        data: null,
        timestamp: '2026-06-22T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: '国家不存在' })
  async remove(@Param('id') id: string) {
    await this.countryService.delete(id);
    return null;
  }
}
