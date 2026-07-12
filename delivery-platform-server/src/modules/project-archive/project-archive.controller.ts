import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import {
  ArchiveProjectItemDto,
  CreateTemporaryArchiveItemDto,
  SyncProjectArchiveTemplateDto,
} from './dto/project-archive.dto';
import { ProjectArchiveTargetService } from './project-archive-target.service';

@ApiTags('Project Archives')
@ApiBearerAuth('JWT-auth')
@Controller('projects/:projectId')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectArchiveTargetController {
  constructor(private readonly projectArchive: ProjectArchiveTargetService) {}

  @Get('archive-tree')
  @RequirePermissions({ all: ['archive:view'] })
  @ApiOperation({ summary: '获取项目档案两级快照树' })
  getArchiveTree(@Param('projectId') projectId: string, @CurrentUser() actor: JwtPayload) {
    return this.projectArchive.getArchiveTree(projectId, actor);
  }

  @Get('archive-template-diff')
  @RequirePermissions({ all: ['archive:view'] })
  @ApiOperation({ summary: '比较项目档案快照与模板当前发布版本' })
  getTemplateDiff(@Param('projectId') projectId: string, @CurrentUser() actor: JwtPayload) {
    return this.projectArchive.getTemplateDiff(projectId, actor);
  }

  @Post('archive-template-sync')
  @RequirePermissions({ all: ['archive:template:sync'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '确认后仅新增同步模板差异' })
  syncTemplateAdditions(
    @Param('projectId') projectId: string,
    @Body() dto: SyncProjectArchiveTemplateDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.projectArchive.syncTemplateAdditions(projectId, dto, actor);
  }

  @Post('archive-folders/:folderId/items')
  @RequirePermissions({ all: ['archive:item:create_temporary'] })
  @ApiOperation({ summary: '创建项目临时档案项' })
  createTemporaryItem(
    @Param('projectId') projectId: string,
    @Param('folderId') folderId: string,
    @Body() dto: CreateTemporaryArchiveItemDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.projectArchive.createTemporaryItem(projectId, folderId, dto, actor);
  }

  @Post('archive-items/:itemId/archive')
  @RequirePermissions({ all: ['archive:item:archive'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '软归档项目档案项' })
  archiveItem(
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @Body() dto: ArchiveProjectItemDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.projectArchive.archiveItem(projectId, itemId, dto ?? {}, actor);
  }

  @Post('archive-items/:itemId/restore')
  @RequirePermissions({ all: ['archive:item:archive'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '恢复已归档项目档案项' })
  restoreItem(
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @Body() dto: ArchiveProjectItemDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.projectArchive.restoreItem(projectId, itemId, dto ?? {}, actor);
  }
}
