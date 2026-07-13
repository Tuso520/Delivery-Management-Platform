import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { resolveFileUploadHardLimitBytes } from '../../config/file-processing.config';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import { UploadDraftFileDto } from './dto/upload-draft-file.dto';
import { UploadProjectArchiveFileDto } from './dto/upload-project-archive-file.dto';
import { UnifiedFileService } from './unified-file.service';

const hardUploadLimitBytes = resolveFileUploadHardLimitBytes();

function getSensitiveAccessContext(request: Request): {
  ipAddress?: string;
  userAgent?: string;
} {
  return {
    ipAddress: request.ip,
    userAgent: request.get('user-agent'),
  };
}

@ApiTags('Files')
@ApiBearerAuth('JWT-auth')
@Controller('files')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FileController {
  constructor(private readonly unifiedFiles: UnifiedFileService) {}

  @Post('drafts')
  @RequirePermissions({
    any: ['standard:create', 'standard:update_draft', 'knowledge:create', 'knowledge:update_draft'],
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // This is a deployment safety ceiling. The lower, editable business limit is
      // enforced by UnifiedFileService from system settings.
      limits: { fileSize: hardUploadLimitBytes },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传标准或知识条目的受控草稿文件版本' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: '8-100 characters; use the same key only when retrying the same upload',
  })
  uploadDraft(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDraftFileDto,
    @CurrentUser() actor: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!file) throw new BadRequestException('请选择要上传的文件');
    return this.unifiedFiles.uploadDraftFile(file, dto, actor, idempotencyKey);
  }

  @Get(':id')
  @RequirePermissions({
    any: [
      'file:preview',
      'standard:view',
      'knowledge:view',
      'file_review:view',
      'file_review:view_all',
      'file_review:manage',
    ],
  })
  @ApiOperation({ summary: '获取统一文件详情' })
  @ApiResponse({ status: 200, description: '文件详情' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  findOne(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.unifiedFiles.findById(id, actor);
  }

  @Get(':id/preview-session')
  @RequirePermissions({
    any: [
      'file:preview',
      'file:preview_pending',
      'standard:view',
      'knowledge:view',
      'file_review:view',
      'file_review:view_all',
      'file_review:manage',
      'file_review:act',
    ],
  })
  @ApiOperation({ summary: '创建只读文件预览会话' })
  createPreviewSession(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.unifiedFiles.createPreviewSession(id, actor);
  }

  @Get(':id/download')
  @RequirePermissions({
    any: ['file:download', 'standard:download', 'knowledge:download'],
  })
  @RawResponse()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '通过鉴权接口下载私有文件' })
  async download(
    @Param('id') id: string,
    @CurrentUser() actor: JwtPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const content = await this.unifiedFiles.download(id, actor, getSensitiveAccessContext(request));
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(content.fileName)}`,
    );
    return new StreamableFile(content.stream);
  }

  @Get(':id/versions')
  @RequirePermissions({
    any: [
      'file:preview_history',
      'standard:view',
      'knowledge:view',
      'file_review:view',
      'file_review:view_all',
      'file_review:manage',
    ],
  })
  @ApiOperation({ summary: '查询统一文件的不可变版本历史' })
  getVersions(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.unifiedFiles.getVersions(id, actor);
  }

  @Get(':id/thumbnail')
  @RequirePermissions({
    any: [
      'file:preview',
      'file:preview_pending',
      'standard:view',
      'knowledge:view',
      'file_review:view',
      'file_review:view_all',
      'file_review:manage',
    ],
  })
  @RawResponse()
  @ApiOperation({ summary: '获取统一文件缩略图' })
  async getThumbnail(
    @Param('id') id: string,
    @CurrentUser() actor: JwtPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    const thumbnail = await this.unifiedFiles.getThumbnail(id, actor);
    if (!thumbnail) {
      response.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    response.setHeader('Content-Type', thumbnail.mimeType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(thumbnail.fileName)}`,
    );
    return new StreamableFile(thumbnail.stream);
  }

  @Get(':id/processing-status')
  @RequirePermissions({
    any: [
      'file:preview',
      'file:preview_pending',
      'standard:view',
      'knowledge:view',
      'file_review:view',
      'file_review:view_all',
      'file_review:manage',
    ],
  })
  @ApiOperation({ summary: '查询统一文件的异步处理状态' })
  getProcessingStatus(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.unifiedFiles.getProcessingStatus(id, actor);
  }

  @Post(':id/archive')
  @RequirePermissions({ all: ['file:archive'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '软归档统一文件并保留全部版本' })
  archive(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.unifiedFiles.archive(id, actor);
  }
}

@ApiTags('Project Archive Files')
@ApiBearerAuth('JWT-auth')
@Controller('projects/:projectId/archive-items')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectArchiveFileController {
  constructor(private readonly unifiedFiles: UnifiedFileService) {}

  @Post(':itemId/files')
  @RequirePermissions({ all: ['archive:upload'] })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: hardUploadLimitBytes },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传、替换或新增项目档案文件版本' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: '8-100 characters; use the same key only when retrying the same upload',
  })
  upload(
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadProjectArchiveFileDto,
    @CurrentUser() actor: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!file) throw new BadRequestException('请选择要上传的文件');
    return this.unifiedFiles.uploadProjectArchiveFile(
      projectId,
      itemId,
      file,
      dto,
      actor,
      idempotencyKey,
    );
  }
}
