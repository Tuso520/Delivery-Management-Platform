import {
  Body,
  Controller,
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
  CreateKnowledgeItemDto,
  CreateKnowledgeVersionDto,
  QueryKnowledgeItemDto,
  SubmitKnowledgeReviewDto,
  UpdateKnowledgeItemDto,
  UpdateKnowledgeVersionDto,
} from './dto/knowledge-item.dto';
import { KnowledgeItemService } from './knowledge-item.service';

@ApiTags('Knowledge Items')
@ApiBearerAuth('JWT-auth')
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class KnowledgeItemController {
  constructor(private readonly knowledgeItems: KnowledgeItemService) {}

  @Get('knowledge/summary')
  @RequirePermissions({ all: ['knowledge:view'] })
  @ApiOperation({ summary: '查询可见知识条目统计' })
  getSummary(@CurrentUser() actor: JwtPayload) {
    return this.knowledgeItems.getSummary(actor);
  }

  @Get('knowledge')
  @RequirePermissions({ all: ['knowledge:view'] })
  @ApiOperation({ summary: '查询统一知识条目列表' })
  @ApiPaginatedResponse('知识条目分页结果')
  findAll(@Query() query: QueryKnowledgeItemDto, @CurrentUser() actor: JwtPayload) {
    return this.knowledgeItems.findAll(query, actor);
  }

  @Get('knowledge/categories')
  @RequirePermissions({ all: ['knowledge:view'] })
  @ApiOperation({ summary: '查询可用知识分类树' })
  findCategories() {
    return this.knowledgeItems.findCategories();
  }

  @Post('knowledge')
  @RequirePermissions({ all: ['knowledge:create'] })
  @ApiOperation({ summary: '创建知识条目及首个草稿版本' })
  create(@Body() dto: CreateKnowledgeItemDto, @CurrentUser() actor: JwtPayload) {
    return this.knowledgeItems.create(dto, actor);
  }

  @Get('knowledge/:id')
  @RequirePermissions({ all: ['knowledge:view'] })
  @ApiOperation({ summary: '查询知识条目详情和可见版本' })
  findById(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.knowledgeItems.findById(id, actor);
  }

  @Patch('knowledge/:id')
  @RequirePermissions({ all: ['knowledge:update_draft'] })
  @ApiOperation({ summary: '更新知识主数据，不修改已发布版本' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeItemDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.knowledgeItems.update(id, dto, actor);
  }

  @Post('knowledge/:id/versions')
  @RequirePermissions({ all: ['knowledge:update_draft'] })
  @ApiOperation({ summary: '创建知识草稿版本并保留辅助文件版本' })
  createVersion(
    @Param('id') id: string,
    @Body() dto: CreateKnowledgeVersionDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.knowledgeItems.createVersion(id, dto, actor);
  }

  @Patch('knowledge-versions/:id')
  @RequirePermissions({ all: ['knowledge:update_draft'] })
  @ApiOperation({ summary: '更新草稿或已驳回的知识版本内容与辅助文件' })
  updateVersion(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeVersionDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.knowledgeItems.updateVersion(id, dto, actor);
  }

  @Post('knowledge-versions/:id/submit-review')
  @RequirePermissions({ all: ['knowledge:submit_review'] })
  @ApiOperation({ summary: '提交知识版本到统一审核' })
  submitReview(
    @Param('id') id: string,
    @Body() dto: SubmitKnowledgeReviewDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.knowledgeItems.submitReview(id, dto, actor);
  }

  @Post('knowledge/:id/archive')
  @RequirePermissions({ all: ['knowledge:archive'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '软归档知识条目并保留全部版本文件' })
  archive(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.knowledgeItems.archive(id, actor);
  }
}
