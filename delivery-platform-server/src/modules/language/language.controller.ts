import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import { LanguageService } from './language.service';

const LANGUAGE_REFERENCE_PERMISSIONS = [
  'project:view',
  'project:create',
  'project:update',
  'archive_template:view',
  'archive_template:create',
  'archive_template:update_draft',
] as const;

@ApiTags('LanguageReferences')
@ApiBearerAuth('JWT-auth')
@Controller('languages')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LanguageController {
  constructor(private readonly languageService: LanguageService) {}

  @Get()
  @RequirePermissions({ any: [...LANGUAGE_REFERENCE_PERMISSIONS] })
  @ApiOperation({ summary: '获取项目和档案模板可选的语言基础数据' })
  @ApiResponse({ status: 200, description: '语言基础数据列表' })
  findAll() {
    return this.languageService.findAll();
  }
}
