import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import { ArchiveTemplateVersionService } from './archive-template-version.service';
import {
  CreateArchiveTemplateVersionDto,
  SubmitArchiveTemplateVersionReviewDto,
  UpdateArchiveTemplateVersionDto,
} from './dto/archive-template-version.dto';

@ApiTags('Archive Template Versions')
@ApiBearerAuth('JWT-auth')
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ArchiveTemplateVersionController {
  constructor(private readonly versions: ArchiveTemplateVersionService) {}

  @Get('archive-templates/:id/versions')
  @RequirePermissions({ all: ['archive_template:view'] })
  @ApiOperation({ summary: '查询档案模板版本' })
  findVersions(@Param('id') templateId: string) {
    return this.versions.findVersions(templateId);
  }

  @Post('archive-templates/:id/versions')
  @RequirePermissions({ all: ['archive_template:update_draft'] })
  @ApiOperation({ summary: '从当前发布版本创建完整草稿副本' })
  createVersion(
    @Param('id') templateId: string,
    @Body() dto: CreateArchiveTemplateVersionDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.versions.createVersion(templateId, dto, userId);
  }

  @Get('archive-template-versions/:id')
  @RequirePermissions({ all: ['archive_template:view'] })
  @ApiOperation({ summary: '查询档案模板版本完整两级结构' })
  findVersion(@Param('id') versionId: string) {
    return this.versions.findVersion(versionId);
  }

  @Patch('archive-template-versions/:id')
  @RequirePermissions({ all: ['archive_template:update_draft'] })
  @ApiOperation({ summary: '替换草稿版本的文件夹和文件项快照' })
  replaceDraftStructure(
    @Param('id') versionId: string,
    @Body() dto: UpdateArchiveTemplateVersionDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.versions.replaceDraftStructure(versionId, dto, userId);
  }

  @Post('archive-template-versions/:id/submit-review')
  @RequirePermissions({ all: ['archive_template:submit_review'] })
  @ApiOperation({ summary: '提交档案模板版本审批' })
  submitReview(
    @Param('id') versionId: string,
    @Body() dto: SubmitArchiveTemplateVersionReviewDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.versions.submitReview(versionId, dto, userId);
  }

  @Post('archive-template-versions/:id/publish')
  @RequirePermissions({ all: ['file_review:act'] })
  @ApiOperation({ summary: '处理当前指派的档案模板统一审核步骤' })
  approveAssignedReviewStep(@Param('id') versionId: string, @CurrentUser() actor: JwtPayload) {
    return this.versions.approveAssignedReviewStep(versionId, actor);
  }

  @Post('archive-templates/:id/disable')
  @RequirePermissions({ all: ['archive_template:disable'] })
  @ApiOperation({ summary: '停用档案模板（保留历史发布版本）' })
  disable(@Param('id') templateId: string, @CurrentUser('sub') userId: string) {
    return this.versions.disable(templateId, userId);
  }
}
