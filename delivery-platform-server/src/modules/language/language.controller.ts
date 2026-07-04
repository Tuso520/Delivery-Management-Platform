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

import { CreateLanguageDto } from './dto/create-language.dto';
import {
  CreateTranslationDto,
  UpdateTranslationDto,
  QueryTranslationDto,
} from './dto/translation.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';
import { LanguageService } from './language.service';


@ApiTags('Languages')
@ApiBearerAuth('JWT-auth')
@Controller('languages')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
export class LanguageController {
  constructor(private readonly languageService: LanguageService) {}

  @Get()
  @Permissions('language:view')
  @ApiOperation({ summary: '获取语言列表' })
  @ApiResponse({ status: 200, description: '语言列表' })
  async findAll() {
    return this.languageService.findAll();
  }

  @Post()
  @Permissions('language:create')
  @ApiOperation({ summary: '创建语言' })
  @ApiBody({ type: CreateLanguageDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 409, description: '语言代码已存在' })
  async create(@Body() dto: CreateLanguageDto) {
    return this.languageService.create(dto);
  }

  @Get(':id')
  @Permissions('language:view')
  @ApiOperation({ summary: '获取语言详情' })
  @ApiResponse({ status: 200, description: '语言详情' })
  @ApiResponse({ status: 404, description: '语言不存在' })
  async findOne(@Param('id') id: string) {
    return this.languageService.findById(id);
  }

  @Put(':id')
  @Permissions('language:update')
  @ApiOperation({ summary: '更新语言信息' })
  @ApiBody({ type: UpdateLanguageDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '语言不存在' })
  async update(@Param('id') id: string, @Body() dto: UpdateLanguageDto) {
    return this.languageService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('language:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '禁用语言（状态设为Inactive）' })
  @ApiResponse({ status: 200, description: '禁用成功' })
  @ApiResponse({ status: 404, description: '语言不存在' })
  async remove(@Param('id') id: string) {
    await this.languageService.delete(id);
    return null;
  }
}

@ApiTags('Translations')
@ApiBearerAuth('JWT-auth')
@Controller('translations')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('SUPER_ADMIN', 'SYSTEM_ADMIN', 'DELIVERY_MANAGER')
export class TranslationController {
  constructor(private readonly languageService: LanguageService) {}

  @Get()
  @Permissions('language:view')
  @ApiOperation({ summary: '获取翻译列表（按内容类型+内容ID）' })
  @ApiResponse({ status: 200, description: '翻译列表' })
  @ApiResponse({ status: 400, description: '缺少必要查询参数' })
  async findAll(
    @Query('contentType') contentType: string,
    @Query('contentId') contentId?: string,
    @Query('languageCode') languageCode?: string,
  ) {
    const query: QueryTranslationDto = { contentType, contentId, languageCode };
    return this.languageService.findTranslations(query);
  }

  @Post()
  @Permissions('language:create')
  @ApiOperation({ summary: '创建或更新翻译（upsert）' })
  @ApiBody({ type: CreateTranslationDto })
  @ApiResponse({ status: 201, description: '创建/更新成功' })
  async upsert(@Body() dto: CreateTranslationDto) {
    return this.languageService.upsertTranslation(dto);
  }

  @Put(':id')
  @Permissions('language:update')
  @ApiOperation({ summary: '更新翻译内容' })
  @ApiBody({ type: UpdateTranslationDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '翻译记录不存在' })
  async update(@Param('id') id: string, @Body() dto: UpdateTranslationDto) {
    return this.languageService.updateTranslation(id, dto);
  }

  @Delete(':id')
  @Permissions('language:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除翻译记录' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '翻译记录不存在' })
  async remove(@Param('id') id: string) {
    await this.languageService.deleteTranslation(id);
    return null;
  }
}
