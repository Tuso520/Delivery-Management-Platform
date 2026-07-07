import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Res,
  Req,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

import { UploadFileDto } from './dto/upload-file.dto';
import { FileService } from './file.service';

const FILE_API_BASE_PATH = '/api/v1/files';

@ApiTags('Files')
@ApiBearerAuth('JWT-auth')
@Controller('files')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post('upload')
  @Permissions('file:upload')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (_req, file, cb) => {
      const allowedTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'gif', 'zip', 'rar', 'dwg'];
      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (ext && allowedTypes.includes(ext)) {
        cb(null, true);
      } else {
        cb(new BadRequestException(`不支持的文件类型: .${ext}`), false);
      }
    },
  }))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '上传文件' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '文件内容',
        },
        projectId: {
          type: 'string',
          description: '关联项目ID',
        },
        archiveItemId: {
          type: 'string',
          description: '关联档案目录项ID（可选）',
        },
        remark: {
          type: 'string',
          description: '文件备注（可选）',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: '上传成功' })
  @ApiResponse({ status: 404, description: '项目或档案目录项不存在' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.fileService.upload(file, dto, user.sub);
  }

  @Get(':id')
  @Permissions('file:view')
  @ApiOperation({ summary: '获取文件详情' })
  @ApiResponse({ status: 200, description: '文件详情' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.fileService.findById(id, userId);
  }

  @Post(':id/preview-link')
  @Permissions('file:download')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '生成短时有效的项目档案文件预览链接' })
  async createPreviewLink(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const previewLink = await this.fileService.createPreviewLink(id, user.sub);
    return {
      url: `${FILE_API_BASE_PATH}/${id}/signed-preview?token=${encodeURIComponent(
        previewLink.token,
      )}`,
      expiresAt: previewLink.expiresAt,
    };
  }

  @Get(':id/signed-preview')
  @Public()
  @RawResponse()
  @ApiOperation({ summary: '通过短时签名链接打开项目档案文件预览页' })
  async getSignedPreviewPage(
    @Param('id') id: string,
    @Query('token') token: string,
    @Req() _request: Request,
    @Res() response: Response,
  ) {
    const contentUrl = `${FILE_API_BASE_PATH}/${id}/signed-content?token=${encodeURIComponent(
      token || '',
    )}`;
    const html = await this.fileService.getSignedPreviewPage(
      id,
      token,
      contentUrl,
    );
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.send(html);
  }

  @Get(':id/signed-content')
  @Public()
  @RawResponse()
  @ApiOperation({ summary: '通过短时签名链接读取项目档案文件流' })
  async getSignedContent(
    @Param('id') id: string,
    @Query('token') token: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const content = await this.fileService.getSignedContent(id, token);
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(content.fileName)}`,
    );
    return new StreamableFile(content.stream);
  }

  @Get(':id/download')
  @Permissions('file:download')
  @RawResponse()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '通过鉴权接口下载私有文件' })
  @ApiResponse({ status: 200, description: '文件流' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async download(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    const content = await this.fileService.download(id, user.sub);
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(content.fileName)}`,
    );
    return new StreamableFile(content.stream);
  }

  @Delete(':id')
  @Permissions('file:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除文件（软删除）' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async remove(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    await this.fileService.softDelete(id, userId);
    return null;
  }

  @Post(':id/set-current')
  @Permissions('file:set_current')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '设置文件为当前版本' })
  @ApiResponse({ status: 200, description: '设置成功' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async setCurrent(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.fileService.setCurrentVersion(id, userId);
  }
}

// Separate controller for archive-item scoped file endpoints
@ApiTags('Archive Files')
@ApiBearerAuth('JWT-auth')
@Controller('archive-items')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ArchiveFileController {
  constructor(private readonly fileService: FileService) {}

  @Get(':archiveItemId/files')
  @Permissions('file:view')
  @ApiOperation({ summary: '获取档案目录项下的所有文件' })
  @ApiResponse({ status: 200, description: '文件列表' })
  async findByArchiveItem(
    @Param('archiveItemId') archiveItemId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.fileService.findByArchiveItem(archiveItemId, userId);
  }
}
