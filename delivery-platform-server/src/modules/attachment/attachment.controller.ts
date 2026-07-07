import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import { AttachmentService } from './attachment.service';
import {
  QueryAttachmentDto,
  UploadAttachmentDto,
} from './dto/attachment.dto';

const allowedExtensions = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'mp4',
  'mov',
  'webm',
  'md',
  'txt',
]);

const ATTACHMENT_API_BASE_PATH = '/api/v1/attachments';

@ApiTags('Attachments')
@ApiBearerAuth('JWT-auth')
@Controller('attachments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @Post()
  @Permissions('attachment:upload')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
        if (!allowedExtensions.has(extension)) {
          callback(
            new BadRequestException(`不支持的文件类型: .${extension}`),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传一个或多个通用附件' })
  async upload(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UploadAttachmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attachmentService.uploadMany(files ?? [], dto, user.sub);
  }

  @Get()
  @Permissions('attachment:view')
  @ApiOperation({ summary: '分页查询附件' })
  async findAll(
    @Query() query: QueryAttachmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attachmentService.findAll(query, user.sub);
  }

  @Get(':id/content')
  @Permissions('attachment:download')
  @RawResponse()
  @ApiOperation({ summary: '通过鉴权接口预览或下载私有附件' })
  async getContent(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const content = await this.attachmentService.getContent(id, user.sub, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(content.fileName)}`,
    );
    return new StreamableFile(content.stream);
  }

  @Get(':id/preview')
  @Permissions('attachment:download')
  @ApiOperation({ summary: '获取私有附件在线预览内容' })
  async getPreview(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.attachmentService.getPreview(id, user.sub, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  @Post(':id/preview-link')
  @Permissions('attachment:download')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '生成短时有效的附件预览链接' })
  async createPreviewLink(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const previewLink = await this.attachmentService.createPreviewLink(
      id,
      user.sub,
    );
    return {
      url: `${ATTACHMENT_API_BASE_PATH}/${id}/signed-preview?token=${encodeURIComponent(
        previewLink.token,
      )}`,
      expiresAt: previewLink.expiresAt,
    };
  }

  @Get(':id/signed-preview')
  @Public()
  @RawResponse()
  @ApiOperation({ summary: '通过短时签名链接打开附件预览页' })
  async getSignedPreviewPage(
    @Param('id') id: string,
    @Query('token') token: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const contentUrl = `${ATTACHMENT_API_BASE_PATH}/${id}/signed-content?token=${encodeURIComponent(
      token || '',
    )}`;
    const html = await this.attachmentService.getSignedPreviewPage(
      id,
      token,
      {
        ipAddress: request.ip,
        userAgent: request.get('user-agent'),
      },
      contentUrl,
    );
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.send(html);
  }

  @Get(':id/signed-content')
  @Public()
  @RawResponse()
  @ApiOperation({ summary: '通过短时签名链接读取附件预览文件流' })
  async getSignedContent(
    @Param('id') id: string,
    @Query('token') token: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const content = await this.attachmentService.getSignedContent(id, token);
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(content.fileName)}`,
    );
    return new StreamableFile(content.stream);
  }

  @Delete(':id')
  @Permissions('attachment:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '软删除附件' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<null> {
    await this.attachmentService.softDelete(id, user.sub);
    return null;
  }
}
