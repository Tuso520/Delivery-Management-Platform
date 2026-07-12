import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import { CountryService } from './country.service';
import { QueryCountryDto } from './dto/query-country.dto';

const COUNTRY_REFERENCE_PERMISSIONS = [
  'project:view',
  'project:create',
  'project:update',
  'archive_template:view',
  'archive_template:create',
  'archive_template:update_draft',
] as const;

@ApiTags('CountryReferences')
@ApiBearerAuth('JWT-auth')
@Controller('countries')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CountryController {
  constructor(private readonly countryService: CountryService) {}

  @Get()
  @RequirePermissions({ any: [...COUNTRY_REFERENCE_PERMISSIONS] })
  @ApiOperation({ summary: '获取项目和档案模板可选的国家基础数据' })
  @ApiPaginatedResponse('国家基础数据分页结果')
  findAll(@Query() query: QueryCountryDto) {
    return this.countryService.findAll(query);
  }
}
