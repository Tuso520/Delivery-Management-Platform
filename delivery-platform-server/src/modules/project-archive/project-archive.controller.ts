import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

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
}
