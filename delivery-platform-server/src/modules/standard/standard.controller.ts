import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import {
  CreateStandardDto,
  CreateStandardRelationDto,
  CreateStandardVersionDto,
  QueryStandardDto,
  SubmitStandardReviewDto,
  UpdateStandardDto,
} from './dto/standard.dto';
import { StandardService } from './standard.service';

@ApiTags('Standards')
@ApiBearerAuth('JWT-auth')
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StandardController {
  constructor(private readonly standards: StandardService) {}

  @Get('standards/summary')
  @RequirePermissions({ all: ['standard:view'] })
  @ApiOperation({ summary: '查询可见标准统计' })
  getSummary(@CurrentUser() actor: JwtPayload) {
    return this.standards.getSummary(actor);
  }

  @Get('standards')
  @RequirePermissions({ all: ['standard:view'] })
  @ApiOperation({ summary: '查询标准列表' })
  @ApiPaginatedResponse('标准分页结果')
  findAll(@Query() query: QueryStandardDto, @CurrentUser() actor: JwtPayload) {
    return this.standards.findAll(query, actor);
  }

  @Post('standards')
  @RequirePermissions({ all: ['standard:create'] })
  @ApiOperation({ summary: '创建标准及首个草稿版本' })
  create(@Body() dto: CreateStandardDto, @CurrentUser() actor: JwtPayload) {
    return this.standards.create(dto, actor);
  }

  @Get('standards/:id')
  @RequirePermissions({ all: ['standard:view'] })
  @ApiOperation({ summary: '查询标准详情和可见版本' })
  findById(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.standards.findById(id, actor);
  }

  @Patch('standards/:id')
  @RequirePermissions({ all: ['standard:update_draft'] })
  @ApiOperation({ summary: '更新标准主数据，不直接修改已发布版本' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStandardDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.standards.update(id, dto, actor);
  }

  @Post('standards/:id/versions')
  @RequirePermissions({ all: ['standard:update_draft'] })
  @ApiOperation({ summary: '从当前发布内容创建标准草稿版本' })
  createVersion(
    @Param('id') id: string,
    @Body() dto: CreateStandardVersionDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.standards.createVersion(id, dto, actor);
  }

  @Patch('standard-versions/:id')
  @RequirePermissions({ all: ['standard:update_draft'] })
  @ApiOperation({ summary: '更新草稿或已驳回的标准版本内容' })
  updateVersion(
    @Param('id') id: string,
    @Body() dto: CreateStandardVersionDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.standards.updateVersion(id, dto, actor);
  }

  @Post('standard-versions/:id/submit-review')
  @RequirePermissions({ all: ['standard:submit_review'] })
  @ApiOperation({ summary: '提交标准版本到统一审核' })
  submitReview(
    @Param('id') id: string,
    @Body() dto: SubmitStandardReviewDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.standards.submitReview(id, dto, actor);
  }

  @Get('standards/:id/relations')
  @RequirePermissions({ all: ['standard:view'] })
  @ApiOperation({ summary: '查询标准关系' })
  findRelations(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.standards.findRelations(id, actor);
  }

  @Post('standards/:id/relations')
  @RequirePermissions({ all: ['standard:update_draft'] })
  @ApiOperation({ summary: '创建标准关系' })
  createRelation(
    @Param('id') id: string,
    @Body() dto: CreateStandardRelationDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.standards.createRelation(id, dto, actor);
  }

  @Delete('standards/:id/relations/:relationId')
  @RequirePermissions({ all: ['standard:update_draft'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除标准关系' })
  async deleteRelation(
    @Param('id') id: string,
    @Param('relationId') relationId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    await this.standards.deleteRelation(id, relationId, actor);
    return null;
  }

  @Post('standards/:id/archive')
  @RequirePermissions({ all: ['standard:archive'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '软归档标准并保留发布历史' })
  archive(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.standards.archive(id, actor);
  }
}
